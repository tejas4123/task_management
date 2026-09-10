"""HTTP-level checks: scoping, status codes and the dashboard."""

from datetime import date, timedelta

import pytest
from django.urls import reverse

from tasks.models import Task

pytestmark = pytest.mark.django_db

Status = Task.Status


def test_team_members_only_see_their_own_tasks(api, make_task, team_member_user):
    make_task(assigned_to_id=team_member_user.id)
    make_task(assigned_to_id=999)

    api.force_authenticate(user=team_member_user)
    response = api.get(reverse("task-list"))

    assert response.status_code == 200
    assert len(response.data["results"]) == 1
    assert response.data["results"][0]["assigned_to_id"] == team_member_user.id


def test_a_team_member_cannot_even_read_someone_elses_task(
    api, make_task, team_member_user
):
    other = make_task(assigned_to_id=999)

    api.force_authenticate(user=team_member_user)
    response = api.get(reverse("task-detail", args=[other.id]))

    assert response.status_code == 404


def test_managers_see_every_task(api, make_task, manager_user):
    make_task(assigned_to_id=3)
    make_task(assigned_to_id=4)

    api.force_authenticate(user=manager_user)
    response = api.get(reverse("task-list"))

    assert len(response.data["results"]) == 2


def test_invalid_transition_over_http_returns_400_with_a_readable_detail(
    api, make_task, manager_user
):
    task = make_task(assigned_to_id=3)
    api.force_authenticate(user=manager_user)

    response = api.post(
        reverse("task-change-status", args=[task.id]),
        {"status": Status.COMPLETED},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["detail"] == "Cannot transition from NOT_STARTED to COMPLETED."


def test_unauthorized_status_change_over_http_returns_403(
    api, make_task, team_member_user
):
    task = make_task(status=Status.READY_FOR_REVIEW, assigned_to_id=team_member_user.id)
    api.force_authenticate(user=team_member_user)

    response = api.post(
        reverse("task-approve", args=[task.id]), {}, format="json"
    )

    assert response.status_code == 403


def test_task_detail_includes_the_audit_history(api, make_task, manager_user):
    task = make_task(status=Status.READY_FOR_REVIEW, assigned_to_id=3)
    api.force_authenticate(user=manager_user)

    api.post(
        reverse("task-request-changes", args=[task.id]),
        {"comment": "Please attach the challan."},
        format="json",
    )

    response = api.get(reverse("task-detail", args=[task.id]))

    assert response.status_code == 200
    assert len(response.data["history"]) == 1
    assert response.data["history"][0]["comment"] == "Please attach the challan."
    assert response.data["status"] == Status.CHANGES_REQUESTED


def test_allowed_transitions_are_advertised_to_the_client(api, make_task, manager_user):
    task = make_task(status=Status.READY_FOR_REVIEW, assigned_to_id=3)
    api.force_authenticate(user=manager_user)

    response = api.get(reverse("task-detail", args=[task.id]))

    assert response.data["allowed_transitions"] == ["CHANGES_REQUESTED", "COMPLETED"]


def test_dashboard_counts_are_scoped_to_the_caller(api, make_task, team_member_user):
    today = date.today()

    make_task(assigned_to_id=team_member_user.id, due_date=today - timedelta(days=2))
    make_task(assigned_to_id=team_member_user.id, due_date=today)
    make_task(
        assigned_to_id=team_member_user.id,
        status=Status.WAITING_FOR_CLIENT,
        due_date=today + timedelta(days=5),
    )
    make_task(assigned_to_id=999, due_date=today - timedelta(days=10))

    api.force_authenticate(user=team_member_user)
    response = api.get(reverse("task-dashboard"))

    assert response.status_code == 200
    assert response.data["total"] == 3
    assert response.data["open_tasks"] == 3
    assert response.data["overdue"] == 1
    assert response.data["due_today"] == 1
    assert response.data["waiting_for_client"] == 1
    assert response.data["waiting_for_review"] == 0


def test_dashboard_excludes_completed_tasks_from_overdue(api, make_task, manager_user):
    make_task(
        status=Status.COMPLETED,
        assigned_to_id=3,
        due_date=date.today() - timedelta(days=30),
    )

    api.force_authenticate(user=manager_user)
    response = api.get(reverse("task-dashboard"))

    assert response.data["overdue"] == 0
    assert response.data["completed"] == 1


def test_tasks_can_be_filtered_by_status_and_engagement(api, make_task, manager_user):
    make_task(engagement_id=1, status=Status.IN_PROGRESS)
    make_task(engagement_id=1, status=Status.NOT_STARTED)
    make_task(engagement_id=2, status=Status.IN_PROGRESS)

    api.force_authenticate(user=manager_user)

    by_status = api.get(reverse("task-list"), {"status": Status.IN_PROGRESS})
    assert len(by_status.data["results"]) == 2

    by_engagement = api.get(reverse("task-list"), {"engagement_id": 1})
    assert len(by_engagement.data["results"]) == 2


def test_anonymous_requests_are_rejected(api):
    assert api.get(reverse("task-list")).status_code == 401
