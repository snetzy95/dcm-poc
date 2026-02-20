from datetime import date, datetime
from typing import Optional, Any
import uuid

from sqlalchemy import String, Integer, Text, Date, DateTime, ForeignKey, ForeignKeyConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from .database import Base


class CohortDefinition(Base):
    __tablename__ = "cohort_definition"

    cohort_definition_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cohort_definition_name: Mapped[str] = mapped_column(Text, nullable=False)
    cohort_description: Mapped[Optional[str]] = mapped_column(Text)
    filters: Mapped[dict] = mapped_column(JSONB, default={})
    orthanc_tags: Mapped[list] = mapped_column(JSONB, default=[])
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    members: Mapped[list["Cohort"]] = relationship("Cohort", back_populates="definition", cascade="all, delete-orphan")
    jobs: Mapped[list["MLJob"]] = relationship("MLJob", back_populates="cohort_definition")


class Cohort(Base):
    """OMOP-inspired cohort membership table."""
    __tablename__ = "cohort"

    cohort_definition_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cohort_definition.cohort_definition_id", ondelete="CASCADE"), primary_key=True)
    subject_id: Mapped[str] = mapped_column(Text, primary_key=True)  # StudyInstanceUID
    orthanc_study_id: Mapped[str] = mapped_column(Text, nullable=False)
    cohort_start_date: Mapped[Optional[date]] = mapped_column(Date)
    cohort_end_date: Mapped[Optional[date]] = mapped_column(Date)
    orthanc_tags_snapshot: Mapped[dict] = mapped_column(JSONB, default={})
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    definition: Mapped["CohortDefinition"] = relationship("CohortDefinition", back_populates="members")


class MLJob(Base):
    __tablename__ = "ml_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cohort_definition_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("cohort_definition.cohort_definition_id"))
    name: Mapped[str] = mapped_column(Text, nullable=False)
    algorithm: Mapped[str] = mapped_column(Text, nullable=False)
    params: Mapped[dict] = mapped_column(JSONB, default={})
    status: Mapped[str] = mapped_column(Text, nullable=False, default="PENDING")
    result_summary: Mapped[Optional[dict]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    cohort_definition: Mapped[Optional["CohortDefinition"]] = relationship("CohortDefinition", back_populates="jobs")
    edge_results: Mapped[list["JobEdgeResult"]] = relationship("JobEdgeResult", back_populates="job", cascade="all, delete-orphan")


class JobEdgeResult(Base):
    __tablename__ = "job_edge_results"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ml_jobs.id", ondelete="CASCADE"), nullable=False)
    edge_node_id: Mapped[str] = mapped_column(Text, nullable=False)
    round: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    job: Mapped["MLJob"] = relationship("MLJob", back_populates="edge_results")
