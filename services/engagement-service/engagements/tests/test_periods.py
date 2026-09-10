from datetime import date

import pytest

from engagements.periods import next_period, period_errors
from services.models import ServiceType

MONTHLY = ServiceType.Frequency.MONTHLY
QUARTERLY = ServiceType.Frequency.QUARTERLY
YEARLY = ServiceType.Frequency.YEARLY
ONE_TIME = ServiceType.Frequency.ONE_TIME


@pytest.mark.parametrize(
    "frequency,start,end",
    [
        (MONTHLY, date(2026, 9, 1), date(2026, 9, 30)),
        (MONTHLY, date(2026, 2, 1), date(2026, 2, 28)),
        (QUARTERLY, date(2026, 4, 1), date(2026, 6, 30)),
        (YEARLY, date(2026, 1, 1), date(2026, 12, 31)),
        (ONE_TIME, date(2026, 9, 14), date(2026, 10, 3)),
    ],
)
def test_valid_periods_are_accepted(frequency, start, end):
    assert period_errors(frequency=frequency, period_start=start, period_end=end) == []


@pytest.mark.parametrize(
    "frequency,start,end",
    [
        # Ends mid-month rather than on the last day.
        (MONTHLY, date(2026, 9, 1), date(2026, 9, 15)),
        # Does not start on the 1st.
        (MONTHLY, date(2026, 9, 5), date(2026, 9, 30)),
        # A quarter must start in Jan/Apr/Jul/Oct.
        (QUARTERLY, date(2026, 5, 1), date(2026, 7, 31)),
        # End before start.
        (ONE_TIME, date(2026, 9, 10), date(2026, 9, 1)),
    ],
)
def test_misaligned_periods_are_rejected(frequency, start, end):
    assert period_errors(frequency=frequency, period_start=start, period_end=end)


def test_next_period_advances_by_the_service_frequency():
    monthly = next_period(
        frequency=MONTHLY, period_start=date(2026, 12, 1), period_end=date(2026, 12, 31)
    )
    assert (monthly.start, monthly.end) == (date(2027, 1, 1), date(2027, 1, 31))

    quarterly = next_period(
        frequency=QUARTERLY, period_start=date(2026, 10, 1), period_end=date(2026, 12, 31)
    )
    assert (quarterly.start, quarterly.end) == (date(2027, 1, 1), date(2027, 3, 31))


def test_one_time_services_have_no_next_period():
    assert (
        next_period(
            frequency=ONE_TIME, period_start=date(2026, 9, 1), period_end=date(2026, 9, 30)
        )
        is None
    )
