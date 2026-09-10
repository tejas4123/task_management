"""Reporting-period rules for recurring services.

A "period" is the compliance window an engagement covers (September 2026,
Q2 FY26, ...). Recurring services must line up with calendar boundaries: it is
what makes ``UNIQUE(client, service, period_start, period_end)`` a meaningful
duplicate check rather than an accident of whichever dates were typed in.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date

from services.models import ServiceType

MONTHS_PER_PERIOD = {
    ServiceType.Frequency.MONTHLY: 1,
    ServiceType.Frequency.QUARTERLY: 3,
    ServiceType.Frequency.YEARLY: 12,
}


@dataclass(frozen=True)
class Period:
    start: date
    end: date


def _add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _last_day_of_month(value: date) -> date:
    return value.replace(day=calendar.monthrange(value.year, value.month)[1])


def period_errors(
    *,
    frequency: str,
    period_start: date,
    period_end: date,
) -> list[str]:
    """Return the reasons this period is invalid for the frequency (empty = valid)."""

    errors: list[str] = []

    if period_end < period_start:
        errors.append("period_end must be on or after period_start.")
        return errors

    months = MONTHS_PER_PERIOD.get(frequency)

    if months is None:
        # ONE_TIME engagements can cover any window.
        return errors

    if period_start.day != 1:
        errors.append(
            f"A {frequency.lower()} service must start on the first day of a month."
        )

    expected_end = _last_day_of_month(_add_months(period_start.replace(day=1), months - 1))

    if period_end != expected_end:
        errors.append(
            f"A {frequency.lower()} period starting {period_start.isoformat()} "
            f"must end on {expected_end.isoformat()}."
        )

    if frequency == ServiceType.Frequency.QUARTERLY and period_start.month % 3 != 1:
        errors.append("A quarterly period must start in January, April, July or October.")

    return errors


def next_period(*, frequency: str, period_start: date, period_end: date) -> Period | None:
    """The period that follows this one, or ``None`` for non-recurring services."""

    months = MONTHS_PER_PERIOD.get(frequency)

    if months is None:
        return None

    start = _add_months(period_start.replace(day=1), months)
    end = _last_day_of_month(_add_months(start, months - 1))

    return Period(start=start, end=end)
