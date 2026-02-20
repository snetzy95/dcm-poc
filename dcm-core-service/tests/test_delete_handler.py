"""Unit tests for delete_handler service."""
import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4
from datetime import datetime, timezone


def make_series_mock(num_instances=2):
    instances = [MagicMock(deleted_at=None) for _ in range(num_instances)]
    series = MagicMock(deleted_at=None)
    series.instances = instances
    return series


@pytest.mark.asyncio
async def test_soft_delete_study_sets_deleted_at():
    """soft_delete_study should set deleted_at on the study and its children."""
    from app.services.delete_handler import soft_delete_study

    series1 = make_series_mock(2)
    study = MagicMock()
    study.orthanc_id = "orthanc-abc"
    study.study_uid = "1.2.840.test"
    study.deleted_at = None
    study.series = [series1]

    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = study
    db.execute = AsyncMock(return_value=result)

    await soft_delete_study("orthanc-abc", db)

    assert study.deleted_at is not None
    assert series1.deleted_at is not None
    for inst in series1.instances:
        assert inst.deleted_at is not None
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_soft_delete_study_unknown_orthanc_id():
    """If the orthanc_id is not found in PG, the function should return silently."""
    from app.services.delete_handler import soft_delete_study

    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result)

    await soft_delete_study("nonexistent-id", db)

    db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_soft_delete_study_multiple_series():
    """soft_delete_study should cascade to all series and instances."""
    from app.services.delete_handler import soft_delete_study

    series_list = [make_series_mock(3), make_series_mock(1)]
    study = MagicMock()
    study.orthanc_id = "orthanc-xyz"
    study.study_uid = "1.2.840.multi"
    study.deleted_at = None
    study.series = series_list

    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = study
    db.execute = AsyncMock(return_value=result)

    await soft_delete_study("orthanc-xyz", db)

    assert study.deleted_at is not None
    for s in series_list:
        assert s.deleted_at is not None
        for i in s.instances:
            assert i.deleted_at is not None
