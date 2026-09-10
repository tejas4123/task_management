"""Distribute generated tasks across team members (demo data helper).

Task generation deliberately leaves ``assigned_to_id`` empty - deciding who
does the work is a manager's call, not the worker's. For the demo dataset we
round-robin the backlog so the app has something to show.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from tasks.models import Task


class Command(BaseCommand):
    help = "Round-robin unassigned tasks across the given user ids."

    def add_arguments(self, parser):
        parser.add_argument(
            "user_ids",
            nargs="+",
            type=int,
            help="Auth Service user ids of the team members to assign to.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        user_ids = options["user_ids"]

        unassigned = list(
            Task.objects.filter(assigned_to_id__isnull=True).order_by("id")
        )

        for index, task in enumerate(unassigned):
            task.assigned_to_id = user_ids[index % len(user_ids)]

        Task.objects.bulk_update(unassigned, ["assigned_to_id"])

        self.stdout.write(
            self.style.SUCCESS(
                f"Assigned {len(unassigned)} tasks across {len(user_ids)} team members."
            )
        )
