"""Unit tests for studies API – filter and pagination query-string behaviour."""
import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import date, datetime, timezone
from uuid import uuid4


def make_study_row(study_uid="1.2.840.test", deleted_at=None):
    row = MagicMock()
    row.id = uuid4()
    row.study_uid = study_uid
    row.orthanc_id = "oid-" + study_uid[-4:]
    row.patient_id = "P001"
    row.patient_name = "DOE^JOHN"
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
    row.raw_main_dicom_tags = {}
    row.ingested_at = datetime.now(timezone.utc)
    row.updated_at = datetime.now(timezone.utc)
    row.deleted_at = deleted_at
    row.series = []
    return row


def _make_mock_session(total: int, items: list):
    """Return a mock db session that answers two execute() calls: count then items."""
    mock_session = AsyncMock()
    count_result = MagicMock()
    count_result.scalar_one.return_value = total

    items_result = MagicMock()
    items_result.scalars.return_value.unique.return_value.all.return_value = items

    mock_session.execute = AsyncMock(side_effect=[count_result, items_result])
    return mock_session


@pytest.mark.asyncio
async def test_list_studies_pagination_page2():
    """page=2 should be accepted and return a valid 200."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db
    from unittest.mock import patch

    mock_session = _make_mock_session(total=0, items=[])

    async def override_db():
        yield mock_session

    app.dependency_overrides[get_db] = override_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        with patch("app.services.orthanc_poller.start_poller", new_callable=AsyncMock):
            resp = await ac.get("/studies?page=2&page_size=10")

    app.dependency_overrides.clear()

    assert resp.status_code == 200
    data = resp.json()
    assert data["page"] == 2
    assert data["page_size"] == 10


@pytest.mark.asyncio
async def test_list_studies_include_deleted_flag():
    """include_deleted=true should return studies with deleted_at set."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db
    from unittest.mock import patch

    deleted_study = make_study_row(deleted_at=datetime.now(timezone.utc))
    mock_session = _make_mock_session(total=1, items=[deleted_study])

    async def override_db():
        yield mock_session

    app.dependency_overrides[get_db] = override_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        with patch("app.services.orthanc_poller.start_poller", new_callable=AsyncMock):
            resp = await ac.get("/studies?include_deleted=true")

    app.dependency_overrides.clear()

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["deleted_at"] is not None


@pytest.mark.asyncio
async def test_list_studies_invalid_page_returns_422():
    """page=0 violates ge=1 constraint → 422."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from unittest.mock import patch

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        with patch("app.services.orthanc_poller.start_poller", new_callable=AsyncMock):
            resp = await ac.get("/studies?page=0")

    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_list_studies_page_size_over_200_returns_422():
    """page_size=201 violates le=200 constraint → 422."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from unittest.mock import patch

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        with patch("app.services.orthanc_poller.start_poller", new_callable=AsyncMock):
            resp = await ac.get("/studies?page_size=201")

    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_get_study_returns_series_and_instances():
    """GET /studies/{uid} should include series list in the response."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db
    from unittest.mock import patch

    study = make_study_row()
    # Add a mock series
    series = MagicMock()
    series.id = uuid4()
    series.series_uid = "1.2.840.series"
    series.orthanc_id = "series-oid"
    series.modality = "CT"
    series.series_number = 1
    series.series_description = "Chest"
    series.body_part_examined = "CHEST"
    series.protocol_name = "standard"
    series.num_instances = 20
    series.raw_main_dicom_tags = {}
    series.deleted_at = None
    series.instances = []
    study.series = [series]

    mock_session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = study
    mock_session.execute = AsyncMock(return_value=result)

    async def override_db():
        yield mock_session

    app.dependency_overrides[get_db] = override_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        with patch("app.services.orthanc_poller.start_poller", new_callable=AsyncMock):
            resp = await ac.get(f"/studies/{study.study_uid}")

    app.dependency_overrides.clear()

    assert resp.status_code == 200
    data = resp.json()
    assert data["study_uid"] == "1.2.840.test"
    assert len(data["series"]) == 1
    assert data["series"][0]["modality"] == "CT"
