"""Unit tests for federated_coordinator service."""
import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4


def make_edge_result(edge_node_id: str, local_loss: float, num_samples: int, round_: int = 1):
    r = MagicMock()
    r.edge_node_id = edge_node_id
    r.round = round_
    r.payload = {"local_loss": local_loss, "num_samples": num_samples}
    return r


def make_job(status="RUNNING"):
    j = MagicMock()
    j.id = uuid4()
    j.status = status
    return j


# ── can_transition ────────────────────────────────────────────────────────────

def test_can_transition_pending_to_running():
    from app.services.federated_coordinator import can_transition
    assert can_transition("PENDING", "RUNNING") is True


def test_can_transition_pending_to_done_is_invalid():
    from app.services.federated_coordinator import can_transition
    assert can_transition("PENDING", "DONE") is False


def test_can_transition_running_to_aggregating():
    from app.services.federated_coordinator import can_transition
    assert can_transition("RUNNING", "AGGREGATING") is True


def test_can_transition_running_to_done_is_invalid():
    from app.services.federated_coordinator import can_transition
    assert can_transition("RUNNING", "DONE") is False


def test_can_transition_done_has_no_valid_targets():
    from app.services.federated_coordinator import can_transition
    assert can_transition("DONE", "RUNNING") is False
    assert can_transition("DONE", "FAILED") is False


def test_can_transition_any_to_failed():
    from app.services.federated_coordinator import can_transition
    assert can_transition("PENDING", "FAILED") is True
    assert can_transition("RUNNING", "FAILED") is True
    assert can_transition("AGGREGATING", "FAILED") is True


def test_can_transition_unknown_status():
    from app.services.federated_coordinator import can_transition
    assert can_transition("UNKNOWN_STATE", "RUNNING") is False


# ── aggregate_results ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_aggregate_results_no_edge_results():
    from app.services.federated_coordinator import aggregate_results

    job = make_job()
    db = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = []
    db.execute = AsyncMock(return_value=result)

    agg = await aggregate_results(job, db)

    assert agg["num_nodes"] == 0
    assert "message" in agg


@pytest.mark.asyncio
async def test_aggregate_results_single_node():
    from app.services.federated_coordinator import aggregate_results

    job = make_job()
    edge = make_edge_result("node-1", local_loss=0.5, num_samples=100)

    db = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = [edge]
    db.execute = AsyncMock(return_value=result)

    agg = await aggregate_results(job, db)

    assert agg["global_loss"] == pytest.approx(0.5)
    assert agg["total_samples"] == 100
    assert agg["num_nodes"] == 1
    assert "node-1" in agg["participating_nodes"]
    assert agg["rounds_received"] == 1


@pytest.mark.asyncio
async def test_aggregate_results_multiple_nodes_averages_loss():
    from app.services.federated_coordinator import aggregate_results

    job = make_job()
    edges = [
        make_edge_result("node-1", local_loss=0.4, num_samples=100),
        make_edge_result("node-2", local_loss=0.6, num_samples=200),
    ]

    db = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = edges
    db.execute = AsyncMock(return_value=result)

    agg = await aggregate_results(job, db)

    assert agg["global_loss"] == pytest.approx(0.5)
    assert agg["total_samples"] == 300
    assert agg["num_nodes"] == 2
    assert set(agg["participating_nodes"]) == {"node-1", "node-2"}


@pytest.mark.asyncio
async def test_aggregate_results_deduplicates_nodes():
    """Same node submitting multiple rounds should count as 1 node."""
    from app.services.federated_coordinator import aggregate_results

    job = make_job()
    edges = [
        make_edge_result("node-1", local_loss=0.4, num_samples=100, round_=1),
        make_edge_result("node-1", local_loss=0.3, num_samples=120, round_=2),
    ]

    db = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = edges
    db.execute = AsyncMock(return_value=result)

    agg = await aggregate_results(job, db)

    assert agg["num_nodes"] == 1
    assert agg["rounds_received"] == 2


@pytest.mark.asyncio
async def test_aggregate_results_missing_loss_field_is_skipped():
    """Edge results without local_loss should not contribute to average."""
    from app.services.federated_coordinator import aggregate_results

    job = make_job()
    edge_no_loss = MagicMock()
    edge_no_loss.edge_node_id = "node-2"
    edge_no_loss.payload = {"num_samples": 50}  # no local_loss

    edge_with_loss = make_edge_result("node-1", local_loss=0.8, num_samples=100)

    db = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = [edge_no_loss, edge_with_loss]
    db.execute = AsyncMock(return_value=result)

    agg = await aggregate_results(job, db)

    # global_loss is average of only the entries that have local_loss
    assert agg["global_loss"] == pytest.approx(0.8)
    assert agg["total_samples"] == 150  # both contribute num_samples
