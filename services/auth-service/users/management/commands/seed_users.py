"""Seed the demo user directory: 1 admin, 2 managers, 4 team members."""

from django.core.management.base import BaseCommand
from django.db import transaction

from users.models import User

DEFAULT_PASSWORD = "Password123!"

SEED_USERS = [
    ("admin", "admin@example.com", "Aditi", "Rao", User.Role.ADMIN),
    ("manager1", "manager1@example.com", "Manish", "Kulkarni", User.Role.MANAGER),
    ("manager2", "manager2@example.com", "Meera", "Iyer", User.Role.MANAGER),
    ("member1", "member1@example.com", "Rohit", "Sharma", User.Role.TEAM_MEMBER),
    ("member2", "member2@example.com", "Priya", "Nair", User.Role.TEAM_MEMBER),
    ("member3", "member3@example.com", "Karan", "Mehta", User.Role.TEAM_MEMBER),
    ("member4", "member4@example.com", "Sneha", "Patil", User.Role.TEAM_MEMBER),
]


class Command(BaseCommand):
    help = "Create demo users. Safe to run more than once."

    @transaction.atomic
    def handle(self, *args, **options):
        created = 0

        for username, email, first_name, last_name, role in SEED_USERS:
            user, was_created = User.objects.get_or_create(
                username=username,
                defaults={
                    "email": email,
                    "first_name": first_name,
                    "last_name": last_name,
                    "role": role,
                    "is_staff": role == User.Role.ADMIN,
                    "is_superuser": role == User.Role.ADMIN,
                },
            )

            if was_created:
                user.set_password(DEFAULT_PASSWORD)
                user.save(update_fields=["password"])
                created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Users: {created} created, "
                f"{len(SEED_USERS) - created} already present. "
                f"Password for all demo users: {DEFAULT_PASSWORD}"
            )
        )
