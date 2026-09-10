"""The task workflow, in one place.

Both the allowed transitions and who may perform them are declared here. Views
and the frontend read from this; neither gets to invent a rule of its own.
"""

from __future__ import annotations

from .models import Task

Status = Task.Status

ADMIN = "ADMIN"
MANAGER = "MANAGER"
TEAM_MEMBER = "TEAM_MEMBER"

REVIEWER_ROLES = frozenset({ADMIN, MANAGER})

ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {
    Status.NOT_STARTED: frozenset({Status.IN_PROGRESS}),
    Status.IN_PROGRESS: frozenset({Status.WAITING_FOR_CLIENT, Status.READY_FOR_REVIEW}),
    Status.WAITING_FOR_CLIENT: frozenset({Status.IN_PROGRESS}),
    Status.READY_FOR_REVIEW: frozenset({Status.COMPLETED, Status.CHANGES_REQUESTED}),
    Status.CHANGES_REQUESTED: frozenset({Status.IN_PROGRESS}),
    Status.COMPLETED: frozenset(),
}

# Transitions that are a review decision: only a reviewer may make them, and
# never on their own work.
REVIEW_TRANSITIONS = frozenset({Status.COMPLETED, Status.CHANGES_REQUESTED})

# What the person doing the work is allowed to move a task to.
WORKER_TRANSITIONS = frozenset(
    {Status.IN_PROGRESS, Status.WAITING_FOR_CLIENT, Status.READY_FOR_REVIEW}
)


def is_transition_allowed(*, from_status: str, to_status: str) -> bool:
    return to_status in ALLOWED_TRANSITIONS.get(from_status, frozenset())


def next_statuses(from_status: str) -> frozenset[str]:
    return ALLOWED_TRANSITIONS.get(from_status, frozenset())
