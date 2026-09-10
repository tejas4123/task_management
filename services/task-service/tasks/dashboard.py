"""Dashboard aggregations.

Every number here is a database aggregate over indexed columns. Loading tasks
into Python to count them would stop working long before the 5M-task target.
"""

from __future__ import annotations

from django.db.models import Count, Q, QuerySet
from django.utils import timezone

from .models import Task


def build_summary(queryset: QuerySet[Task]) -> dict:
    """Return the dashboard counters for the caller's visible tasks."""

    today = timezone.localdate()

    counts = queryset.aggregate(
        open_tasks=Count("id", filter=Q(status__in=Task.OPEN_STATUSES)),
        overdue=Count(
            "id",
            filter=Q(status__in=Task.OPEN_STATUSES, due_date__lt=today),
        ),
        due_today=Count(
            "id",
            filter=Q(status__in=Task.OPEN_STATUSES, due_date=today),
        ),
        waiting_for_client=Count(
            "id", filter=Q(status=Task.Status.WAITING_FOR_CLIENT)
        ),
        waiting_for_review=Count(
            "id", filter=Q(status=Task.Status.READY_FOR_REVIEW)
        ),
        completed=Count("id", filter=Q(status=Task.Status.COMPLETED)),
        total=Count("id"),
    )

    by_status = {
        row["status"]: row["count"]
        for row in queryset.values("status").annotate(count=Count("id"))
    }

    return {
        **counts,
        "by_status": {status: by_status.get(status, 0) for status in Task.Status.values},
    }
