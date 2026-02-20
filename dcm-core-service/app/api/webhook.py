"""Optional Orthanc webhook receiver (fallback to poller — not required)."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..schemas import OrthancChangeEvent
from ..services.metadata_ingester import ingest_study
from ..services.delete_handler import soft_delete_study

router = APIRouter(prefix="/webhook", tags=["webhook"])


@router.post("/orthanc")
async def orthanc_change(event: OrthancChangeEvent, db: AsyncSession = Depends(get_db)):
    """Receive an Orthanc change event (if configured in orthanc.json)."""
    if event.ChangeType == "StableStudy":
        await ingest_study(event.ID, db)
    elif event.ChangeType == "DeletedStudy":
        await soft_delete_study(event.ID, db)
    return {"received": event.ChangeType, "id": event.ID}
