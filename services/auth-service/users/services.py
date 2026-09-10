"""User-directory business rules.

The Auth Service owns the entire user lifecycle. Only an ADMIN reaches these
functions (``IsAdmin`` guards the viewset), so the rules here are about what an
admin may do *to whom*, not about who may call them.
"""

from __future__ import annotations

import logging

from django.db import transaction

from .exceptions import PermissionDeniedError
from .models import User

logger = logging.getLogger(__name__)


class UserService:
    @staticmethod
    @transaction.atomic
    def create_user(*, password: str, **fields) -> User:
        """Persist a new user with a hashed password.

        Username uniqueness is enforced by the database; the serializer surfaces
        the collision as a 400 before we get here.
        """

        user = User(**fields)
        user.set_password(password)
        user.save()

        logger.info(
            "user_created user_id=%s role=%s",
            user.id,
            user.role,
        )
        return user

    @staticmethod
    @transaction.atomic
    def update_user(*, user: User, actor: User, changes: dict) -> User:
        """Apply an admin's edits, refusing the two that lock the system out."""

        UserService._guard_self_lockout(user=user, actor=actor, changes=changes)

        for field, value in changes.items():
            setattr(user, field, value)
        user.save()

        logger.info(
            "user_updated user_id=%s by=%s fields=%s",
            user.id,
            actor.id,
            sorted(changes),
        )
        return user

    @staticmethod
    def deactivate_user(*, user: User, actor: User) -> None:
        """Users are referenced by id from other services; deleting the row
        would orphan those references, so deactivate instead."""

        UserService.update_user(
            user=user,
            actor=actor,
            changes={"is_active": False},
        )

    @staticmethod
    def _guard_self_lockout(*, user: User, actor: User, changes: dict) -> None:
        if user.pk != actor.pk:
            return

        if changes.get("is_active") is False:
            raise PermissionDeniedError("You cannot deactivate your own account.")

        role = changes.get("role")
        if role is not None and role != User.Role.ADMIN:
            raise PermissionDeniedError("You cannot remove your own admin role.")
