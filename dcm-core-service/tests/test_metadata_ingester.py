"""Unit tests for metadata_ingester service."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4


MOCK_STUDY_DATA = {
    "ID": "orthanc-study-abc",
    "MainDicomTags": {
        "StudyInstanceUID": "1.2.840.test.study",
        "StudyDate": "20230615",
        "StudyTime": "120000",
        "StudyDescription": "Chest CT",
        "AccessionNumber": "ACC001",
        "InstitutionName": "Test Hospital",
    },
    "PatientMainDicomTags": {
        "PatientID": "P001",
        "PatientName": "DOE^JOHN",
        "PatientBirthDate": "19800101",
        "PatientSex": "M",
    },
    "Series": ["series-aaa"],
}

MOCK_SERIES_DATA = {
    "ID": "series-aaa",
    "MainDicomTags": {
        "SeriesInstanceUID": "1.2.840.test.series",
        "Modality": "CT",
        "SeriesNumber": "1",
        "SeriesDescription": "Chest",
        "BodyPartExamined": "CHEST",
        "ProtocolName": "standard",
    },
    "Instances": ["instance-111"],
}

MOCK_INSTANCE_DATA = {
    "ID": "instance-111",
    "MainDicomTags": {
        "SOPInstanceUID": "1.2.840.test.instance",
        "InstanceNumber": "1",
        "SOPClassUID": "1.2.840.10008.5.1.4.1.1.2",
    },
    "FileMetaInformation": {"TransferSyntaxUID": "1.2.840.10008.1.2.1"},
}


@pytest.mark.asyncio
async def test_ingest_study_creates_records():
    """ingest_study should upsert study, series, instance rows."""
    from app.services.metadata_ingester import ingest_study

    db = AsyncMock()

    # execute() returns different results for study select vs series select vs instance select
    study_row = MagicMock()
    study_row.id = uuid4()
    study_row.series = []
    study_row.num_instances = 0

    series_row = MagicMock()
    series_row.id = uuid4()

    select_results = [
        MagicMock(scalar_one=lambda: study_row),   # select Study after insert
        MagicMock(scalar_one=lambda: series_row),  # select Series after insert
    ]
    db.execute = AsyncMock(side_effect=lambda *a, **k: select_results.pop(0) if select_results else MagicMock())
    db.flush = AsyncMock()
    db.commit = AsyncMock()

    with patch("app.services.metadata_ingester.orthanc_client") as mock_client:
        mock_client.get = AsyncMock(side_effect=[MOCK_STUDY_DATA, MOCK_SERIES_DATA, MOCK_INSTANCE_DATA])
        await ingest_study("orthanc-study-abc", db)

    db.commit.assert_called()


@pytest.mark.asyncio
async def test_ingest_study_skips_missing_study_uid():
    """If Orthanc returns a study with no StudyInstanceUID, we skip it silently."""
    from app.services.metadata_ingester import ingest_study

    db = AsyncMock()

    no_uid_data = {**MOCK_STUDY_DATA, "MainDicomTags": {"StudyDate": "20230615"}}  # no StudyInstanceUID
    no_uid_data["PatientMainDicomTags"] = {}

    with patch("app.services.metadata_ingester.orthanc_client") as mock_client:
        mock_client.get = AsyncMock(return_value=no_uid_data)
        await ingest_study("orthanc-study-missing", db)

    db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_ingest_study_handles_orthanc_error():
    """If Orthanc is unreachable, the function logs and returns without raising."""
    from app.services.metadata_ingester import ingest_study
    import httpx

    db = AsyncMock()

    with patch("app.services.metadata_ingester.orthanc_client") as mock_client:
        mock_client.get = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
        # Should NOT raise
        await ingest_study("orthanc-study-offline", db)

    db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_parse_date_edge_cases():
    from app.services.metadata_ingester import _parse_date
    assert _parse_date("20230615") is not None
    assert _parse_date("") is None
    assert _parse_date(None) is None
    assert _parse_date("bad-date") is None
    assert _parse_date("20231") is None
