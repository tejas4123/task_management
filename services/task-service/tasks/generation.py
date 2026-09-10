"""Idempotent task generation.

The Worker calls this after an ``ENGAGEMENT_CREATED`` event. Events are
delivered at least once, so generating the same engagement twice must be a
no-op rather than a duplicate set of tasks.
"""

from __future__ import annotations

import logging

from django.db import transaction

from .models import Task

logger = logging.getLogger(__name__)


class TaskGenerationService:
    @staticmethod
    @transaction.atomic
    def bulk_create(*, engagement_id: int, tasks_data: list[dict]) -> dict:
        """Create the engagement's tasks, skipping any that already exist.

        ``ignore_conflicts`` leans on ``UNIQUE(engagement_id, template_id)``:
        a redelivered event inserts nothing and still returns success. Checking
        for existing rows first would not be safe - two workers can run the
        same event concurrently.
        """

        candidates = [
            Task(
                engagement_id=engagement_id,
                template_id=item["template_id"],
                title=item["title"],
                description=item.get("description", ""),
                due_date=item["due_date"],
                assigned_to_id=item.get("assigned_to_id"),
                created_by_id=None,
                created_by_type=Task.CreatorType.SYSTEM,
                status=Task.Status.NOT_STARTED,
            )
            for item in tasks_data
        ]

        before = Task.objects.filter(engagement_id=engagement_id).count()
        Task.objects.bulk_create(candidates, ignore_conflicts=True)
        after = Task.objects.filter(engagement_id=engagement_id).count()

        created_count = after - before

        logger.info(
            "engagement_id=%s task generation: %s requested, %s created, %s skipped",
            engagement_id,
            len(candidates),
            created_count,
            len(candidates) - created_count,
        )

        return {
            "engagement_id": engagement_id,
            "requested_count": len(candidates),
            "created_count": created_count,
            "skipped_count": len(candidates) - created_count,
            "total_tasks": after,
        }
