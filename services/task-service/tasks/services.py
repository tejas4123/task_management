"""Task business rules.

This service is the authority for the task workflow. Every status change goes
through :meth:`TaskService.change_status`, which validates the transition,
validates authorization, updates the task and writes history inside one
transaction.
"""

from __future__ import annotations

import logging
from datetime import date

from django.db import transaction
from django.utils import timezone

from common.exceptions import DomainError, PermissionDeniedError

from .models import Task, TaskHistory
from .workflow import (
    REVIEW_TRANSITIONS,
    REVIEWER_ROLES,
    TEAM_MEMBER,
    WORKER_TRANSITIONS,
    Status,
    is_transition_allowed,
)

logger = logging.getLogger(__name__)


class InvalidWorkflowTransition(DomainError):
    """The requested status change is not part of the workflow. Maps to 400."""


class TaskService:
    @staticmethod
    @transaction.atomic
    def change_status(*, task: Task, new_status: str, user, comment: str = "") -> Task:
        # Lock the row: two reviewers acting on the same task at once would
        # otherwise both read READY_FOR_REVIEW and both write a decision.
        task = Task.objects.select_for_update().get(pk=task.pk)
        old_status = task.status

        if not is_transition_allowed(from_status=old_status, to_status=new_status):
            raise InvalidWorkflowTransition(
                f"Cannot transition from {old_status} to {new_status}."
            )

        TaskService._authorize_transition(task=task, new_status=new_status, user=user)

        task.status = new_status
        task.completed_at = (
            timezone.now() if new_status == Status.COMPLETED else None
        )
        task.save(update_fields=["status", "completed_at", "updated_at"])

        TaskHistory.objects.create(
            task=task,
            from_status=old_status,
            to_status=new_status,
            changed_by_id=user.id,
            comment=comment,
        )

        logger.info(
            "task_id=%s status %s -> %s by user_id=%s",
            task.id,
            old_status,
            new_status,
            user.id,
        )

        return task

    @staticmethod
    @transaction.atomic
    def assign(*, task: Task, assignee_id: int | None, user) -> Task:
        """Assign or reassign a task. Admin/Manager only."""

        if user.role not in REVIEWER_ROLES:
            raise PermissionDeniedError("Only managers or admins can assign tasks.")

        if task.status == Status.COMPLETED:
            raise DomainError("A completed task cannot be reassigned.")

        previous = task.assigned_to_id
        task.assigned_to_id = assignee_id
        task.save(update_fields=["assigned_to_id", "updated_at"])

        logger.info(
            "task_id=%s reassigned from user_id=%s to user_id=%s by user_id=%s",
            task.id,
            previous,
            assignee_id,
            user.id,
        )

        return task

    @staticmethod
    @transaction.atomic
    def set_due_date(*, task: Task, due_date: date, user) -> Task:
        """Change a deadline. Admin/Manager only."""

        if user.role not in REVIEWER_ROLES:
            raise PermissionDeniedError("Only managers or admins can set deadlines.")

        task.due_date = due_date
        task.save(update_fields=["due_date", "updated_at"])

        return task

    @staticmethod
    def approve(*, task: Task, user, comment: str = "") -> Task:
        return TaskService.change_status(
            task=task, new_status=Status.COMPLETED, user=user, comment=comment
        )

    @staticmethod
    def request_changes(*, task: Task, user, comment: str) -> Task:
        if not comment.strip():
            raise DomainError("A comment is required when requesting changes.")

        return TaskService.change_status(
            task=task,
            new_status=Status.CHANGES_REQUESTED,
            user=user,
            comment=comment,
        )

    @staticmethod
    def _authorize_transition(*, task: Task, new_status: str, user) -> None:
        """Decide whether this caller may make this particular transition."""

        role = user.role

        if new_status in REVIEW_TRANSITIONS:
            if role not in REVIEWER_ROLES:
                raise PermissionDeniedError(
                    "Only managers or admins can review submitted work."
                )

            # Applies to managers and admins too: nobody signs off their own work.
            if task.assigned_to_id == user.id:
                raise PermissionDeniedError("You cannot review your own work.")

            return

        if role == TEAM_MEMBER:
            if task.assigned_to_id != user.id:
                raise PermissionDeniedError("You can only update tasks assigned to you.")

            if new_status not in WORKER_TRANSITIONS:
                raise PermissionDeniedError("You are not allowed to perform this action.")
