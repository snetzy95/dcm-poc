"""Dynamic SQLAlchemy query builder for cohort resolution.

The `studies`, `series` and `instances` tables are managed by dcm-core-service
but live in the same PostgreSQL database. We query them directly (read-only).
"""
from datetime import date
from typing import Any, Optional

from sqlalchemy import Column, Date, Text, Integer, DateTime
from sqlalchemy import select, func, distinct, cast
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import Table, MetaData

# Reflect the tables lazily via SQLAlchemy core (no ORM model duplication)
_metadata = MetaData()

# Declare lightweight Table objects matching the core-service schema
studies_table = Table(
    "studies", _metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("study_uid", Text),
    Column("orthanc_id", Text),
    Column("patient_id", Text),
    Column("patient_name", Text),
    Column("patient_birth_date", Date),
    Column("patient_sex", Text),
    Column("study_date", Date),
    Column("institution_name", Text),
    Column("raw_main_dicom_tags", JSONB),
    Column("deleted_at", DateTime(timezone=True)),
)

series_table = Table(
    "series", _metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("study_id", UUID(as_uuid=True)),
    Column("modality", Text),
    Column("body_part_examined", Text),
    Column("raw_main_dicom_tags", JSONB),
    Column("deleted_at", DateTime(timezone=True)),
)


def _safe_date(val: Any) -> Optional[date]:
    if isinstance(val, date):
        return val
    if isinstance(val, str) and val:
        try:
            return date.fromisoformat(val)
        except ValueError:
            pass
    return None


async def resolve_cohort(filters: dict, orthanc_tags: list[dict], db: AsyncSession) -> list[dict]:
    """
    Execute cohort filters against the PG studies/series tables.

    Returns list of dicts: [{study_uid, orthanc_study_id, study_date, raw_main_dicom_tags}]
    """
    q = (
        select(
            studies_table.c.study_uid,
            studies_table.c.orthanc_id.label("orthanc_study_id"),
            studies_table.c.study_date,
            studies_table.c.raw_main_dicom_tags,
        )
        .where(studies_table.c.deleted_at.is_(None))
        .distinct()
    )

    need_series_join = False

    # ── Structured filters ──────────────────────────────────────────────────
    if study_date_from := _safe_date(filters.get("study_date_from")):
        q = q.where(studies_table.c.study_date >= study_date_from)

    if study_date_to := _safe_date(filters.get("study_date_to")):
        q = q.where(studies_table.c.study_date <= study_date_to)

    if patient_sex := filters.get("patient_sex"):
        q = q.where(studies_table.c.patient_sex == str(patient_sex).upper()[:1])

    if institution := filters.get("institution_name"):
        q = q.where(studies_table.c.institution_name.ilike(f"%{institution}%"))

    if age_min := filters.get("patient_age_min"):
        age_expr = func.extract("year", func.age(func.now(), studies_table.c.patient_birth_date))
        q = q.where(age_expr >= int(age_min))

    if age_max := filters.get("patient_age_max"):
        age_expr = func.extract("year", func.age(func.now(), studies_table.c.patient_birth_date))
        q = q.where(age_expr <= int(age_max))

    if modalities := filters.get("modalities"):
        need_series_join = True
        q = q.where(series_table.c.modality.in_([m.upper() for m in modalities]))

    if body_part := filters.get("body_part_examined"):
        need_series_join = True
        q = q.where(series_table.c.body_part_examined.ilike(f"%{body_part}%"))

    # ── Orthanc tag criteria (applied via raw_main_dicom_tags JSONB) ────────
    for tag_criterion in orthanc_tags:
        tag_key = tag_criterion.get("tag", "")
        tag_value = tag_criterion.get("value", "")
        if tag_key and tag_value:
            # Check both studies raw tags and series raw tags
            # Study-level tags (MainDicomTags + PatientMainDicomTags merged)
            q = q.where(
                (studies_table.c.raw_main_dicom_tags[tag_key].as_string() == tag_value)
                |
                # Also check series-level raw tags for series-level tag criteria
                (studies_table.c.id.in_(
                    select(series_table.c.study_id).where(
                        series_table.c.raw_main_dicom_tags[tag_key].as_string() == tag_value
                    ).where(series_table.c.deleted_at.is_(None))
                ))
            )

    if need_series_join:
        q = q.join(series_table, series_table.c.study_id == studies_table.c.id)
        q = q.where(series_table.c.deleted_at.is_(None))

    result = await db.execute(q.limit(10000))
    rows = result.mappings().all()
    return [dict(r) for r in rows]
