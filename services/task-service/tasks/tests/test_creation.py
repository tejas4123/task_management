"""Manual task creation: who may do it, and what the constraint guarantees."""

from datetime import date, timedelta

import pytest
from django.urls import reverse

from common.exceptions import ConflictError, PermissionDeniedError
from tasks.models import Task
from tasks.services import TaskService

pytestmark = pytest.mark.django_db

Status = Task.Status


def payload(**overrides) -> dict:
    base = {
        "engagement_id": 1,
        "template_id": 1,
        "title": "Collect bank statements",
        "description": "From the client portal.",
        "due_date": str(date.today() + timedelta(days=5)),
        "assigned_to_id": 3,
    }
    base.update(overrides)
    return base


def test_manager_creates_a_task(api, manager_user):
    api.force_authenticate(user=manager_user)
    response = api.post(reverse("task-list"), payload(), format="json")

    assert response.status_code == 201

    task = Task.objects.get(pk=response.data["id"])
    assert task.title == "Collect bank statements"
    assert task.status == Status.NOT_STARTED
    # A human made this one, so the audit trail must not claim the worker did.
    assert task.created_by_type == Task.CreatorType.USER
    assert task.created_by_id == manager_user.id


def test_team_member_cannot_create_a_task_over_http(api, team_member_user):
    api.force_authenticate(user=team_member_user)
    response = api.post(reverse("task-list"), payload(), format="json")

    assert response.status_code == 403
    assert Task.objects.count() == 0


def test_team_member_cannot_create_a_task_through_the_service_layer(team_member_user):
    """The role check is in the service, not only in the permission class."""
    with pytest.raises(PermissionDeniedError):
        TaskService.create_task(data=payload(), user=team_member_user)

    assert Task.objects.count() == 0


def test_an_unauthenticated_caller_cannot_create_a_task(anonymous_api):
    response = anonymous_api.post(reverse("task-list"), payload(), format="json")

    assert response.status_code == 401
    assert Task.objects.count() == 0


def test_duplicate_template_for_one_engagement_is_a_409(api, make_task, manager_user):
    existing = make_task(engagement_id=7, template_id=4)

    api.force_authenticate(user=manager_user)
    response = api.post(
        reverse("task-list"),
        payload(engagement_id=existing.engagement_id, template_id=existing.template_id),
        format="json",
    )

    assert response.status_code == 409
    assert "already has a task" in response.data["detail"]
    assert Task.objects.filter(engagement_id=7).count() == 1


def test_a_blank_title_is_rejected(api, manager_user):
    api.force_authenticate(user=manager_user)
    response = api.post(reverse("task-list"), payload(title="   "), format="json")

    assert response.status_code == 400
    assert Task.objects.count() == 0


def test_a_created_task_can_be_left_unassigned(api, manager_user):
    api.force_authenticate(user=manager_user)
    response = api.post(
        reverse("task-list"), payload(assigned_to_id=None), format="json"
    )

    assert response.status_code == 201
    assert response.data["assigned_to_id"] is None


def test_a_created_task_appears_in_the_list(api, manager_user):
    api.force_authenticate(user=manager_user)
    created = api.post(reverse("task-list"), payload(), format="json")

    listed = api.get(reverse("task-list"))

    assert [item["id"] for item in listed.data["results"]] == [created.data["id"]]


def test_a_created_task_enters_the_normal_workflow(api, manager_user):
    """No special-casing downstream: it starts where every other task starts."""
    api.force_authenticate(user=manager_user)
    created = api.post(reverse("task-list"), payload(), format="json")

    assert created.data["allowed_transitions"] == [Status.IN_PROGRESS.value]
