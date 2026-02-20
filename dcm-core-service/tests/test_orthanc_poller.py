"""Unit tests for the Orthanc change poller helpers."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call
import asyncio


# ── _get_last_seq ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_last_seq_returns_stored_value():
    from app.services.orthanc_poller import _get_last_seq

    row = MagicMock()
    row.last_seq = 42
    result = MagicMock()
    result.scalar_one_or_none.return_value = row

    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)

    seq = await _get_last_seq(db)
    assert seq == 42


@pytest.mark.asyncio
async def test_get_last_seq_returns_zero_when_no_row():
    from app.services.orthanc_poller import _get_last_seq

    result = MagicMock()
    result.scalar_one_or_none.return_value = None

    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)

    seq = await _get_last_seq(db)
    assert seq == 0


# ── _save_last_seq ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_save_last_seq_commits():
    from app.services.orthanc_poller import _save_last_seq

    db = AsyncMock()
    await _save_last_seq(99, db)

    db.execute.assert_awaited_once()
    db.commit.assert_awaited_once()


# ── _dispatch ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_dispatch_stable_study():
    from app.services.orthanc_poller import _dispatch

    db = AsyncMock()
    change = {"ChangeType": "StableStudy", "ID": "study-1"}

    with patch("app.services.orthanc_poller.ingest_study", new_callable=AsyncMock) as mock_ingest:
        with patch("app.services.orthanc_poller.STUDIES_INGESTED") as mock_counter:
            await _dispatch(change, db)

    mock_ingest.assert_awaited_once_with("study-1", db)
    mock_counter.inc.assert_called_once()


@pytest.mark.asyncio
async def test_dispatch_deleted_study():
    from app.services.orthanc_poller import _dispatch

    db = AsyncMock()
    change = {"ChangeType": "DeletedStudy", "ID": "study-del"}

    with patch("app.services.orthanc_poller.soft_delete_study", new_callable=AsyncMock) as mock_del:
        with patch("app.services.orthanc_poller.STUDIES_DELETED") as mock_counter:
            await _dispatch(change, db)

    mock_del.assert_awaited_once_with("study-del", db)
    mock_counter.inc.assert_called_once()


@pytest.mark.asyncio
async def test_dispatch_unknown_type_is_noop():
    from app.services.orthanc_poller import _dispatch

    db = AsyncMock()
    change = {"ChangeType": "NewSeries", "ID": "series-1"}

    with patch("app.services.orthanc_poller.ingest_study", new_callable=AsyncMock) as mock_ingest:
        with patch("app.services.orthanc_poller.soft_delete_study", new_callable=AsyncMock) as mock_del:
            await _dispatch(change, db)

    mock_ingest.assert_not_awaited()
    mock_del.assert_not_awaited()


@pytest.mark.asyncio
async def test_dispatch_missing_change_type_is_noop():
    from app.services.orthanc_poller import _dispatch

    db = AsyncMock()
    change = {"ID": "study-x"}  # no ChangeType key

    with patch("app.services.orthanc_poller.ingest_study", new_callable=AsyncMock) as mock_ingest:
        with patch("app.services.orthanc_poller.soft_delete_study", new_callable=AsyncMock) as mock_del:
            await _dispatch(change, db)

    mock_ingest.assert_not_awaited()
    mock_del.assert_not_awaited()
