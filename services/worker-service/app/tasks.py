"""Event handlers.

The Worker owns no business data. It reacts to ``ENGAGEMENT_CREATED`` by asking
the Engagement Service for the service's templates and the Task Service to
create the corresponding tasks, then rolls recurring services forward.

Delivery is at-least-once, so the handler is written to be safe to re-run: task
creation is guarded by ``UNIQUE(engagement_id, template_id)`` and the
next-period call is idempotent on the Engagement Service side.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta

from requests import RequestException

from .celery import app
from .clients import EngagementServiceClient, TaskServiceClient

logger = logging.getLogger(__name__)


def build_task_payloads(templates: list[dict], period_start: date) -> list[dict]:
    """Turn templates into task definitions.

    Due dates are anchored to the engagement's ``period_start`` so every task
    generated for a period has a deadline relative to that period, not to
    whenever the worker happened to run.
    """

    return [
        {
            "template_id": template["id"],
            "title": template["title"],
            "description": template.get("description", ""),
            "due_date": (
                period_start + timedelta(days=template["default_due_days"])
            ).isoformat(),
        }
        for template in templates
    ]


@app.task(
    name="events.engagement_created",
    bind=True,
    autoretry_for=(RequestException,),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
    max_retries=5,
)
def handle_engagement_created(
    self,
    *,
    engagement_id: int,
    client_id: int,
    service_type_id: int,
    period_start: str,
    period_end: str,
    event: str = "ENGAGEMENT_CREATED",
) -> dict:
    logger.info(
        "Handling %s engagement_id=%s service_type_id=%s attempt=%s",
        event,
        engagement_id,
        service_type_id,
        self.request.retries + 1,
    )

    templates = EngagementServiceClient.get_templates(service_type_id)

    if not templates:
        logger.warning(
            "engagement_id=%s: service_type_id=%s has no templates; nothing to generate.",
            engagement_id,
            service_type_id,
        )
        return {"engagement_id": engagement_id, "created_count": 0}

    payloads = build_task_payloads(templates, date.fromisoformat(period_start))
    result = TaskServiceClient.bulk_create(engagement_id, payloads)

    logger.info(
        "engagement_id=%s: %s tasks created, %s already present.",
        engagement_id,
        result.get("created_count"),
        result.get("skipped_count"),
    )

    # Roll recurring services into the next period. The Engagement Service
    # decides whether that is due; the worker just asks.
    recurrence = EngagementServiceClient.generate_next_period(engagement_id)

    if recurrence.get("created"):
        logger.info(
            "engagement_id=%s: generated next period engagement id=%s",
            engagement_id,
            recurrence["engagement"]["id"],
        )

    return {**result, "next_period_created": bool(recurrence.get("created"))}
