"""Domain events published to Redis for the Worker Service.

Publishing happens through ``transaction.on_commit`` only. An event emitted
before commit could describe an engagement that never actually existed.
"""

import logging
from datetime import date

from celery import Celery
from django.conf import settings

logger = logging.getLogger(__name__)

ENGAGEMENT_CREATED = "ENGAGEMENT_CREATED"
ENGAGEMENT_EVENTS_QUEUE = "engagement-events"

_celery_app = Celery("engagement_service", broker=settings.CELERY_BROKER_URL)
_celery_app.conf.task_serializer = "json"
_celery_app.conf.accept_content = ["json"]
_celery_app.conf.result_serializer = "json"


def publish_engagement_created(
    *,
    engagement_id: int,
    client_id: int,
    service_type_id: int,
    period_start: date,
    period_end: date,
) -> None:
    payload = {
        "event": ENGAGEMENT_CREATED,
        "engagement_id": engagement_id,
        "client_id": client_id,
        "service_type_id": service_type_id,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
    }

    _celery_app.send_task(
        "events.engagement_created",
        kwargs=payload,
        queue=ENGAGEMENT_EVENTS_QUEUE,
    )

    logger.info(
        "Published %s engagement_id=%s service_type_id=%s",
        ENGAGEMENT_CREATED,
        engagement_id,
        service_type_id,
    )
