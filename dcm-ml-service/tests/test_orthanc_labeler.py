"""Unit tests for orthanc_labeler service."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
import httpx
import respx


COHORT_ID = uuid4()
ORTHANC_STUDY_ID = "orthanc-study-abc"


@pytest.mark.asyncio
async def test_add_cohort_label_success():
    """add_cohort_label should PUT to Orthanc and succeed on 200."""
    from app.services.orthanc_labeler import add_cohort_label

    with respx.mock(base_url="http://localhost:8042") as mock_orthanc:
        label = f"cohort:{COHORT_ID}"
        mock_orthanc.put(f"/studies/{ORTHANC_STUDY_ID}/labels/{label}").mock(
            return_value=httpx.Response(200)
        )
        with patch("app.services.orthanc_labeler.settings") as mock_settings:
            mock_settings.orthanc_url = "http://localhost:8042"
            mock_settings.orthanc_user = ""
            mock_settings.orthanc_pass = ""
            await add_cohort_label(ORTHANC_STUDY_ID, COHORT_ID)

        assert mock_orthanc.calls.call_count == 1


@pytest.mark.asyncio
async def test_add_cohort_label_logs_warning_on_failure():
    """add_cohort_label should log a warning but not raise when Orthanc returns non-200/201."""
    from app.services.orthanc_labeler import add_cohort_label
    import logging

    with respx.mock(base_url="http://localhost:8042") as mock_orthanc:
        label = f"cohort:{COHORT_ID}"
        mock_orthanc.put(f"/studies/{ORTHANC_STUDY_ID}/labels/{label}").mock(
            return_value=httpx.Response(500)
        )
        with patch("app.services.orthanc_labeler.settings") as mock_settings:
            mock_settings.orthanc_url = "http://localhost:8042"
            mock_settings.orthanc_user = ""
            mock_settings.orthanc_pass = ""
            with patch("app.services.orthanc_labeler.logger") as mock_logger:
                await add_cohort_label(ORTHANC_STUDY_ID, COHORT_ID)
                mock_logger.warning.assert_called_once()


@pytest.mark.asyncio
async def test_remove_cohort_label_success():
    """remove_cohort_label should DELETE from Orthanc and succeed on 200."""
    from app.services.orthanc_labeler import remove_cohort_label

    with respx.mock(base_url="http://localhost:8042") as mock_orthanc:
        label = f"cohort:{COHORT_ID}"
        mock_orthanc.delete(f"/studies/{ORTHANC_STUDY_ID}/labels/{label}").mock(
            return_value=httpx.Response(200)
        )
        with patch("app.services.orthanc_labeler.settings") as mock_settings:
            mock_settings.orthanc_url = "http://localhost:8042"
            mock_settings.orthanc_user = ""
            mock_settings.orthanc_pass = ""
            await remove_cohort_label(ORTHANC_STUDY_ID, COHORT_ID)

        assert mock_orthanc.calls.call_count == 1


@pytest.mark.asyncio
async def test_remove_cohort_label_404_is_silent():
    """remove_cohort_label treats 404 as success (already removed)."""
    from app.services.orthanc_labeler import remove_cohort_label

    with respx.mock(base_url="http://localhost:8042") as mock_orthanc:
        label = f"cohort:{COHORT_ID}"
        mock_orthanc.delete(f"/studies/{ORTHANC_STUDY_ID}/labels/{label}").mock(
            return_value=httpx.Response(404)
        )
        with patch("app.services.orthanc_labeler.settings") as mock_settings:
            mock_settings.orthanc_url = "http://localhost:8042"
            mock_settings.orthanc_user = ""
            mock_settings.orthanc_pass = ""
            with patch("app.services.orthanc_labeler.logger") as mock_logger:
                await remove_cohort_label(ORTHANC_STUDY_ID, COHORT_ID)
                # 404 is in the accepted set — no warning
                mock_logger.warning.assert_not_called()


@pytest.mark.asyncio
async def test_get_cohort_members_from_orthanc_returns_ids():
    """get_cohort_members_from_orthanc should return list of Orthanc study IDs."""
    from app.services.orthanc_labeler import get_cohort_members_from_orthanc

    expected_ids = ["study-001", "study-002"]

    with respx.mock(base_url="http://localhost:8042") as mock_orthanc:
        mock_orthanc.post("/tools/find").mock(
            return_value=httpx.Response(200, json=expected_ids)
        )
        with patch("app.services.orthanc_labeler.settings") as mock_settings:
            mock_settings.orthanc_url = "http://localhost:8042"
            mock_settings.orthanc_user = ""
            mock_settings.orthanc_pass = ""
            result = await get_cohort_members_from_orthanc(COHORT_ID)

        assert result == expected_ids


@pytest.mark.asyncio
async def test_get_cohort_members_orthanc_failure_returns_empty():
    """get_cohort_members_from_orthanc returns [] on Orthanc error."""
    from app.services.orthanc_labeler import get_cohort_members_from_orthanc

    with respx.mock(base_url="http://localhost:8042") as mock_orthanc:
        mock_orthanc.post("/tools/find").mock(
            return_value=httpx.Response(500)
        )
        with patch("app.services.orthanc_labeler.settings") as mock_settings:
            mock_settings.orthanc_url = "http://localhost:8042"
            mock_settings.orthanc_user = ""
            mock_settings.orthanc_pass = ""
            result = await get_cohort_members_from_orthanc(COHORT_ID)

        assert result == []


@pytest.mark.asyncio
async def test_store_cohort_tags_as_metadata():
    """store_cohort_tags_as_metadata should PUT JSON to metadata key 4000."""
    from app.services.orthanc_labeler import store_cohort_tags_as_metadata

    tags = [{"tag": "0008,0060", "name": "Modality", "value": "CT"}]

    with respx.mock(base_url="http://localhost:8042") as mock_orthanc:
        mock_orthanc.put(f"/studies/{ORTHANC_STUDY_ID}/metadata/4000").mock(
            return_value=httpx.Response(200)
        )
        with patch("app.services.orthanc_labeler.settings") as mock_settings:
            mock_settings.orthanc_url = "http://localhost:8042"
            mock_settings.orthanc_user = ""
            mock_settings.orthanc_pass = ""
            await store_cohort_tags_as_metadata(ORTHANC_STUDY_ID, tags)

        assert mock_orthanc.calls.call_count == 1


def test_label_format():
    """_label should produce 'cohort:<uuid>' string."""
    from app.services.orthanc_labeler import _label
    cid = uuid4()
    assert _label(cid) == f"cohort:{cid}"
