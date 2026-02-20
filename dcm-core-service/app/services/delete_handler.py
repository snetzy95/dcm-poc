"""Soft-delete studies and their children when Orthanc reports a DeletedStudy event."""
import logging
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Study, Series, Instance

logger = logging.getLogger(__name__)


async def soft_delete_study(orthanc_study_id: str, db: AsyncSession) -> None:
    """Mark a study and all its series/instances as deleted."""
    result = await db.execute(select(Study).where(Study.orthanc_id == orthanc_study_id))
    study = result.scalar_one_or_none()

    if study is None:
        logger.info("DeletedStudy event for unknown orthanc_id %s — skipping", orthanc_study_id)
        return

    now = datetime.now(timezone.utc)
    study.deleted_at = now

    for series in study.series:
        series.deleted_at = now
        for instance in series.instances:
            instance.deleted_at = now

    await db.commit()
    logger.info("Soft-deleted study %s (orthanc_id=%s)", study.study_uid, orthanc_study_id)
