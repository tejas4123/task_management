"""HTTP clients for the internal APIs of the other services.

Every call carries the shared internal service token; none of these endpoints
is reachable with a user JWT.
"""

from __future__ import annotations

import logging

import requests

from . import config

logger = logging.getLogger(__name__)


def _headers() -> dict[str, str]:
    return {"X-Internal-Token": config.INTERNAL_SERVICE_TOKEN}


class EngagementServiceClient:
    @staticmethod
    def get_templates(service_type_id: int) -> list[dict]:
        response = requests.get(
            f"{config.ENGAGEMENT_SERVICE_URL}"
            f"/api/v1/internal/services/{service_type_id}/templates/",
            headers=_headers(),
            timeout=config.HTTP_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.json()

    @staticmethod
    def generate_next_period(engagement_id: int) -> dict:
        response = requests.post(
            f"{config.ENGAGEMENT_SERVICE_URL}"
            f"/api/v1/internal/engagements/{engagement_id}/next-period/",
            headers=_headers(),
            timeout=config.HTTP_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.json()


class TaskServiceClient:
    @staticmethod
    def bulk_create(engagement_id: int, tasks: list[dict]) -> dict:
        response = requests.post(
            f"{config.TASK_SERVICE_URL}/api/v1/internal/tasks/bulk-create/",
            json={"engagement_id": engagement_id, "tasks": tasks},
            headers=_headers(),
            timeout=config.HTTP_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.json()
