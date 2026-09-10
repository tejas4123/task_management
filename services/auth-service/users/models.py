from django.contrib.auth.models import AbstractUser, UserManager as DjangoUserManager
from django.db import models


class UserManager(DjangoUserManager):
    """User manager that keeps the Django superuser flag and the application
    role in step.

    ``manage.py createsuperuser`` bootstraps the first administrator. Without
    this override that user would be created with the model default
    (``TEAM_MEMBER``) and would be unable to use any admin-only API, because
    authorization reads ``role`` and never ``is_superuser``.
    """

    def create_superuser(self, username, email=None, password=None, **extra_fields):
        extra_fields.setdefault("role", User.Role.ADMIN)
        return super().create_superuser(username, email, password, **extra_fields)


class User(AbstractUser):
    """Application user.

    The Auth Service owns this table. Other services reference users only by
    id (``assigned_to_id``, ``created_by_id``) and never join against it.
    """

    class Role(models.TextChoices):
        ADMIN = "ADMIN", "Admin"
        MANAGER = "MANAGER", "Manager"
        TEAM_MEMBER = "TEAM_MEMBER", "Team Member"

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.TEAM_MEMBER,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    class Meta(AbstractUser.Meta):
        indexes = [
            models.Index(fields=["role"], name="user_role_idx"),
        ]

    @property
    def is_admin(self) -> bool:
        return self.role == self.Role.ADMIN

    @property
    def is_manager(self) -> bool:
        return self.role == self.Role.MANAGER

    def __str__(self) -> str:
        return f"{self.username} ({self.role})"
