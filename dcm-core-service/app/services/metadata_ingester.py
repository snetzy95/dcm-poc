"""Fetch DICOM metadata from Orthanc and upsert into PostgreSQL."""
import logging
from datetime import date, time, datetime
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from . import orthanc_client
from ..models import Study, Series, Instance

logger = logging.getLogger(__name__)


def _safe_int(val) -> Optional[int]:
    try:
        return int(val) if val else None
    except (ValueError, TypeError):
        return None


def _parse_date(val: Optional[str]) -> Optional[date]:
    if not val or len(val) < 8:
        return None
    try:
        return date(int(val[0:4]), int(val[4:6]), int(val[6:8]))
    except (ValueError, IndexError):
        return None


def _parse_time(val: Optional[str]) -> Optional[time]:
    if not val or len(val) < 4:
        return None
    try:
        h = int(val[0:2])
        m = int(val[2:4])
        s = int(val[4:6]) if len(val) >= 6 else 0
        return time(h, m, s)
    except (ValueError, IndexError):
        return None


async def ingest_study(orthanc_study_id: str, db: AsyncSession) -> None:
    """Fetch study metadata from Orthanc and upsert into PG."""
    try:
        study_data = await orthanc_client.get(f"/studies/{orthanc_study_id}")
    except Exception as exc:
        logger.warning("Failed to fetch study %s from Orthanc: %s", orthanc_study_id, exc)
        return

    tags = study_data.get("MainDicomTags", {})
    patient_tags = study_data.get("PatientMainDicomTags", {})

    # Merge all tags into raw snapshot
    raw_tags = {**tags, **patient_tags}

    study_uid = tags.get("StudyInstanceUID", "")
    if not study_uid:
        logger.warning("Study %s has no StudyInstanceUID, skipping", orthanc_study_id)
        return

    series_ids: list[str] = study_data.get("Series", [])

    study_values = dict(
        study_uid=study_uid,
        orthanc_id=orthanc_study_id,
        patient_id=patient_tags.get("PatientID"),
        patient_name=patient_tags.get("PatientName"),
        patient_birth_date=_parse_date(patient_tags.get("PatientBirthDate")),
        patient_sex=(patient_tags.get("PatientSex") or "")[:1] or None,
        study_date=_parse_date(tags.get("StudyDate")),
        study_time=_parse_time(tags.get("StudyTime")),
        study_description=tags.get("StudyDescription"),
        accession_number=tags.get("AccessionNumber"),
        referring_physician=tags.get("ReferringPhysicianName"),
        institution_name=tags.get("InstitutionName"),
        num_series=len(series_ids),
        raw_main_dicom_tags=raw_tags,
        deleted_at=None,
    )

    stmt = pg_insert(Study).values(**study_values)
    stmt = stmt.on_conflict_do_update(
        index_elements=["study_uid"],
        set_={k: stmt.excluded[k] for k in study_values if k != "study_uid"},
    )
    await db.execute(stmt)
    await db.flush()

    # Fetch the study row to get its PK
    result = await db.execute(select(Study).where(Study.study_uid == study_uid))
    study_row = result.scalar_one()

    # Ingest all series
    instance_count = 0
    for series_orthanc_id in series_ids:
        n = await _ingest_series(series_orthanc_id, study_row.id, db)
        instance_count += n

    # Update counts
    study_row.num_instances = instance_count
    await db.commit()
    logger.info("Ingested study %s (%s series, %s instances)", study_uid, len(series_ids), instance_count)


async def _ingest_series(orthanc_series_id: str, study_pk, db: AsyncSession) -> int:
    try:
        series_data = await orthanc_client.get(f"/series/{orthanc_series_id}")
    except Exception as exc:
        logger.warning("Failed to fetch series %s: %s", orthanc_series_id, exc)
        return 0

    tags = series_data.get("MainDicomTags", {})
    instance_ids: list[str] = series_data.get("Instances", [])

    series_uid = tags.get("SeriesInstanceUID", "")
    if not series_uid:
        return 0

    series_values = dict(
        series_uid=series_uid,
        orthanc_id=orthanc_series_id,
        study_id=study_pk,
        modality=tags.get("Modality"),
        series_number=_safe_int(tags.get("SeriesNumber")),
        series_description=tags.get("SeriesDescription"),
        body_part_examined=tags.get("BodyPartExamined"),
        protocol_name=tags.get("ProtocolName"),
        num_instances=len(instance_ids),
        raw_main_dicom_tags=tags,
        deleted_at=None,
    )

    stmt = pg_insert(Series).values(**series_values)
    stmt = stmt.on_conflict_do_update(
        index_elements=["series_uid"],
        set_={k: stmt.excluded[k] for k in series_values if k != "series_uid"},
    )
    await db.execute(stmt)
    await db.flush()

    result = await db.execute(select(Series).where(Series.series_uid == series_uid))
    series_row = result.scalar_one()

    for inst_orthanc_id in instance_ids:
        await _ingest_instance(inst_orthanc_id, series_row.id, db)

    return len(instance_ids)


async def _ingest_instance(orthanc_instance_id: str, series_pk, db: AsyncSession) -> None:
    try:
        inst_data = await orthanc_client.get(f"/instances/{orthanc_instance_id}")
    except Exception as exc:
        logger.warning("Failed to fetch instance %s: %s", orthanc_instance_id, exc)
        return

    tags = inst_data.get("MainDicomTags", {})
    sop_uid = tags.get("SOPInstanceUID", "")
    if not sop_uid:
        return

    inst_values = dict(
        sop_instance_uid=sop_uid,
        orthanc_id=orthanc_instance_id,
        series_id=series_pk,
        instance_number=_safe_int(tags.get("InstanceNumber")),
        sop_class_uid=tags.get("SOPClassUID"),
        transfer_syntax_uid=inst_data.get("FileMetaInformation", {}).get("TransferSyntaxUID"),
        raw_main_dicom_tags=tags,
        deleted_at=None,
    )

    stmt = pg_insert(Instance).values(**inst_values)
    stmt = stmt.on_conflict_do_update(
        index_elements=["sop_instance_uid"],
        set_={k: stmt.excluded[k] for k in inst_values if k != "sop_instance_uid"},
    )
    await db.execute(stmt)
