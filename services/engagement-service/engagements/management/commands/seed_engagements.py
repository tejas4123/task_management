"""Seed demo clients, services, task templates and engagements.

Creating engagements through ``EngagementService`` publishes
``ENGAGEMENT_CREATED``, so the Worker generates the tasks - the seed exercises
the real end-to-end flow rather than inserting tasks behind its back.
"""

from datetime import date

from django.core.management.base import BaseCommand
from django.db import transaction

from clients.models import Client
from common.exceptions import DomainError
from engagements.services import EngagementService
from services.models import ServiceType, TaskTemplate

CLIENTS = [
    ("Northwind Traders", "accounts@northwind.example", "+91-9800000001"),
    ("Umbrella Logistics", "finance@umbrella.example", "+91-9800000002"),
    ("Sunrise Textiles", "admin@sunrise.example", "+91-9800000003"),
    ("Blue Harbour Foods", "billing@blueharbour.example", "+91-9800000004"),
    ("Kestrel Analytics", "ops@kestrel.example", "+91-9800000005"),
]

SERVICES = [
    (
        "Monthly GST Compliance",
        "Monthly GST return preparation, reconciliation and filing.",
        ServiceType.Frequency.MONTHLY,
        [
            ("Collect sales and purchase registers", 3),
            ("Reconcile GSTR-2B with purchase register", 7),
            ("Prepare GSTR-1", 10),
            ("Prepare GSTR-3B and compute liability", 15),
            ("File returns and share acknowledgement", 20),
        ],
    ),
    (
        "GST Registration",
        "New GST registration for a client entity.",
        ServiceType.Frequency.ONE_TIME,
        [
            ("Collect KYC and constitution documents", 3),
            ("Verify principal place of business proof", 6),
            ("Submit REG-01 application", 10),
            ("Respond to departmental queries", 20),
        ],
    ),
    (
        "GST Refund",
        "Quarterly refund application for exporters.",
        ServiceType.Frequency.QUARTERLY,
        [
            ("Compile export invoices and shipping bills", 10),
            ("Compute refund eligibility", 20),
            ("File RFD-01", 30),
            ("Track refund sanction", 45),
        ],
    ),
]


class Command(BaseCommand):
    help = "Create demo clients, services, templates and engagements."

    def add_arguments(self, parser):
        parser.add_argument(
            "--created-by",
            type=int,
            default=2,
            help="Auth Service user id recorded as the engagement creator.",
        )

    def handle(self, *args, **options):
        created_by_id = options["created_by"]

        clients = self._seed_clients()
        services = self._seed_services()

        engagements = self._seed_engagements(clients, services, created_by_id)

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {len(clients)} clients, {len(services)} services, "
                f"{engagements} engagements. Tasks are generated asynchronously "
                f"by the worker-service."
            )
        )

    @transaction.atomic
    def _seed_clients(self) -> list[Client]:
        clients = []

        for name, email, phone in CLIENTS:
            client, _ = Client.objects.get_or_create(
                name=name,
                defaults={"email": email, "phone": phone},
            )
            clients.append(client)

        return clients

    @transaction.atomic
    def _seed_services(self) -> list[ServiceType]:
        services = []

        for name, description, frequency, templates in SERVICES:
            service, _ = ServiceType.objects.get_or_create(
                name=name,
                defaults={"description": description, "frequency": frequency},
            )

            for sequence, (title, due_days) in enumerate(templates, start=1):
                TaskTemplate.objects.get_or_create(
                    service_type=service,
                    sequence=sequence,
                    defaults={"title": title, "default_due_days": due_days},
                )

            services.append(service)

        return services

    def _seed_engagements(
        self,
        clients: list[Client],
        services: list[ServiceType],
        created_by_id: int,
    ) -> int:
        monthly, one_time, quarterly = services

        # A closed month so the recurring roll-forward has something to do.
        plan = [(client, monthly, date(2026, 8, 1), date(2026, 8, 31)) for client in clients]
        plan.append((clients[0], one_time, date(2026, 8, 1), date(2026, 8, 31)))
        plan.append((clients[1], quarterly, date(2026, 4, 1), date(2026, 6, 30)))

        created = 0

        for client, service, period_start, period_end in plan:
            try:
                EngagementService.create_engagement(
                    client=client,
                    service_type=service,
                    period_start=period_start,
                    period_end=period_end,
                    created_by_id=created_by_id,
                )
                created += 1
            except DomainError as exc:
                self.stdout.write(self.style.WARNING(f"  skipped: {exc.detail}"))

        return created
