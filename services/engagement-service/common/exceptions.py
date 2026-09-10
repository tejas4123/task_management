"""Domain exceptions and the DRF exception handler.

Business rules raise these; views translate them into HTTP status codes. That
keeps the rules testable without an HTTP layer and keeps status-code choices in
one place.
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


class ConflictError(DomainError):
    """The request collides with existing state. Maps to 409."""

    status_code = status.HTTP_409_CONFLICT


class PermissionDeniedError(DomainError):
    """The caller is authenticated but not allowed. Maps to 403."""

    status_code = status.HTTP_403_FORBIDDEN


def api_exception_handler(exc, context):
    if isinstance(exc, DomainError):
        return Response({"detail": exc.detail}, status=exc.status_code)

    response = exception_handler(exc, context)

    if response is None:
        return None

    if isinstance(response.data, dict) and "detail" not in response.data:
        response.data = {"detail": response.data}

    return response
