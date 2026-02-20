"""Federated ML job coordinator — stub implementation.

In a real deployment this would perform FedAvg weight aggregation.
Here it demonstrates the API contract for a client-side federated edge node.
"""
import logging
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import MLJob, JobEdgeResult

logger = logging.getLogger(__name__)

VALID_TRANSITIONS = {
    "PENDING": {"RUNNING", "FAILED"},
    "RUNNING": {"AGGREGATING", "FAILED"},
    "AGGREGATING": {"DONE", "FAILED"},
}


def can_transition(current: str, target: str) -> bool:
    return target in VALID_TRANSITIONS.get(current, set())


async def aggregate_results(job: MLJob, db: AsyncSession) -> dict:
    """
    Stub aggregation: average local_loss and sum num_samples across all edge results.
    A real implementation would perform FedAvg on model weight arrays.
    """
    result = await db.execute(
        select(JobEdgeResult).where(JobEdgeResult.job_id == job.id)
    )
    edge_results = result.scalars().all()

    if not edge_results:
        return {"message": "no edge results received yet", "num_nodes": 0}

    losses = [r.payload.get("local_loss", 0.0) for r in edge_results if "local_loss" in r.payload]
    samples = [r.payload.get("num_samples", 0) for r in edge_results if "num_samples" in r.payload]
    node_ids = list({r.edge_node_id for r in edge_results})

    global_loss = sum(losses) / len(losses) if losses else None

    logger.info("Aggregated job %s: %d nodes, global_loss=%.4f", job.id, len(node_ids), global_loss or 0)

    return {
        "global_loss": global_loss,
        "total_samples": sum(samples),
        "num_nodes": len(node_ids),
        "participating_nodes": node_ids,
        "rounds_received": len(edge_results),
    }
