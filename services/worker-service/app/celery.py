from celery import Celery

from . import config

app = Celery("worker_service", broker=config.BROKER_URL)

app.conf.task_serializer = "json"
app.conf.accept_content = ["json"]
app.conf.result_serializer = "json"

# Redis has no broker-side ack semantics we can rely on for exactly-once, so
# every handler is written to be safe under redelivery instead.
app.conf.task_acks_late = True
app.conf.worker_prefetch_multiplier = 1

app.conf.task_routes = {
    "events.engagement_created": {"queue": config.ENGAGEMENT_EVENTS_QUEUE},
}

app.autodiscover_tasks(["app"], related_name="tasks", force=True)

from . import tasks  # noqa: E402,F401  (register the task handlers)
