from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Study, Series
from ..schemas import StudyOut, StudyListOut


def _parse_query_date(val: Optional[str]) -> Optional[date]:
    """Parse an ISO-format date string from a query parameter, returning None on failure."""
    if not val:
        return None
    try:
        return date.fromisoformat(val)
    except ValueError:
        return None

router = APIRouter(prefix="/studies", tags=["studies"])


@router.get("", response_model=StudyListOut)
async def list_studies(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    modality: Optional[str] = None,
    patient_sex: Optional[str] = None,
    study_date_from: Optional[str] = None,
    study_date_to: Optional[str] = None,
    institution_name: Optional[str] = None,
    include_deleted: bool = False,
    db: AsyncSession = Depends(get_db),
):
    q = select(Study).options(selectinload(Study.series))

    if not include_deleted:
        q = q.where(Study.deleted_at.is_(None))

    if patient_sex:
        q = q.where(Study.patient_sex == patient_sex.upper()[:1])

    parsed_from = _parse_query_date(study_date_from)
    if parsed_from:
        q = q.where(Study.study_date >= parsed_from)

    parsed_to = _parse_query_date(study_date_to)
    if parsed_to:
        q = q.where(Study.study_date <= parsed_to)

    if institution_name:
        q = q.where(Study.institution_name.ilike(f"%{institution_name}%"))

    if modality:
        q = q.join(Series, Series.study_id == Study.id)
        q = q.where(Series.modality.ilike(modality))
        q = q.distinct()

    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar_one()

    q = q.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    studies = result.scalars().unique().all()

    return StudyListOut(total=total, page=page, page_size=page_size, items=list(studies))


@router.get("/{study_uid}", response_model=StudyOut)
async def get_study(study_uid: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Study)
        .options(selectinload(Study.series).selectinload(Series.instances))
        .where(Study.study_uid == study_uid)
    )
    study = result.scalar_one_or_none()
    if study is None:
        raise HTTPException(status_code=404, detail="Study not found")
    return study
