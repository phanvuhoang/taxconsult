"""Parse user time_period string → structured period info."""
import re
from datetime import date, timedelta
import calendar


def parse_time_period(time_period: str) -> dict:
    """
    Parse time_period string → structured period info.

    Examples:
      "2025"          → {start: 2025-01-01, end: 2025-12-31, label: "năm 2025"}
      "trước 10/2025" → {start: None, end: 2025-09-30, label: "trước tháng 10/2025"}
      "2020-2024"     → {start: 2020-01-01, end: 2024-12-31, label: "2020-2024"}
      "hiện tại"      → {start: None, end: today, label: "hiện tại (2026)"}
      None            → {start: None, end: today, label: "hiện tại"}
    """
    today = date.today()

    if not time_period or time_period.strip().lower() in ("hiện tại", "hien tai", ""):
        return {
            "start_date": None,
            "end_date": today.isoformat(),
            "label": f"hiện tại ({today.year})",
            "include_expired": False,
        }

    tp = time_period.strip()

    # "trước MM/YYYY"
    m = re.match(r'trước\s+(\d{1,2})/(\d{4})', tp, re.IGNORECASE)
    if m:
        month, year = int(m.group(1)), int(m.group(2))
        # end = last day of month BEFORE the given month
        if month == 1:
            end_month, end_year = 12, year - 1
        else:
            end_month, end_year = month - 1, year
        last_day = calendar.monthrange(end_year, end_month)[1]
        end_date = date(end_year, end_month, last_day)
        return {
            "start_date": None,
            "end_date": end_date.isoformat(),
            "label": f"trước tháng {month}/{year}",
            "include_expired": True,
        }

    # "sau MM/YYYY"
    m = re.match(r'sau\s+(\d{1,2})/(\d{4})', tp, re.IGNORECASE)
    if m:
        month, year = int(m.group(1)), int(m.group(2))
        start_date = date(year, month, 1)
        return {
            "start_date": start_date.isoformat(),
            "end_date": today.isoformat(),
            "label": f"sau tháng {month}/{year}",
            "include_expired": False,
        }

    # "YYYY-YYYY" year range
    m = re.match(r'(\d{4})\s*[-–]\s*(\d{4})', tp)
    if m:
        start_year, end_year = int(m.group(1)), int(m.group(2))
        include_expired = end_year < today.year
        return {
            "start_date": f"{start_year}-01-01",
            "end_date": f"{end_year}-12-31",
            "label": f"{start_year}-{end_year}",
            "include_expired": include_expired,
        }

    # Single "YYYY"
    m = re.match(r'^(\d{4})$', tp)
    if m:
        year = int(m.group(1))
        include_expired = year < today.year
        return {
            "start_date": f"{year}-01-01",
            "end_date": f"{year}-12-31",
            "label": f"năm {year}",
            "include_expired": include_expired,
        }

    # "MM/YYYY"
    m = re.match(r'^(\d{1,2})/(\d{4})$', tp)
    if m:
        month, year = int(m.group(1)), int(m.group(2))
        last_day = calendar.monthrange(year, month)[1]
        return {
            "start_date": f"{year}-{month:02d}-01",
            "end_date": f"{year}-{month:02d}-{last_day:02d}",
            "label": f"tháng {month}/{year}",
            "include_expired": date(year, month, last_day) < today,
        }

    # Fallback
    return {
        "start_date": None,
        "end_date": today.isoformat(),
        "label": tp,
        "include_expired": False,
    }
