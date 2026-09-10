"""Worker configuration, read once from the environment."""

import os

ENGAGEMENT_SERVICE_URL = os.getenv(
    "ENGAGEMENT_SERVICE_URL", "http://engagement-service:8000"
)
TASK_SERVICE_URL = os.getenv("TASK_SERVICE_URL", "http://task-service:8000")

INTERNAL_SERVICE_TOKEN = os.getenv(
    "INTERNAL_SERVICE_TOKEN", "development-internal-token"
)

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = os.getenv("REDIS_PORT", "6379")

BROKER_URL = f"redis://{REDIS_HOST}:{REDIS_PORT}/0"

HTTP_TIMEOUT_SECONDS = float(os.getenv("HTTP_TIMEOUT_SECONDS", "10"))

ENGAGEMENT_EVENTS_QUEUE = "engagement-events"
