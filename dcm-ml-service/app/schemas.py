from datetime import date, datetime
from typing import Optional, Any
from uuid import UUID
from pydantic import BaseModel


# ── Cohort Definition ──────────────────────────────────────────────────────────

class OrthancTagCriteria(BaseModel):
    tag: str        # DICOM tag key e.g. "0008,0060"
    name: str       # Human-readable name e.g. "Modality"
    value: str      # Expected value


class CohortDefinitionCreate(BaseModel):
    cohort_definition_name: str
    cohort_description: Optional[str] = None
    filters: dict[str, Any] = {}
    orthanc_tags: list[OrthancTagCriteria] = []


class CohortDefinitionUpdate(BaseModel):
    cohort_definition_name: Optional[str] = None
    cohort_description: Optional[str] = None
    filters: Optional[dict[str, Any]] = None
    orthanc_tags: Optional[list[OrthancTagCriteria]] = None


class CohortDefinitionOut(BaseModel):
    model_config = {"from_attributes": True}

    cohort_definition_id: UUID
    cohort_definition_name: str
    cohort_description: Optional[str]
    filters: dict[str, Any]
    orthanc_tags: list[dict]
    created_at: datetime
    updated_at: datetime


# ── Cohort Membership ──────────────────────────────────────────────────────────

class CohortMemberOut(BaseModel):
    model_config = {"from_attributes": True}

    cohort_definition_id: UUID
    subject_id: str
    orthanc_study_id: str
    cohort_start_date: Optional[date]
    cohort_end_date: Optional[date]
    orthanc_tags_snapshot: dict[str, Any]
    added_at: datetime


class ResolveResult(BaseModel):
    cohort_definition_id: UUID
    matched_count: int
    study_uids: list[str]


# ── ML Jobs ────────────────────────────────────────────────────────────────────

class JobCreate(BaseModel):
    cohort_definition_id: Optional[UUID] = None
    name: str
    algorithm: str
    params: dict[str, Any] = {}


class EdgeResultSubmit(BaseModel):
    edge_node_id: str
    round: int = 1
    payload: dict[str, Any]


class JobOut(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    cohort_definition_id: Optional[UUID]
    name: str
    algorithm: str
    params: dict[str, Any]
    status: str
    result_summary: Optional[dict[str, Any]]
    created_at: datetime
    started_at: Optional[datetime]
    finished_at: Optional[datetime]


class AggregateResult(BaseModel):
    job_id: UUID
    status: str
    num_nodes: int
    total_samples: int
    global_loss: Optional[float]
    message: Optional[str] = None
