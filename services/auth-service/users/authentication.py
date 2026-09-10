"""Internal (service-to-service) authentication."""

from django.conf import settings
from rest_framework.permissions import BasePermission

INTERNAL_TOKEN_HEADER = "HTTP_X_INTERNAL_TOKEN"


class InternalServiceTokenPermission(BasePermission):
    """Allow only callers presenting the shared internal service token."""

    message = "Invalid or missing internal service token."

    def has_permission(self, request, view) -> bool:
        presented = request.META.get(INTERNAL_TOKEN_HEADER, "")
        expected = settings.INTERNAL_SERVICE_TOKEN
        return bool(expected) and presented == expected
