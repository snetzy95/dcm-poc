"""Unit tests for the Orthanc webhook endpoint."""
import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_webhook_stable_study_calls_ingest():
    """StableStudy event should trigger ingest_study."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    db = AsyncMock()

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db

    payload = {
        "ChangeType": "StableStudy",
        "ID": "orthanc-abc",
        "Path": "/studies/orthanc-abc",
        "ResourceType": "Study",
        "Date": "20230615T120000",
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        with patch("app.services.orthanc_poller.start_poller", new_callable=AsyncMock):
            with patch("app.api.webhook.ingest_study", new_callable=AsyncMock) as mock_ingest:
                resp = await ac.post("/webhook/orthanc", json=payload)

    app.dependency_overrides.clear()

    assert resp.status_code == 200
    data = resp.json()
    assert data["received"] == "StableStudy"
    assert data["id"] == "orthanc-abc"
    mock_ingest.assert_awaited_once_with("orthanc-abc", db)


@pytest.mark.asyncio
async def test_webhook_deleted_study_calls_soft_delete():
    """DeletedStudy event should trigger soft_delete_study."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    db = AsyncMock()

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db

    payload = {
        "ChangeType": "DeletedStudy",
        "ID": "orthanc-del",
        "Path": "/studies/orthanc-del",
        "ResourceType": "Study",
        "Date": "20230616T090000",
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        with patch("app.services.orthanc_poller.start_poller", new_callable=AsyncMock):
            with patch("app.api.webhook.soft_delete_study", new_callable=AsyncMock) as mock_delete:
                resp = await ac.post("/webhook/orthanc", json=payload)

    app.dependency_overrides.clear()

    assert resp.status_code == 200
    data = resp.json()
    assert data["received"] == "DeletedStudy"
    mock_delete.assert_awaited_once_with("orthanc-del", db)


@pytest.mark.asyncio
async def test_webhook_unknown_change_type_is_ignored():
    """Unknown ChangeType events should return 200 without calling handlers."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    db = AsyncMock()

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db

    payload = {
        "ChangeType": "NewInstance",
        "ID": "instance-xyz",
        "Path": "/instances/instance-xyz",
        "ResourceType": "Instance",
        "Date": "20230615T120000",
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        with patch("app.services.orthanc_poller.start_poller", new_callable=AsyncMock):
            with patch("app.api.webhook.ingest_study", new_callable=AsyncMock) as mock_ingest:
                with patch("app.api.webhook.soft_delete_study", new_callable=AsyncMock) as mock_delete:
                    resp = await ac.post("/webhook/orthanc", json=payload)

    app.dependency_overrides.clear()

    assert resp.status_code == 200
    mock_ingest.assert_not_awaited()
    mock_delete.assert_not_awaited()


@pytest.mark.asyncio
async def test_webhook_missing_required_field_returns_422():
    """Malformed event (missing required fields) should return 422."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    payload = {"ChangeType": "StableStudy"}  # missing ID, Path, ResourceType, Date

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        with patch("app.services.orthanc_poller.start_poller", new_callable=AsyncMock):
            resp = await ac.post("/webhook/orthanc", json=payload)

    assert resp.status_code == 422
