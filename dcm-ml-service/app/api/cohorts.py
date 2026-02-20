from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from prometheus_client import Counter

from ..database import get_db
from ..models import CohortDefinition, Cohort
from ..schemas import (
    CohortDefinitionCreate, CohortDefinitionUpdate, CohortDefinitionOut,
    CohortMemberOut, ResolveResult,
)
from ..services.cohort_query import resolve_cohort
from ..services.orthanc_labeler import add_cohort_label, remove_cohort_label, get_cohort_members_from_orthanc, store_cohort_tags_as_metadata

router = APIRouter(prefix="/cohort-definitions", tags=["cohorts"])
members_router = APIRouter(prefix="/cohorts", tags=["cohorts"])

COHORT_MEMBERS = Counter("dcm_cohort_members_total", "Total cohort memberships created")


@router.get("", response_model=list[CohortDefinitionOut])
async def list_definitions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CohortDefinition).order_by(CohortDefinition.created_at.desc()))
    return result.scalars().all()


@router.post("", response_model=CohortDefinitionOut, status_code=201)
async def create_definition(body: CohortDefinitionCreate, db: AsyncSession = Depends(get_db)):
    defn = CohortDefinition(
        cohort_definition_name=body.cohort_definition_name,
        cohort_description=body.cohort_description,
        filters=body.filters,
        orthanc_tags=[t.model_dump() for t in body.orthanc_tags],
    )
    db.add(defn)
    await db.commit()
    await db.refresh(defn)
    return defn


@router.get("/{defn_id}", response_model=CohortDefinitionOut)
async def get_definition(defn_id: UUID, db: AsyncSession = Depends(get_db)):
    defn = await _get_defn_or_404(defn_id, db)
    return defn


@router.put("/{defn_id}", response_model=CohortDefinitionOut)
async def update_definition(defn_id: UUID, body: CohortDefinitionUpdate, db: AsyncSession = Depends(get_db)):
    defn = await _get_defn_or_404(defn_id, db)
    if body.cohort_definition_name is not None:
        defn.cohort_definition_name = body.cohort_definition_name
    if body.cohort_description is not None:
        defn.cohort_description = body.cohort_description
    if body.filters is not None:
        defn.filters = body.filters
    if body.orthanc_tags is not None:
        defn.orthanc_tags = [t.model_dump() for t in body.orthanc_tags]
    await db.commit()
    await db.refresh(defn)
    return defn


@router.delete("/{defn_id}", status_code=204)
async def delete_definition(defn_id: UUID, db: AsyncSession = Depends(get_db)):
    defn = await _get_defn_or_404(defn_id, db)

    # Remove Orthanc labels for all members before deleting
    result = await db.execute(select(Cohort).where(Cohort.cohort_definition_id == defn_id))
    members = result.scalars().all()
    for member in members:
        await remove_cohort_label(member.orthanc_study_id, defn_id)

    await db.delete(defn)
    await db.commit()


@router.post("/{defn_id}/resolve", response_model=ResolveResult)
async def resolve(defn_id: UUID, db: AsyncSession = Depends(get_db)):
    """Execute filters + orthanc_tags criteria, populate cohort membership, label Orthanc studies."""
    defn = await _get_defn_or_404(defn_id, db)

    matched = await resolve_cohort(defn.filters, defn.orthanc_tags, db)

    study_uids = []
    for row in matched:
        study_uid = row["study_uid"]
        orthanc_id = row["orthanc_study_id"]
        study_date = row["study_date"]
        raw_tags = row["raw_main_dicom_tags"]

        stmt = pg_insert(Cohort).values(
            cohort_definition_id=defn_id,
            subject_id=study_uid,
            orthanc_study_id=orthanc_id,
            cohort_start_date=study_date,
            orthanc_tags_snapshot=raw_tags or {},
        ).on_conflict_do_update(
            index_elements=["cohort_definition_id", "subject_id"],
            set_={"orthanc_tags_snapshot": raw_tags or {}},
        )
        await db.execute(stmt)

        # Write label and metadata back to Orthanc
        await add_cohort_label(orthanc_id, defn_id)
        await store_cohort_tags_as_metadata(orthanc_id, defn.orthanc_tags)

        study_uids.append(study_uid)
        COHORT_MEMBERS.inc()

    await db.commit()

    return ResolveResult(
        cohort_definition_id=defn_id,
        matched_count=len(study_uids),
        study_uids=study_uids,
    )


# ── Cohort membership endpoints ───────────────────────────────────────────────

@members_router.get("/{defn_id}", response_model=list[CohortMemberOut])
async def list_members(defn_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Cohort).where(Cohort.cohort_definition_id == defn_id)
    )
    return result.scalars().all()


@members_router.delete("/{defn_id}/{subject_id}", status_code=204)
async def remove_member(defn_id: UUID, subject_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Cohort).where(
            Cohort.cohort_definition_id == defn_id,
            Cohort.subject_id == subject_id,
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    await remove_cohort_label(member.orthanc_study_id, defn_id)
    await db.delete(member)
    await db.commit()


@members_router.get("/{defn_id}/orthanc", response_model=list[str])
async def cohort_from_orthanc(defn_id: UUID):
    """Re-fetch cohort member Orthanc IDs directly from Orthanc labels (sync check)."""
    return await get_cohort_members_from_orthanc(defn_id)


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_defn_or_404(defn_id: UUID, db: AsyncSession) -> CohortDefinition:
    result = await db.execute(
        select(CohortDefinition).where(CohortDefinition.cohort_definition_id == defn_id)
    )
    defn = result.scalar_one_or_none()
    if defn is None:
        raise HTTPException(status_code=404, detail="Cohort definition not found")
    return defn
