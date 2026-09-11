"""Deleting catalogue records that engagements still reference.

`ServiceType` is referenced by `Engagement` with on_delete=PROTECT. Django
raises ProtectedError, which is not a DRF APIException - so without explicit
handling it escaped the exception handler as a 500 carrying an HTML debug page.
It is a conflict with existing state, which is a 409.
"""

from datetime import date

import pytest
from django.urls import reverse

from clients.models import Client
from engagements.models import Engagement
from services.models import ServiceType

pytestmark = pytest.mark.django_db


@pytest.fixture
def service_in_use() -> ServiceType:
    service = ServiceType.objects.create(name="In Use", frequency="MONTHLY")
    client = Client.objects.create(name="Acme")
    Engagement.objects.create(
        client=client,
        service_type=service,
        period_start=date(2026, 1, 1),
        period_end=date(2026, 1, 31),
        created_by_id=1,
    )
    return service


def test_deleting_a_service_in_use_is_a_409_not_a_500(api, admin_user, service_in_use):
    api.force_authenticate(user=admin_user)
    response = api.delete(reverse("service-type-detail", args=[service_in_use.id]))

    assert response.status_code == 409
    assert "cannot be deleted" in response.data["detail"]
    assert ServiceType.objects.filter(pk=service_in_use.pk).exists()


def test_an_unused_service_can_still_be_deleted(api, admin_user):
    service = ServiceType.objects.create(name="Unused", frequency="ONE_TIME")

    api.force_authenticate(user=admin_user)
    response = api.delete(reverse("service-type-detail", args=[service.id]))

    assert response.status_code == 204
    assert not ServiceType.objects.filter(pk=service.pk).exists()
