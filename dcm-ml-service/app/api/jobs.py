from datetime import datetime, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from prometheus_client import Counter

from ..database import get_db
from ..models import MLJob, JobEdgeResult
from ..schemas import JobCreate, JobOut, EdgeResultSubmit, AggregateResult
from ..services.federated_coordinator import aggregate_results, can_transition

router = APIRouter(prefix="/jobs", tags=["jobs"])

JOBS_COUNTER = Counter("dcm_ml_jobs_total", "Total ML jobs by final status", ["status"])


@router.get("", response_model=list[JobOut])
async def list_jobs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MLJob).order_by(MLJob.created_at.desc()))
    return result.scalars().all()


@router.post("", response_model=JobOut, status_code=201)
async def create_job(body: JobCreate, db: AsyncSession = Depends(get_db)):
    job = MLJob(
        cohort_definition_id=body.cohort_definition_id,
        name=body.name,
        algorithm=body.algorithm,
        params=body.params,
        status="PENDING",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


@router.get("/{job_id}", response_model=JobOut)
async def get_job(job_id: UUID, db: AsyncSession = Depends(get_db)):
    return await _get_job_or_404(job_id, db)


@router.post("/{job_id}/start", response_model=JobOut)
async def start_job(job_id: UUID, db: AsyncSession = Depends(get_db)):
    job = await _get_job_or_404(job_id, db)
    if not can_transition(job.status, "RUNNING"):
        raise HTTPException(status_code=409, detail=f"Cannot start job in status {job.status}")
    job.status = "RUNNING"
    job.started_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(job)
    return job


@router.post("/{job_id}/result", response_model=dict, status_code=201)
async def submit_edge_result(job_id: UUID, body: EdgeResultSubmit, db: AsyncSession = Depends(get_db)):
    job = await _get_job_or_404(job_id, db)
    if job.status != "RUNNING":
        raise HTTPException(status_code=409, detail="Job is not RUNNING")
    edge_result = JobEdgeResult(
        job_id=job_id,
        edge_node_id=body.edge_node_id,
        round=body.round,
        payload=body.payload,
    )
    db.add(edge_result)
    await db.commit()
    return {"message": "result received", "job_id": str(job_id), "edge_node_id": body.edge_node_id}


@router.get("/{job_id}/aggregate", response_model=AggregateResult)
async def aggregate(job_id: UUID, db: AsyncSession = Depends(get_db)):
    job = await _get_job_or_404(job_id, db)

    agg = await aggregate_results(job, db)

    if agg.get("num_nodes", 0) > 0 and job.status in ("RUNNING", "AGGREGATING"):
        job.status = "DONE"
        job.finished_at = datetime.now(timezone.utc)
        job.result_summary = agg
        await db.commit()
        JOBS_COUNTER.labels(status="DONE").inc()

    return AggregateResult(
        job_id=job_id,
        status=job.status,
        num_nodes=agg.get("num_nodes", 0),
        total_samples=agg.get("total_samples", 0),
        global_loss=agg.get("global_loss"),
        message=agg.get("message"),
    )


async def _get_job_or_404(job_id: UUID, db: AsyncSession) -> MLJob:
    result = await db.execute(select(MLJob).where(MLJob.id == job_id))
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
