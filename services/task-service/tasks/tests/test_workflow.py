"""Workflow enforcement: the transitions the backend accepts and rejects."""

import pytest

from common.exceptions import PermissionDeniedError
from tasks.models import Task, TaskHistory
from tasks.services import InvalidWorkflowTransition, TaskService

pytestmark = pytest.mark.django_db

Status = Task.Status


def test_the_happy_path_runs_not_started_to_completed(
    make_task, team_member_user, manager_user
):
    task = make_task(assigned_to_id=team_member_user.id)

    TaskService.change_status(
        task=task, new_status=Status.IN_PROGRESS, user=team_member_user
    )
    TaskService.change_status(
        task=task, new_status=Status.READY_FOR_REVIEW, user=team_member_user
    )
    task = TaskService.approve(task=task, user=manager_user)

    assert task.status == Status.COMPLETED
    assert task.completed_at is not None


@pytest.mark.parametrize(
    "from_status,to_status",
    [
        (Status.NOT_STARTED, Status.COMPLETED),
        (Status.NOT_STARTED, Status.READY_FOR_REVIEW),
        (Status.IN_PROGRESS, Status.COMPLETED),
        (Status.WAITING_FOR_CLIENT, Status.READY_FOR_REVIEW),
        (Status.COMPLETED, Status.IN_PROGRESS),
        (Status.CHANGES_REQUESTED, Status.READY_FOR_REVIEW),
    ],
)
def test_invalid_transitions_are_rejected(
    make_task, admin_user, from_status, to_status
):
    task = make_task(status=from_status, assigned_to_id=99)

    with pytest.raises(InvalidWorkflowTransition):
        TaskService.change_status(task=task, new_status=to_status, user=admin_user)

    task.refresh_from_db()
    assert task.status == from_status
    assert not TaskHistory.objects.filter(task=task).exists()


def test_waiting_for_client_returns_to_in_progress(make_task, team_member_user):
    task = make_task(
        status=Status.IN_PROGRESS, assigned_to_id=team_member_user.id
    )

    TaskService.change_status(
        task=task, new_status=Status.WAITING_FOR_CLIENT, user=team_member_user
    )
    task = TaskService.change_status(
        task=task, new_status=Status.IN_PROGRESS, user=team_member_user
    )

    assert task.status == Status.IN_PROGRESS


def test_requesting_changes_sends_the_task_back_to_in_progress(
    make_task, team_member_user, manager_user
):
    task = make_task(
        status=Status.READY_FOR_REVIEW, assigned_to_id=team_member_user.id
    )

    task = TaskService.request_changes(
        task=task, user=manager_user, comment="Reconciliation is missing March."
    )
    assert task.status == Status.CHANGES_REQUESTED

    task = TaskService.change_status(
        task=task, new_status=Status.IN_PROGRESS, user=team_member_user
    )
    assert task.status == Status.IN_PROGRESS


def test_requesting_changes_requires_a_comment(make_task, manager_user):
    from common.exceptions import DomainError

    task = make_task(status=Status.READY_FOR_REVIEW, assigned_to_id=99)

    with pytest.raises(DomainError):
        TaskService.request_changes(task=task, user=manager_user, comment="   ")


def test_every_status_change_is_recorded_in_history(
    make_task, team_member_user, manager_user
):
    task = make_task(assigned_to_id=team_member_user.id)

    TaskService.change_status(
        task=task, new_status=Status.IN_PROGRESS, user=team_member_user
    )
    TaskService.change_status(
        task=task,
        new_status=Status.READY_FOR_REVIEW,
        user=team_member_user,
        comment="Ready for your review.",
    )
    TaskService.approve(task=task, user=manager_user, comment="Looks good.")

    history = list(TaskHistory.objects.filter(task=task).order_by("id"))

    assert [(h.from_status, h.to_status) for h in history] == [
        (Status.NOT_STARTED, Status.IN_PROGRESS),
        (Status.IN_PROGRESS, Status.READY_FOR_REVIEW),
        (Status.READY_FOR_REVIEW, Status.COMPLETED),
    ]
    assert history[-1].changed_by_id == manager_user.id
    assert history[-1].comment == "Looks good."


def test_reopening_is_impossible_once_completed(make_task, manager_user):
    task = make_task(status=Status.COMPLETED, assigned_to_id=99)

    for target in Status.values:
        if target == Status.COMPLETED:
            continue
        with pytest.raises(InvalidWorkflowTransition):
            TaskService.change_status(task=task, new_status=target, user=manager_user)
