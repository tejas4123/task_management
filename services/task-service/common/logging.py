"""Request-scoped logging context.

Every log line carries a ``request_id`` so a single user action can be traced
across services (the id is forwarded on internal calls via ``X-Request-Id``).
"""

import logging
import uuid
from contextvars import ContextVar

_request_id: ContextVar[str] = ContextVar("request_id", default="-")

REQUEST_ID_HEADER = "HTTP_X_REQUEST_ID"


def get_request_id() -> str:
    return _request_id.get()


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id()
        return True


class RequestIdMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = request.META.get(REQUEST_ID_HEADER) or uuid.uuid4().hex[:12]
        token = _request_id.set(request_id)

        try:
            response = self.get_response(request)
            response["X-Request-Id"] = request_id
            return response
        finally:
            _request_id.reset(token)
