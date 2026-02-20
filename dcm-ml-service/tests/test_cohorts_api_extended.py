"""Extended unit tests for cohort-definition and cohort-membership endpoints."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from datetime import datetime, timezone, date


def make_defn(name="test-cohort"):
    d = MagicMock()
    d.cohort_definition_id = uuid4()
    d.cohort_definition_name = name
    d.cohort_description = "A test cohort"
    d.filters = {}
    d.orthanc_tags = []
    d.created_at = datetime.now(timezone.utc)
    d.updated_at = datetime.now(timezone.utc)
    d.members = []
    d.jobs = []
    return d


def make_member(defn_id, subject_id="1.2.3"):
    m = MagicMock()
    m.cohort_definition_id = defn_id
    m.subject_id = subject_id
    m.orthanc_study_id = "oid-abc"
    m.cohort_start_date = date(2023, 1, 1)
    m.cohort_end_date = None
    m.orthanc_tags_snapshot = {}
    m.added_at = datetime.now(timezone.utc)
    return m


# ── update cohort definition ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_definition_changes_name():
    """PUT /cohort-definitions/{id} should update the name field."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    defn = make_defn("original-name")

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = defn
    db.execute = AsyncMock(return_value=res)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    async def override():
        yield db

    app.dependency_overrides[get_db] = override

    payload = {"cohort_definition_name": "updated-name"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.put(f"/cohort-definitions/{defn.cohort_definition_id}", json=payload)

    app.dependency_overrides.clear()

    assert resp.status_code == 200
    # The name should have been updated on the object
    assert defn.cohort_definition_name == "updated-name"
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_definition_not_found():
    """PUT /cohort-definitions/{id} returns 404 for unknown ID."""
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

    payload = {"cohort_definition_name": "new-name"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.put(f"/cohort-definitions/{uuid4()}", json=payload)

    app.dependency_overrides.clear()
    assert resp.status_code == 404


# ── delete cohort definition ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_definition_removes_labels_and_returns_204():
    """DELETE /cohort-definitions/{id} should call remove_cohort_label for each member."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    defn = make_defn()
    member = make_member(defn.cohort_definition_id)

    db = AsyncMock()
    # First execute: get definition; second execute: get members
    res_defn = MagicMock()
    res_defn.scalar_one_or_none.return_value = defn
    res_members = MagicMock()
    res_members.scalars.return_value.all.return_value = [member]
    db.execute = AsyncMock(side_effect=[res_defn, res_members])
    db.delete = AsyncMock()
    db.commit = AsyncMock()

    async def override():
        yield db

    app.dependency_overrides[get_db] = override

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        with patch("app.api.cohorts.remove_cohort_label", new_callable=AsyncMock) as mock_remove:
            resp = await ac.delete(f"/cohort-definitions/{defn.cohort_definition_id}")

    app.dependency_overrides.clear()

    assert resp.status_code == 204
    mock_remove.assert_awaited_once_with(member.orthanc_study_id, defn.cohort_definition_id)
    db.delete.assert_awaited_once()
    db.commit.assert_awaited_once()


# ── list cohort members ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_members_returns_members():
    """GET /cohorts/{defn_id} should return list of members."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    defn = make_defn()
    members = [make_member(defn.cohort_definition_id, "uid-001")]

    db = AsyncMock()
    res = MagicMock()
    res.scalars.return_value.all.return_value = members
    db.execute = AsyncMock(return_value=res)

    async def override():
        yield db

    app.dependency_overrides[get_db] = override

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get(f"/cohorts/{defn.cohort_definition_id}")

    app.dependency_overrides.clear()

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["subject_id"] == "uid-001"


@pytest.mark.asyncio
async def test_list_members_empty():
    """GET /cohorts/{defn_id} returns [] when no members."""
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
        resp = await ac.get(f"/cohorts/{uuid4()}")

    app.dependency_overrides.clear()

    assert resp.status_code == 200
    assert resp.json() == []


# ── remove member ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_remove_member_success():
    """DELETE /cohorts/{defn_id}/{subject_id} should call remove_cohort_label and return 204."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    defn = make_defn()
    member = make_member(defn.cohort_definition_id, "uid-001")

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = member
    db.execute = AsyncMock(return_value=res)
    db.delete = AsyncMock()
    db.commit = AsyncMock()

    async def override():
        yield db

    app.dependency_overrides[get_db] = override

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        with patch("app.api.cohorts.remove_cohort_label", new_callable=AsyncMock) as mock_remove:
            resp = await ac.delete(f"/cohorts/{defn.cohort_definition_id}/uid-001")

    app.dependency_overrides.clear()

    assert resp.status_code == 204
    mock_remove.assert_awaited_once()
    db.delete.assert_awaited_once()


@pytest.mark.asyncio
async def test_remove_member_not_found():
    """DELETE /cohorts/{defn_id}/{subject_id} returns 404 for unknown member."""
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

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.delete(f"/cohorts/{uuid4()}/nonexistent-uid")

    app.dependency_overrides.clear()
    assert resp.status_code == 404


# ── resolve with multiple studies ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_resolve_cohort_with_multiple_matches():
    """Resolving a cohort with multiple matches should label all studies."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    defn = make_defn("multi-match")

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = defn
    db.execute = AsyncMock(return_value=res)
    db.commit = AsyncMock()

    async def override():
        yield db

    app.dependency_overrides[get_db] = override

    matched = [
        {"study_uid": "1.2.3", "orthanc_study_id": "oid1", "study_date": None, "raw_main_dicom_tags": {}},
        {"study_uid": "4.5.6", "orthanc_study_id": "oid2", "study_date": None, "raw_main_dicom_tags": {}},
    ]

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        with patch("app.api.cohorts.resolve_cohort", new_callable=AsyncMock, return_value=matched):
            with patch("app.api.cohorts.add_cohort_label", new_callable=AsyncMock) as mock_label:
                with patch("app.api.cohorts.store_cohort_tags_as_metadata", new_callable=AsyncMock):
                    resp = await ac.post(f"/cohort-definitions/{defn.cohort_definition_id}/resolve")

    app.dependency_overrides.clear()

    assert resp.status_code == 200
    data = resp.json()
    assert data["matched_count"] == 2
    assert set(data["study_uids"]) == {"1.2.3", "4.5.6"}
    assert mock_label.await_count == 2


# ── cohort from Orthanc ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cohort_from_orthanc_returns_ids():
    """GET /cohorts/{defn_id}/orthanc should return Orthanc study IDs from labeler."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    expected = ["oid1", "oid2"]
    defn_id = uuid4()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        with patch("app.api.cohorts.get_cohort_members_from_orthanc", new_callable=AsyncMock, return_value=expected):
            resp = await ac.get(f"/cohorts/{defn_id}/orthanc")

    assert resp.status_code == 200
    assert resp.json() == expected


# ── ML health ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_ml_health():
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/health")

    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
