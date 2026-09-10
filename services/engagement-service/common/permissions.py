"""Role and service-to-service permissions.

Authorization is always decided here or in the service layer - never in the
frontend, and never from a request body field the caller controls.
"""

from django.conf import settings
from rest_framework.permissions import BasePermission

ADMIN = "ADMIN"
MANAGER = "MANAGER"
TEAM_MEMBER = "TEAM_MEMBER"

INTERNAL_TOKEN_HEADER = "HTTP_X_INTERNAL_TOKEN"


class _RolePermission(BasePermission):
    allowed_roles: frozenset[str] = frozenset()

    def has_permission(self, request, view) -> bool:
        user = getattr(request, "user", None)
        return bool(
            user
            and getattr(user, "is_authenticated", False)
            and getattr(user, "role", None) in self.allowed_roles
        )


class IsAdmin(_RolePermission):
    message = "Only administrators can perform this action."
    allowed_roles = frozenset({ADMIN})


class IsAdminOrManager(_RolePermission):
    message = "Only administrators or managers can perform this action."
    allowed_roles = frozenset({ADMIN, MANAGER})


class IsInternalService(BasePermission):
    """Allow only callers presenting the shared internal service token."""

    message = "Invalid or missing internal service token."

    def has_permission(self, request, view) -> bool:
        expected = settings.INTERNAL_SERVICE_TOKEN
        return bool(expected) and request.META.get(INTERNAL_TOKEN_HEADER) == expected
