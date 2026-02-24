"""Extended unit tests for ML job API endpoints."""
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


# ── submit edge result ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_submit_edge_result_success():
    """POST /jobs/{id}/result with RUNNING job should return 201."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    job = make_job("RUNNING")

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = job
    db.execute = AsyncMock(return_value=res)
    db.add = MagicMock()
    db.commit = AsyncMock()

    async def override():
        yield db

    app.dependency_overrides[get_db] = override

    payload = {
        "edge_node_id": "edge-1",
        "round": 1,
        "payload": {"local_loss": 0.42, "num_samples": 100},
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(f"/jobs/{job.id}/result", json=payload)

    app.dependency_overrides.clear()

    assert resp.status_code == 201
    data = resp.json()
    assert data["edge_node_id"] == "edge-1"
    assert str(job.id) in data["job_id"]
    db.add.assert_called_once()
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_submit_edge_result_rejected_when_not_running():
    """POST /jobs/{id}/result should return 409 when job is PENDING."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    job = make_job("PENDING")

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = job
    db.execute = AsyncMock(return_value=res)

    async def override():
        yield db

    app.dependency_overrides[get_db] = override

    payload = {
        "edge_node_id": "edge-1",
        "round": 1,
        "payload": {"local_loss": 0.3, "num_samples": 50},
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(f"/jobs/{job.id}/result", json=payload)

    app.dependency_overrides.clear()

    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_submit_edge_result_job_not_found():
    """POST /jobs/{id}/result returns 404 for unknown job."""
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

    payload = {"edge_node_id": "edge-1", "round": 1, "payload": {}}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(f"/jobs/{uuid4()}/result", json=payload)

    app.dependency_overrides.clear()

    assert resp.status_code == 404


# ── list jobs ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_jobs_empty():
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
        resp = await ac.get("/jobs")

    app.dependency_overrides.clear()

    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_jobs_returns_items():
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    job = make_job("DONE")
    job.result_summary = {"global_loss": 0.3}

    db = AsyncMock()
    res = MagicMock()
    res.scalars.return_value.all.return_value = [job]
    db.execute = AsyncMock(return_value=res)

    async def override():
        yield db

    app.dependency_overrides[get_db] = override

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/jobs")

    app.dependency_overrides.clear()

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["status"] == "DONE"


# ── aggregate transitions job to DONE ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_aggregate_transitions_job_to_done():
    """Aggregating a RUNNING job with results should set status=DONE."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    job = make_job("RUNNING")

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = job
    db.execute = AsyncMock(return_value=res)
    db.commit = AsyncMock()

    async def override():
        yield db

    app.dependency_overrides[get_db] = override

    agg_result = {
        "global_loss": 0.25,
        "total_samples": 500,
        "num_nodes": 3,
        "participating_nodes": ["n1", "n2", "n3"],
        "rounds_received": 3,
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        with patch("app.api.jobs.aggregate_results", new_callable=AsyncMock, return_value=agg_result):
            resp = await ac.get(f"/jobs/{job.id}/aggregate")

    app.dependency_overrides.clear()

    assert resp.status_code == 200
    assert job.status == "DONE"
    assert job.finished_at is not None
    assert job.result_summary == agg_result
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_aggregate_with_no_results_does_not_transition():
    """Aggregating when no edge results received should keep status unchanged."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    job = make_job("RUNNING")
    original_status = job.status

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = job
    db.execute = AsyncMock(return_value=res)
    db.commit = AsyncMock()

    async def override():
        yield db

    app.dependency_overrides[get_db] = override

    agg_result = {"message": "no edge results received yet", "num_nodes": 0}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        with patch("app.api.jobs.aggregate_results", new_callable=AsyncMock, return_value=agg_result):
            resp = await ac.get(f"/jobs/{job.id}/aggregate")

    app.dependency_overrides.clear()

    assert resp.status_code == 200
    # Status should remain RUNNING — no commit for state change
    assert job.status == original_status


# ── create job with cohort ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_job_with_cohort_id():
    """Creating a job with a cohort_definition_id should store the association."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    cohort_id = uuid4()
    created_job = make_job("PENDING")
    created_job.cohort_definition_id = cohort_id

    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock(side_effect=lambda obj: (
        setattr(obj, "id", created_job.id) or
        setattr(obj, "created_at", created_job.created_at) or
        setattr(obj, "cohort_definition_id", cohort_id) or
        setattr(obj, "result_summary", None) or
        setattr(obj, "started_at", None) or
        setattr(obj, "finished_at", None)
    ))

    async def override():
        yield db

    app.dependency_overrides[get_db] = override

    payload = {
        "name": "cohort-job",
        "algorithm": "fedavg_stub",
        "cohort_definition_id": str(cohort_id),
        "params": {"rounds": 5},
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/jobs", json=payload)

    app.dependency_overrides.clear()

    assert resp.status_code == 201
    data = resp.json()
    assert data["cohort_definition_id"] == str(cohort_id)


# ── delete job ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_pending_job_returns_204():
    """DELETE /jobs/{id} for a PENDING job should return 204 and remove the job."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    job = make_job("PENDING")

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = job
    db.execute = AsyncMock(return_value=res)
    db.delete = AsyncMock()
    db.commit = AsyncMock()

    async def override():
        yield db

    app.dependency_overrides[get_db] = override

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.delete(f"/jobs/{job.id}")

    app.dependency_overrides.clear()

    assert resp.status_code == 204
    db.delete.assert_awaited_once_with(job)
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_delete_done_job_returns_204():
    """DELETE /jobs/{id} for a DONE job should return 204."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    job = make_job("DONE")

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = job
    db.execute = AsyncMock(return_value=res)
    db.delete = AsyncMock()
    db.commit = AsyncMock()

    async def override():
        yield db

    app.dependency_overrides[get_db] = override

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.delete(f"/jobs/{job.id}")

    app.dependency_overrides.clear()

    assert resp.status_code == 204
    db.delete.assert_awaited_once_with(job)
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_delete_running_job_returns_409():
    """DELETE /jobs/{id} for a RUNNING job should return 409 Conflict."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    job = make_job("RUNNING")

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = job
    db.execute = AsyncMock(return_value=res)
    db.delete = AsyncMock()
    db.commit = AsyncMock()

    async def override():
        yield db

    app.dependency_overrides[get_db] = override

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.delete(f"/jobs/{job.id}")

    app.dependency_overrides.clear()

    assert resp.status_code == 409
    assert "RUNNING" in resp.json()["detail"]
    db.delete.assert_not_awaited()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_delete_job_not_found_returns_404():
    """DELETE /jobs/{id} for an unknown job id should return 404."""
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
        resp = await ac.delete(f"/jobs/{uuid4()}")

    app.dependency_overrides.clear()

    assert resp.status_code == 404
