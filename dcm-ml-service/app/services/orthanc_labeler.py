"""Manage Orthanc study labels and metadata for cohort membership."""
import json
import logging
from uuid import UUID

import httpx
from ..config import settings

logger = logging.getLogger(__name__)


def _make_client() -> httpx.AsyncClient:
    auth = None
    if settings.orthanc_user:
        auth = (settings.orthanc_user, settings.orthanc_pass)
    return httpx.AsyncClient(base_url=settings.orthanc_url, auth=auth, timeout=30.0)


def _label(cohort_id: UUID) -> str:
    return f"cohort:{cohort_id}"


async def add_cohort_label(orthanc_study_id: str, cohort_id: UUID) -> None:
    """Write label cohort:<uuid> onto an Orthanc study (Orthanc ≥ 1.12)."""
    label = _label(cohort_id)
    async with _make_client() as client:
        r = await client.put(f"/studies/{orthanc_study_id}/labels/{label}")
        if r.status_code not in (200, 201):
            logger.warning("Failed to set label %s on study %s: HTTP %s", label, orthanc_study_id, r.status_code)


async def remove_cohort_label(orthanc_study_id: str, cohort_id: UUID) -> None:
    """Remove a cohort label from an Orthanc study."""
    label = _label(cohort_id)
    async with _make_client() as client:
        r = await client.delete(f"/studies/{orthanc_study_id}/labels/{label}")
        if r.status_code not in (200, 404):
            logger.warning("Failed to remove label %s from study %s: HTTP %s", label, orthanc_study_id, r.status_code)


async def get_cohort_members_from_orthanc(cohort_id: UUID) -> list[str]:
    """Return all Orthanc study IDs that carry a cohort label (source-of-truth check)."""
    async with _make_client() as client:
        r = await client.post("/tools/find", json={
            "Level": "Study",
            "Labels": [_label(cohort_id)],
            "LabelsConstraint": "All",
            "Expand": False,
        })
        if r.status_code != 200:
            logger.warning("Orthanc /tools/find failed: HTTP %s", r.status_code)
            return []
        return r.json()


async def store_cohort_tags_as_metadata(orthanc_study_id: str, cohort_tags: list[dict]) -> None:
    """Store cohort definition tag criteria as private Orthanc metadata (key 4000)."""
    async with _make_client() as client:
        r = await client.put(
            f"/studies/{orthanc_study_id}/metadata/4000",
            content=json.dumps(cohort_tags),
            headers={"Content-Type": "text/plain"},
        )
        if r.status_code not in (200, 201):
            logger.warning("Failed to set metadata 4000 on study %s: HTTP %s", orthanc_study_id, r.status_code)
