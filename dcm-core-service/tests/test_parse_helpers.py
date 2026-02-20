"""Unit tests for parsing helpers in metadata_ingester."""
import pytest
from datetime import time


# ── _parse_time ───────────────────────────────────────────────────────────────

def test_parse_time_six_digits():
    from app.services.metadata_ingester import _parse_time
    result = _parse_time("120345")
    assert result == time(12, 3, 45)


def test_parse_time_four_digits_only():
    """HHММ with no seconds defaults seconds to 0."""
    from app.services.metadata_ingester import _parse_time
    result = _parse_time("0830")
    assert result == time(8, 30, 0)


def test_parse_time_none_returns_none():
    from app.services.metadata_ingester import _parse_time
    assert _parse_time(None) is None


def test_parse_time_empty_string_returns_none():
    from app.services.metadata_ingester import _parse_time
    assert _parse_time("") is None


def test_parse_time_too_short_returns_none():
    from app.services.metadata_ingester import _parse_time
    assert _parse_time("12") is None


def test_parse_time_invalid_values_return_none():
    from app.services.metadata_ingester import _parse_time
    assert _parse_time("999999") is None  # hour=99 invalid


def test_parse_time_midnight():
    from app.services.metadata_ingester import _parse_time
    assert _parse_time("000000") == time(0, 0, 0)


# ── _parse_date (extended edge cases) ─────────────────────────────────────────

def test_parse_date_valid():
    from app.services.metadata_ingester import _parse_date
    from datetime import date
    assert _parse_date("20230615") == date(2023, 6, 15)


def test_parse_date_february_29_leap_year():
    from app.services.metadata_ingester import _parse_date
    from datetime import date
    assert _parse_date("20240229") == date(2024, 2, 29)


def test_parse_date_february_29_non_leap_year_returns_none():
    from app.services.metadata_ingester import _parse_date
    assert _parse_date("20230229") is None  # 2023 is not a leap year


def test_parse_date_month_13_returns_none():
    from app.services.metadata_ingester import _parse_date
    assert _parse_date("20231315") is None


def test_parse_date_exact_8_chars_valid():
    from app.services.metadata_ingester import _parse_date
    from datetime import date
    assert _parse_date("20010101") == date(2001, 1, 1)


def test_parse_date_7_chars_returns_none():
    from app.services.metadata_ingester import _parse_date
    assert _parse_date("2023061") is None


# ── _safe_int (module-level helper extracted from duplicate inner functions) ──

def test_safe_int_valid():
    from app.services.metadata_ingester import _safe_int
    assert _safe_int("5") == 5
    assert _safe_int("0") == 0
    assert _safe_int("") is None
    assert _safe_int(None) is None
    assert _safe_int("abc") is None
    assert _safe_int("3.5") is None
