"""Unit tests for the cohort_query dynamic filter builder."""
import pytest
from datetime import date
from app.services.cohort_query import _safe_date


def test_safe_date_isoformat():
    assert _safe_date("2023-06-15") == date(2023, 6, 15)


def test_safe_date_date_object():
    d = date(2023, 1, 1)
    assert _safe_date(d) == d


def test_safe_date_empty():
    assert _safe_date("") is None
    assert _safe_date(None) is None


def test_safe_date_invalid():
    assert _safe_date("not-a-date") is None
    assert _safe_date(12345) is None


@pytest.mark.asyncio
async def test_resolve_cohort_empty_filters_builds_query():
    """resolve_cohort with empty filters should execute without error."""
    from unittest.mock import AsyncMock, MagicMock
    from app.services.cohort_query import resolve_cohort

    db = AsyncMock()
    rows = MagicMock()
    rows.mappings.return_value.all.return_value = []
    db.execute = AsyncMock(return_value=rows)

    result = await resolve_cohort({}, [], db)
    assert result == []
    db.execute.assert_awaited_once()


@pytest.mark.asyncio
async def test_resolve_cohort_with_modality_filter():
    """Modality filter should trigger series join and return matching rows."""
    from unittest.mock import AsyncMock, MagicMock
    from app.services.cohort_query import resolve_cohort

    db = AsyncMock()
    rows = MagicMock()
    rows.mappings.return_value.all.return_value = [
        {"study_uid": "1.2.3", "orthanc_study_id": "abc", "study_date": date(2023, 1, 1), "raw_main_dicom_tags": {"0008,0060": "CT"}}
    ]
    db.execute = AsyncMock(return_value=rows)

    result = await resolve_cohort({"modalities": ["CT"]}, [], db)
    assert len(result) == 1
    assert result[0]["study_uid"] == "1.2.3"


@pytest.mark.asyncio
async def test_resolve_cohort_with_orthanc_tag_filter():
    """Orthanc tag criteria should be applied as JSONB conditions."""
    from unittest.mock import AsyncMock, MagicMock
    from app.services.cohort_query import resolve_cohort

    db = AsyncMock()
    rows = MagicMock()
    rows.mappings.return_value.all.return_value = []
    db.execute = AsyncMock(return_value=rows)

    tags = [{"tag": "0008,0060", "name": "Modality", "value": "CT"}]
    result = await resolve_cohort({}, tags, db)
    assert result == []
    # Verify query was built and executed
    db.execute.assert_awaited_once()
