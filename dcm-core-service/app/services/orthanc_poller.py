"""Background asyncio task: poll Orthanc /changes and dispatch events."""
import asyncio
import logging
import time as _time

from prometheus_client import Counter, Gauge
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from . import orthanc_client
from .metadata_ingester import ingest_study
from .delete_handler import soft_delete_study
from ..database import AsyncSessionLocal
from ..models import PollerState

logger = logging.getLogger(__name__)

STUDIES_INGESTED = Counter("dcm_studies_ingested_total", "Total studies ingested from Orthanc")
STUDIES_DELETED = Counter("dcm_studies_deleted_total", "Total studies soft-deleted")
POLLER_LAST_SEQ = Gauge("dcm_poller_last_seq", "Last Orthanc change sequence processed")
POLLER_LAG = Gauge("dcm_poller_lag_seconds", "Seconds since last successful poll")

_HANDLED_TYPES = {"StableStudy", "DeletedStudy"}


async def _get_last_seq(db: AsyncSession) -> int:
    result = await db.execute(select(PollerState).where(PollerState.id == 1))
    row = result.scalar_one_or_none()
    return row.last_seq if row else 0


async def _save_last_seq(seq: int, db: AsyncSession) -> None:
    await db.execute(
        update(PollerState).where(PollerState.id == 1).values(last_seq=seq)
    )
    await db.commit()


async def _dispatch(change: dict, db: AsyncSession) -> None:
    change_type = change.get("ChangeType", "")
    resource_id = change.get("ID", "")

    if change_type == "StableStudy":
        logger.info("StableStudy event for %s — ingesting", resource_id)
        await ingest_study(resource_id, db)
        STUDIES_INGESTED.inc()

    elif change_type == "DeletedStudy":
        logger.info("DeletedStudy event for %s — soft-deleting", resource_id)
        await soft_delete_study(resource_id, db)
        STUDIES_DELETED.inc()


async def start_poller(poll_interval: int = 5) -> None:
    """Main polling loop. Runs forever as a background asyncio task."""
    logger.info("Orthanc change poller starting (interval=%ss)", poll_interval)

    async with AsyncSessionLocal() as db:
        seq = await _get_last_seq(db)

    logger.info("Resuming from Orthanc change sequence %d", seq)

    last_successful_poll = _time.monotonic()

    while True:
        try:
            changes = await orthanc_client.get(f"/changes?since={seq}&limit=100")
            last_successful_poll = _time.monotonic()
            POLLER_LAG.set(0)

            for change in changes.get("Changes", []):
                if change.get("ChangeType") in _HANDLED_TYPES:
                    async with AsyncSessionLocal() as db:
                        await _dispatch(change, db)

            new_seq: int = changes.get("Last", seq)
            if new_seq != seq:
                async with AsyncSessionLocal() as db:
                    await _save_last_seq(new_seq, db)
                seq = new_seq
                POLLER_LAST_SEQ.set(seq)

            if changes.get("Done"):
                await asyncio.sleep(poll_interval)
        except asyncio.CancelledError:
            logger.info("Poller cancelled — shutting down")
            return
        except Exception as exc:
            logger.error("Poller error: %s", exc, exc_info=True)
            POLLER_LAG.set(_time.monotonic() - last_successful_poll)
            await asyncio.sleep(poll_interval)
