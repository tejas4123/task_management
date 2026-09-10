"""Server-side authorization. The frontend hiding a button proves nothing."""

import pytest

from common.authentication import TokenUser
from common.exceptions import PermissionDeniedError
from tasks.models import Task
from tasks.services import TaskService

pytestmark = pytest.mark.django_db

Status = Task.Status


def test_team_member_cannot_update_another_members_task(make_task, team_member_user):
    task = make_task(assigned_to_id=999)

    with pytest.raises(PermissionDeniedError):
        TaskService.change_status(
            task=task, new_status=Status.IN_PROGRESS, user=team_member_user
        )

    task.refresh_from_db()
    assert task.status == Status.NOT_STARTED


def test_team_member_cannot_approve_work(make_task, team_member_user):
    task = make_task(
        status=Status.READY_FOR_REVIEW, assigned_to_id=team_member_user.id
    )

    with pytest.raises(PermissionDeniedError):
        TaskService.approve(task=task, user=team_member_user)

    task.refresh_from_db()
    assert task.status == Status.READY_FOR_REVIEW


def test_team_member_cannot_request_changes(make_task, team_member_user):
    task = make_task(status=Status.READY_FOR_REVIEW, assigned_to_id=team_member_user.id)

    with pytest.raises(PermissionDeniedError):
        TaskService.request_changes(
            task=task, user=team_member_user, comment="Approving myself."
        )


def test_manager_cannot_approve_a_task_assigned_to_themselves(make_task, manager_user):
    """Self-approval is blocked by assignment, not by role."""
    task = make_task(status=Status.READY_FOR_REVIEW, assigned_to_id=manager_user.id)

    with pytest.raises(PermissionDeniedError) as exc:
        TaskService.approve(task=task, user=manager_user)

    assert "your own work" in str(exc.value)

    task.refresh_from_db()
    assert task.status == Status.READY_FOR_REVIEW


def test_a_different_manager_can_approve_the_same_task(make_task, manager_user):
    task = make_task(status=Status.READY_FOR_REVIEW, assigned_to_id=manager_user.id)
    other_manager = TokenUser(id=42, role="MANAGER", email="other@example.com")

    task = TaskService.approve(task=task, user=other_manager)

    assert task.status == Status.COMPLETED


def test_team_member_cannot_assign_tasks(make_task, team_member_user):
    task = make_task(assigned_to_id=team_member_user.id)

    with pytest.raises(PermissionDeniedError):
        TaskService.assign(task=task, assignee_id=7, user=team_member_user)


def test_manager_can_reassign_a_task(make_task, manager_user):
    task = make_task(assigned_to_id=3)

    task = TaskService.assign(task=task, assignee_id=4, user=manager_user)

    assert task.assigned_to_id == 4


def test_a_completed_task_cannot_be_reassigned(make_task, manager_user):
    from common.exceptions import DomainError

    task = make_task(status=Status.COMPLETED, assigned_to_id=3)

    with pytest.raises(DomainError):
        TaskService.assign(task=task, assignee_id=4, user=manager_user)


def test_team_member_cannot_change_a_deadline(make_task, team_member_user):
    from datetime import date

    task = make_task(assigned_to_id=team_member_user.id)

    with pytest.raises(PermissionDeniedError):
        TaskService.set_due_date(
            task=task, due_date=date(2030, 1, 1), user=team_member_user
        )
