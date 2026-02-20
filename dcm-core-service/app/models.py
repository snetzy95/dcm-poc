from datetime import date, time, datetime
from typing import Optional
from sqlalchemy import String, Integer, SmallInteger, BigInteger, Date, Time, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB, CHAR
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
import uuid

from .database import Base


class PollerState(Base):
    __tablename__ = "poller_state"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, default=1)
    last_seq: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Study(Base):
    __tablename__ = "studies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    study_uid: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    orthanc_id: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    patient_id: Mapped[Optional[str]] = mapped_column(Text)
    patient_name: Mapped[Optional[str]] = mapped_column(Text)
    patient_birth_date: Mapped[Optional[date]] = mapped_column(Date)
    patient_sex: Mapped[Optional[str]] = mapped_column(CHAR(1))
    study_date: Mapped[Optional[date]] = mapped_column(Date)
    study_time: Mapped[Optional[time]] = mapped_column(Time)
    study_description: Mapped[Optional[str]] = mapped_column(Text)
    accession_number: Mapped[Optional[str]] = mapped_column(Text)
    referring_physician: Mapped[Optional[str]] = mapped_column(Text)
    institution_name: Mapped[Optional[str]] = mapped_column(Text)
    num_series: Mapped[int] = mapped_column(Integer, default=0)
    num_instances: Mapped[int] = mapped_column(Integer, default=0)
    raw_main_dicom_tags: Mapped[dict] = mapped_column(JSONB, default={})
    ingested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    series: Mapped[list["Series"]] = relationship("Series", back_populates="study", cascade="all, delete-orphan")


class Series(Base):
    __tablename__ = "series"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    series_uid: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    orthanc_id: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    study_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("studies.id"), nullable=False)
    modality: Mapped[Optional[str]] = mapped_column(Text)
    series_number: Mapped[Optional[int]] = mapped_column(Integer)
    series_description: Mapped[Optional[str]] = mapped_column(Text)
    body_part_examined: Mapped[Optional[str]] = mapped_column(Text)
    protocol_name: Mapped[Optional[str]] = mapped_column(Text)
    num_instances: Mapped[int] = mapped_column(Integer, default=0)
    raw_main_dicom_tags: Mapped[dict] = mapped_column(JSONB, default={})
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    study: Mapped["Study"] = relationship("Study", back_populates="series")
    instances: Mapped[list["Instance"]] = relationship("Instance", back_populates="series", cascade="all, delete-orphan")


class Instance(Base):
    __tablename__ = "instances"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sop_instance_uid: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    orthanc_id: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    series_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("series.id"), nullable=False)
    instance_number: Mapped[Optional[int]] = mapped_column(Integer)
    sop_class_uid: Mapped[Optional[str]] = mapped_column(Text)
    transfer_syntax_uid: Mapped[Optional[str]] = mapped_column(Text)
    raw_main_dicom_tags: Mapped[dict] = mapped_column(JSONB, default={})
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    series: Mapped["Series"] = relationship("Series", back_populates="instances")
