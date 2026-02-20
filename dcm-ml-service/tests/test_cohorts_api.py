"""Unit tests for cohort-definition endpoints."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from datetime import datetime, timezone


def make_defn(name="test-cohort"):
    d = MagicMock()
    d.cohort_definition_id = uuid4()
    d.cohort_definition_name = name
    d.cohort_description = None
    d.filters = {}
    d.orthanc_tags = []
    d.created_at = datetime.now(timezone.utc)
    d.updated_at = datetime.now(timezone.utc)
    d.members = []
    d.jobs = []
    return d


@pytest.mark.asyncio
async def test_list_definitions_empty():
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    db = AsyncMock()
    res = MagicMock()
    res.scalars.return_value.all.return_value = []
    db.execute = AsyncMock(return_value=res)

    async def override():
        yield db

    app.dependency_overrides[get_db] = override

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/cohort-definitions")

    app.dependency_overrides.clear()

    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_cohort_definition():
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    defn = make_defn("my-cohort")
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock(side_effect=lambda obj: None)

    # After commit+refresh, mock returns the defn object
    db.refresh.side_effect = lambda obj: setattr(obj, "cohort_definition_id", defn.cohort_definition_id) or setattr(obj, "created_at", defn.created_at) or setattr(obj, "updated_at", defn.updated_at)

    async def override():
        yield db

    app.dependency_overrides[get_db] = override

    payload = {"cohort_definition_name": "my-cohort", "filters": {}, "orthanc_tags": []}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/cohort-definitions", json=payload)

    app.dependency_overrides.clear()

    assert resp.status_code == 201
    data = resp.json()
    assert data["cohort_definition_name"] == "my-cohort"


@pytest.mark.asyncio
async def test_get_definition_not_found():
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=res)

    async def override():
        yield db

    app.dependency_overrides[get_db] = override

    uid = uuid4()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get(f"/cohort-definitions/{uid}")

    app.dependency_overrides.clear()

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_resolve_cohort_calls_labeler():
    """resolve endpoint should call orthanc_labeler functions for each matched study."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    defn = make_defn("resolve-test")
    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = defn
    db.execute = AsyncMock(return_value=res)
    db.commit = AsyncMock()
    db.flush = AsyncMock()

    async def override():
        yield db

    app.dependency_overrides[get_db] = override

    matched_rows = [
        {"study_uid": "1.2.3", "orthanc_study_id": "oid1", "study_date": None, "raw_main_dicom_tags": {}},
    ]

    uid = defn.cohort_definition_id
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        with patch("app.api.cohorts.resolve_cohort", new_callable=AsyncMock, return_value=matched_rows):
            with patch("app.api.cohorts.add_cohort_label", new_callable=AsyncMock) as mock_label:
                with patch("app.api.cohorts.store_cohort_tags_as_metadata", new_callable=AsyncMock):
                    resp = await ac.post(f"/cohort-definitions/{uid}/resolve")

    app.dependency_overrides.clear()

    assert resp.status_code == 200
    data = resp.json()
    assert data["matched_count"] == 1
    assert "1.2.3" in data["study_uids"]
    mock_label.assert_awaited_once()
