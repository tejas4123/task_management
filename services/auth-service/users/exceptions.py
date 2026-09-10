"""Domain exceptions and the DRF exception handler.

Business rules raise these; the handler translates them into HTTP status
codes. Every error response from this service is ``{"detail": ...}`` so the
frontend and Postman tests never have to branch on the shape of the payload.
"""

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler


class DomainError(Exception):
    """A business rule was violated. Maps to 400 by default."""

    status_code = status.HTTP_400_BAD_REQUEST

    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


class PermissionDeniedError(DomainError):
    """The caller is authenticated but not allowed. Maps to 403."""

    status_code = status.HTTP_403_FORBIDDEN


def api_exception_handler(exc, context):
    if isinstance(exc, DomainError):
        return Response({"detail": exc.detail}, status=exc.status_code)

    response = exception_handler(exc, context)

    if response is None:
        return None

    data = response.data

    if isinstance(data, dict) and "detail" not in data:
        response.data = {"detail": data}

    return response
