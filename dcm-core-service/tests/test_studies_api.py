"""Unit tests for the studies API endpoints."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from datetime import date, datetime, timezone


# ── Helpers ──────────────────────────────────────────────────────────────────

def make_study_row(
    study_uid="1.2.840.test",
    orthanc_id="abc123",
    patient_name="DOE^JOHN",
    deleted_at=None,
):
    row = MagicMock()
    row.id = uuid4()
    row.study_uid = study_uid
    row.orthanc_id = orthanc_id
    row.patient_id = "P001"
    row.patient_name = patient_name
    row.patient_birth_date = date(1980, 1, 1)
    row.patient_sex = "M"
    row.study_date = date(2023, 6, 15)
    row.study_time = None
    row.study_description = "Chest CT"
    row.accession_number = "ACC001"
    row.referring_physician = None
    row.institution_name = "General Hospital"
    row.num_series = 2
    row.num_instances = 40
    row.raw_main_dicom_tags = {"0008,0060": "CT"}
    row.ingested_at = datetime.now(timezone.utc)
    row.updated_at = datetime.now(timezone.utc)
    row.deleted_at = deleted_at
    row.series = []
    return row


# ── Tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_health():
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        with patch("app.services.orthanc_poller.start_poller", new_callable=AsyncMock):
            resp = await ac.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_list_studies_empty():
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    mock_session = AsyncMock()
    # scalars().unique().all() returns []
    execute_result = MagicMock()
    execute_result.scalars.return_value.unique.return_value.all.return_value = []
    execute_result.scalar_one.return_value = 0
    mock_session.execute = AsyncMock(return_value=execute_result)

    async def override_db():
        yield mock_session

    app.dependency_overrides[get_db] = override_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        with patch("app.services.orthanc_poller.start_poller", new_callable=AsyncMock):
            resp = await ac.get("/studies")

    app.dependency_overrides.clear()

    assert resp.status_code == 200
    data = resp.json()
    assert "total" in data
    assert "items" in data
    assert isinstance(data["items"], list)


@pytest.mark.asyncio
async def test_get_study_not_found():
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    mock_session = AsyncMock()
    execute_result = MagicMock()
    execute_result.scalar_one_or_none.return_value = None
    mock_session.execute = AsyncMock(return_value=execute_result)

    async def override_db():
        yield mock_session

    app.dependency_overrides[get_db] = override_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        with patch("app.services.orthanc_poller.start_poller", new_callable=AsyncMock):
            resp = await ac.get("/studies/1.2.840.nonexistent")

    app.dependency_overrides.clear()

    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_list_studies_returns_items():
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    study = make_study_row()
    mock_session = AsyncMock()

    # First execute = total count, second execute = paginated items
    count_result = MagicMock()
    count_result.scalar_one.return_value = 1

    items_result = MagicMock()
    items_result.scalars.return_value.unique.return_value.all.return_value = [study]

    mock_session.execute = AsyncMock(side_effect=[count_result, items_result])

    async def override_db():
        yield mock_session

    app.dependency_overrides[get_db] = override_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        with patch("app.services.orthanc_poller.start_poller", new_callable=AsyncMock):
            resp = await ac.get("/studies")

    app.dependency_overrides.clear()

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["study_uid"] == "1.2.840.test"
