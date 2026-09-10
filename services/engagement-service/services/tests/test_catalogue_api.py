import pytest
from django.conf import settings
from django.urls import reverse

from services.models import ServiceType, TaskTemplate

pytestmark = pytest.mark.django_db


@pytest.fixture
def service() -> ServiceType:
    return ServiceType.objects.create(
        name="Monthly GST Compliance", frequency=ServiceType.Frequency.MONTHLY
    )


def test_is_recurring_is_derived_from_frequency(service):
    assert service.is_recurring is True

    one_time = ServiceType.objects.create(
        name="GST Registration", frequency=ServiceType.Frequency.ONE_TIME
    )
    assert one_time.is_recurring is False


def test_manager_cannot_create_a_service_type(api, manager_user):
    api.force_authenticate(user=manager_user)

    response = api.post(
        reverse("service-type-list"),
        {"name": "Ad-hoc Advisory", "frequency": "ONE_TIME"},
        format="json",
    )

    assert response.status_code == 403
    assert not ServiceType.objects.filter(name="Ad-hoc Advisory").exists()


def test_duplicate_template_sequence_is_rejected(api, admin_user, service):
    TaskTemplate.objects.create(service_type=service, title="Step 1", sequence=1)
    api.force_authenticate(user=admin_user)

    response = api.post(
        reverse("task-template-list"),
        {"service_type": service.id, "title": "Another step 1", "sequence": 1},
        format="json",
    )

    assert response.status_code == 400
    assert service.task_templates.count() == 1


def test_internal_template_endpoint_rejects_a_user_jwt(
    api, anonymous_api, admin_user, service
):
    TaskTemplate.objects.create(service_type=service, title="Step 1", sequence=1)
    url = reverse("internal-task-templates", args=[service.id])

    # Even an admin's token is not enough: this endpoint is service-to-service.
    api.force_authenticate(user=admin_user)
    assert api.get(url).status_code == 403

    allowed = anonymous_api.get(
        url, HTTP_X_INTERNAL_TOKEN=settings.INTERNAL_SERVICE_TOKEN
    )
    assert allowed.status_code == 200
    assert [t["title"] for t in allowed.data] == ["Step 1"]
