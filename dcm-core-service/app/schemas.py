from datetime import date, time, datetime
from typing import Optional, Any
from uuid import UUID
from pydantic import BaseModel


class SeriesOut(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    series_uid: str
    orthanc_id: str
    modality: Optional[str]
    series_number: Optional[int]
    series_description: Optional[str]
    body_part_examined: Optional[str]
    protocol_name: Optional[str]
    num_instances: int
    raw_main_dicom_tags: dict[str, Any]
    deleted_at: Optional[datetime]


class StudyOut(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    study_uid: str
    orthanc_id: str
    patient_id: Optional[str]
    patient_name: Optional[str]
    patient_birth_date: Optional[date]
    patient_sex: Optional[str]
    study_date: Optional[date]
    study_time: Optional[time]
    study_description: Optional[str]
    accession_number: Optional[str]
    referring_physician: Optional[str]
    institution_name: Optional[str]
    num_series: int
    num_instances: int
    raw_main_dicom_tags: dict[str, Any]
    ingested_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime]
    series: list[SeriesOut] = []


class StudyListOut(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[StudyOut]


class OrthancChangeEvent(BaseModel):
    ChangeType: str
    ID: str
    Path: str
    ResourceType: str
    Date: str
