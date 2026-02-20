"""Unit tests for ML job API endpoints."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from datetime import datetime, timezone


def make_job(status="PENDING"):
    j = MagicMock()
    j.id = uuid4()
    j.cohort_definition_id = None
    j.name = "test-job"
    j.algorithm = "fedavg_stub"
    j.params = {}
    j.status = status
    j.result_summary = None
    j.created_at = datetime.now(timezone.utc)
    j.started_at = None
    j.finished_at = None
    j.edge_results = []
    return j


@pytest.mark.asyncio
async def test_create_job_returns_pending():
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()

    created_job = make_job("PENDING")
    db.refresh = AsyncMock(side_effect=lambda obj: (
        setattr(obj, "id", created_job.id) or
        setattr(obj, "created_at", created_job.created_at) or
        setattr(obj, "cohort_definition_id", None) or
        setattr(obj, "result_summary", None) or
        setattr(obj, "started_at", None) or
        setattr(obj, "finished_at", None)
    ))

    async def override():
        yield db

    app.dependency_overrides[get_db] = override

    payload = {"name": "test-job", "algorithm": "fedavg_stub", "params": {}}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/jobs", json=payload)

    app.dependency_overrides.clear()

    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "PENDING"
    assert data["name"] == "test-job"


@pytest.mark.asyncio
async def test_get_job_not_found():
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
        resp = await ac.get(f"/jobs/{uid}")

    app.dependency_overrides.clear()
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_start_job_transitions_to_running():
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    job = make_job("PENDING")

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = job
    db.execute = AsyncMock(return_value=res)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    async def override():
        yield db

    app.dependency_overrides[get_db] = override

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(f"/jobs/{job.id}/start")

    app.dependency_overrides.clear()

    assert resp.status_code == 200
    assert job.status == "RUNNING"
    assert job.started_at is not None


@pytest.mark.asyncio
async def test_start_job_conflict_if_not_pending():
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    job = make_job("DONE")

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = job
    db.execute = AsyncMock(return_value=res)

    async def override():
        yield db

    app.dependency_overrides[get_db] = override

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(f"/jobs/{job.id}/start")

    app.dependency_overrides.clear()
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_aggregate_returns_global_loss():
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db
    from app.services.federated_coordinator import aggregate_results

    job = make_job("RUNNING")

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = job
    db.execute = AsyncMock(return_value=res)
    db.commit = AsyncMock()

    async def override():
        yield db

    app.dependency_overrides[get_db] = override

    agg_result = {"global_loss": 0.38, "total_samples": 100, "num_nodes": 1, "participating_nodes": ["n1"], "rounds_received": 1}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        with patch("app.api.jobs.aggregate_results", new_callable=AsyncMock, return_value=agg_result):
            resp = await ac.get(f"/jobs/{job.id}/aggregate")

    app.dependency_overrides.clear()

    assert resp.status_code == 200
    data = resp.json()
    assert data["global_loss"] == pytest.approx(0.38, rel=1e-3)
    assert data["num_nodes"] == 1
