from rest_framework.permissions import BasePermission

from .models import User


class IsAdmin(BasePermission):
    """Only ADMIN users may manage the user directory."""

    message = "Only administrators can perform this action."

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.role == User.Role.ADMIN)


class IsAdminOrManager(BasePermission):
    message = "Only administrators or managers can perform this action."

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.role in {User.Role.ADMIN, User.Role.MANAGER}
        )
