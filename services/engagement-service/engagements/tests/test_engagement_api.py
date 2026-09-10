from datetime import date
from unittest import mock

import pytest
from django.urls import reverse

from clients.models import Client
from engagements.models import Engagement
from engagements.services import EngagementService
from services.models import ServiceType, TaskTemplate

pytestmark = pytest.mark.django_db


@pytest.fixture
def client_record() -> Client:
    return Client.objects.create(name="Northwind Traders", email="a@example.com")


@pytest.fixture
def monthly_service() -> ServiceType:
    service = ServiceType.objects.create(
        name="Monthly GST Compliance",
        frequency=ServiceType.Frequency.MONTHLY,
    )
    TaskTemplate.objects.create(
        service_type=service, title="Prepare GSTR-1", sequence=1, default_due_days=10
    )
    return service


@pytest.fixture(autouse=True)
def no_real_broker():
    """Keep the event publisher out of the tests; delivery is the Worker's job."""
    with mock.patch("engagements.services.publish_engagement_created") as publisher:
        yield publisher


def create_payload(client_record, monthly_service) -> dict:
    return {
        "client": client_record.id,
        "service_type": monthly_service.id,
        "period_start": "2026-09-01",
        "period_end": "2026-09-30",
    }


def test_duplicate_engagement_for_the_same_period_returns_409(
    api, manager_user, client_record, monthly_service
):
    api.force_authenticate(user=manager_user)
    payload = create_payload(client_record, monthly_service)

    first = api.post(reverse("engagement-list"), payload, format="json")
    second = api.post(reverse("engagement-list"), payload, format="json")

    assert first.status_code == 201
    assert second.status_code == 409
    assert "already exists" in second.data["detail"]
    assert Engagement.objects.count() == 1


def test_duplicate_is_rejected_by_the_database_not_a_prior_exists_check(
    client_record, monthly_service
):
    """The UNIQUE constraint must hold even if two callers race past validation."""
    EngagementService.create_engagement(
        client=client_record,
        service_type=monthly_service,
        period_start=date(2026, 9, 1),
        period_end=date(2026, 9, 30),
        created_by_id=2,
    )

    from common.exceptions import ConflictError

    with pytest.raises(ConflictError):
        EngagementService.create_engagement(
            client=client_record,
            service_type=monthly_service,
            period_start=date(2026, 9, 1),
            period_end=date(2026, 9, 30),
            created_by_id=99,
        )


def test_team_member_cannot_create_an_engagement(
    api, team_member_user, client_record, monthly_service
):
    api.force_authenticate(user=team_member_user)

    response = api.post(
        reverse("engagement-list"),
        create_payload(client_record, monthly_service),
        format="json",
    )

    assert response.status_code == 403
    assert Engagement.objects.count() == 0


def test_misaligned_monthly_period_is_rejected(
    api, manager_user, client_record, monthly_service
):
    api.force_authenticate(user=manager_user)

    response = api.post(
        reverse("engagement-list"),
        {
            "client": client_record.id,
            "service_type": monthly_service.id,
            "period_start": "2026-09-01",
            "period_end": "2026-09-15",
        },
        format="json",
    )

    assert response.status_code == 400
    assert "2026-09-30" in response.data["detail"]


def test_engagement_created_event_is_published_only_after_commit(
    api, manager_user, client_record, monthly_service, no_real_broker
):
    api.force_authenticate(user=manager_user)

    # django_db wraps the test in a transaction that never commits, so
    # on_commit callbacks are captured rather than run - which is exactly the
    # guarantee under test: nothing is published mid-transaction.
    from django.test import TestCase

    with TestCase.captureOnCommitCallbacks(execute=True) as callbacks:
        response = api.post(
            reverse("engagement-list"),
            create_payload(client_record, monthly_service),
            format="json",
        )

    assert response.status_code == 201
    assert len(callbacks) == 1

    no_real_broker.assert_called_once()
    published = no_real_broker.call_args.kwargs
    assert published["engagement_id"] == response.data["id"]
    assert published["service_type_id"] == monthly_service.id


def test_engagement_for_a_service_without_templates_is_rejected(
    api, manager_user, client_record
):
    empty_service = ServiceType.objects.create(
        name="Empty Service", frequency=ServiceType.Frequency.ONE_TIME
    )
    api.force_authenticate(user=manager_user)

    response = api.post(
        reverse("engagement-list"),
        {
            "client": client_record.id,
            "service_type": empty_service.id,
            "period_start": "2026-09-01",
            "period_end": "2026-09-30",
        },
        format="json",
    )

    assert response.status_code == 400
    assert "no task templates" in response.data["detail"]


def test_recurring_roll_forward_stops_once_it_reaches_the_open_period(
    client_record, monthly_service
):
    august = EngagementService.create_engagement(
        client=client_record,
        service_type=monthly_service,
        period_start=date(2026, 8, 1),
        period_end=date(2026, 8, 31),
        created_by_id=2,
    )

    september = EngagementService.create_next_recurring_engagement(
        engagement=august, today=date(2026, 9, 10)
    )
    assert september is not None
    assert (september.period_start, september.period_end) == (
        date(2026, 9, 1),
        date(2026, 9, 30),
    )

    # September has not closed yet, so the chain must stop here instead of
    # generating periods forever.
    assert (
        EngagementService.create_next_recurring_engagement(
            engagement=september, today=date(2026, 9, 10)
        )
        is None
    )


def test_rolling_forward_twice_does_not_duplicate_the_next_period(
    client_record, monthly_service
):
    august = EngagementService.create_engagement(
        client=client_record,
        service_type=monthly_service,
        period_start=date(2026, 8, 1),
        period_end=date(2026, 8, 31),
        created_by_id=2,
    )

    EngagementService.create_next_recurring_engagement(
        engagement=august, today=date(2026, 9, 10)
    )
    repeated = EngagementService.create_next_recurring_engagement(
        engagement=august, today=date(2026, 9, 10)
    )

    assert repeated is None
    assert Engagement.objects.count() == 2


def test_recurrence_stops_quietly_when_the_client_is_deactivated(
    client_record, monthly_service
):
    """A deactivated client ends the recurrence; it must not raise.

    The Worker calls this over HTTP and calls raise_for_status(). If a domain
    error escaped, every subsequent event for this engagement would exhaust the
    retry budget instead of quietly doing nothing.
    """
    august = EngagementService.create_engagement(
        client=client_record,
        service_type=monthly_service,
        period_start=date(2026, 8, 1),
        period_end=date(2026, 8, 31),
        created_by_id=2,
    )

    client_record.is_active = False
    client_record.save(update_fields=["is_active"])

    assert (
        EngagementService.create_next_recurring_engagement(
            engagement=august, today=date(2026, 9, 10)
        )
        is None
    )
    assert Engagement.objects.count() == 1


def test_recurrence_stops_quietly_when_the_service_loses_its_templates(
    client_record, monthly_service
):
    august = EngagementService.create_engagement(
        client=client_record,
        service_type=monthly_service,
        period_start=date(2026, 8, 1),
        period_end=date(2026, 8, 31),
        created_by_id=2,
    )

    monthly_service.task_templates.all().delete()

    assert (
        EngagementService.create_next_recurring_engagement(
            engagement=august, today=date(2026, 9, 10)
        )
        is None
    )
