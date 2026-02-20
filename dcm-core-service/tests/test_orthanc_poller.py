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


# ── _reconcile_deletions ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_reconcile_soft_deletes_missing_studies():
    """Studies in DB but absent from Orthanc should be soft-deleted."""
    from app.services.orthanc_poller import _reconcile_deletions

    study_present = MagicMock()
    study_present.orthanc_id = "orthanc-present"
    study_present.study_uid = "1.2.3.present"

    study_missing = MagicMock()
    study_missing.orthanc_id = "orthanc-missing"
    study_missing.study_uid = "1.2.3.missing"

    result = MagicMock()
    result.scalars.return_value.all.return_value = [study_present, study_missing]

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=result)
    mock_db.__aenter__ = AsyncMock(return_value=mock_db)
    mock_db.__aexit__ = AsyncMock(return_value=False)

    with patch("app.services.orthanc_poller.orthanc_client.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = ["orthanc-present"]
        with patch("app.services.orthanc_poller.AsyncSessionLocal", return_value=mock_db):
            with patch("app.services.orthanc_poller.soft_delete_study", new_callable=AsyncMock) as mock_del:
                with patch("app.services.orthanc_poller.STUDIES_DELETED") as mock_counter:
                    await _reconcile_deletions()

    mock_del.assert_awaited_once_with("orthanc-missing", mock_db)
    mock_counter.inc.assert_called_once()


@pytest.mark.asyncio
async def test_reconcile_no_deletions_when_all_present():
    """No soft-deletes if all DB studies are still in Orthanc."""
    from app.services.orthanc_poller import _reconcile_deletions

    study = MagicMock()
    study.orthanc_id = "orthanc-abc"
    study.study_uid = "1.2.3"

    result = MagicMock()
    result.scalars.return_value.all.return_value = [study]

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=result)
    mock_db.__aenter__ = AsyncMock(return_value=mock_db)
    mock_db.__aexit__ = AsyncMock(return_value=False)

    with patch("app.services.orthanc_poller.orthanc_client.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = ["orthanc-abc"]
        with patch("app.services.orthanc_poller.AsyncSessionLocal", return_value=mock_db):
            with patch("app.services.orthanc_poller.soft_delete_study", new_callable=AsyncMock) as mock_del:
                await _reconcile_deletions()

    mock_del.assert_not_awaited()


@pytest.mark.asyncio
async def test_reconcile_handles_orthanc_error_gracefully():
    """If Orthanc is unreachable, reconcile should log and return without crashing."""
    from app.services.orthanc_poller import _reconcile_deletions

    with patch("app.services.orthanc_poller.orthanc_client.get", new_callable=AsyncMock) as mock_get:
        mock_get.side_effect = Exception("connection refused")
        with patch("app.services.orthanc_poller.soft_delete_study", new_callable=AsyncMock) as mock_del:
            await _reconcile_deletions()  # must not raise

    mock_del.assert_not_awaited()
