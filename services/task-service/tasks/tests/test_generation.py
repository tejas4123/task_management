"""Task generation must tolerate at-least-once event delivery."""

import pytest
from django.conf import settings
from django.urls import reverse

from tasks.generation import TaskGenerationService
from tasks.models import Task

pytestmark = pytest.mark.django_db

PAYLOAD = {
    "engagement_id": 5,
    "tasks": [
        {"template_id": 1, "title": "Collect registers", "due_date": "2026-09-04"},
        {"template_id": 2, "title": "Reconcile GSTR-2B", "due_date": "2026-09-08"},
        {"template_id": 3, "title": "File GSTR-3B", "due_date": "2026-09-16"},
    ],
}


def test_generation_is_idempotent():
    first = TaskGenerationService.bulk_create(
        engagement_id=5, tasks_data=list(PAYLOAD["tasks"])
    )
    second = TaskGenerationService.bulk_create(
        engagement_id=5, tasks_data=list(PAYLOAD["tasks"])
    )

    assert first["created_count"] == 3
    assert second["created_count"] == 0
    assert second["skipped_count"] == 3
    assert Task.objects.filter(engagement_id=5).count() == 3


def test_a_partially_delivered_batch_only_creates_what_is_missing():
    TaskGenerationService.bulk_create(
        engagement_id=5, tasks_data=[PAYLOAD["tasks"][0]]
    )

    result = TaskGenerationService.bulk_create(
        engagement_id=5, tasks_data=list(PAYLOAD["tasks"])
    )

    assert result["created_count"] == 2
    assert Task.objects.filter(engagement_id=5).count() == 3


def test_generated_tasks_are_marked_as_system_created():
    TaskGenerationService.bulk_create(engagement_id=5, tasks_data=list(PAYLOAD["tasks"]))

    task = Task.objects.filter(engagement_id=5).first()

    assert task.created_by_type == Task.CreatorType.SYSTEM
    assert task.created_by_id is None
    assert task.assigned_to_id is None
    assert task.status == Task.Status.NOT_STARTED


def test_the_same_template_may_be_used_by_a_different_engagement():
    TaskGenerationService.bulk_create(engagement_id=5, tasks_data=list(PAYLOAD["tasks"]))
    result = TaskGenerationService.bulk_create(
        engagement_id=6, tasks_data=list(PAYLOAD["tasks"])
    )

    assert result["created_count"] == 3


def test_bulk_create_endpoint_requires_the_internal_service_token(
    api, anonymous_api, manager_user
):
    url = reverse("internal-task-bulk-create")

    # A manager's JWT must not be able to inject tasks directly.
    api.force_authenticate(user=manager_user)
    assert api.post(url, PAYLOAD, format="json").status_code == 403
    assert Task.objects.count() == 0

    allowed = anonymous_api.post(
        url,
        PAYLOAD,
        format="json",
        HTTP_X_INTERNAL_TOKEN=settings.INTERNAL_SERVICE_TOKEN,
    )
    assert allowed.status_code == 201
    assert allowed.data["created_count"] == 3


def test_replaying_the_event_over_http_returns_200_not_an_error(anonymous_api):
    url = reverse("internal-task-bulk-create")
    headers = {"HTTP_X_INTERNAL_TOKEN": settings.INTERNAL_SERVICE_TOKEN}

    anonymous_api.post(url, PAYLOAD, format="json", **headers)
    replay = anonymous_api.post(url, PAYLOAD, format="json", **headers)

    assert replay.status_code == 200
    assert replay.data["created_count"] == 0
    assert replay.data["total_tasks"] == 3
