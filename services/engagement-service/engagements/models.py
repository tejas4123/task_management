from django.db import models


class Engagement(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    client = models.ForeignKey(
        "clients.Client",
        on_delete=models.PROTECT,
        related_name="engagements",
    )

    service_type = models.ForeignKey(
        "services.ServiceType",
        on_delete=models.PROTECT,
        related_name="engagements",
    )

    period_start = models.DateField()
    period_end = models.DateField()

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
    )

    # This is the ID from Auth Service.
    # We intentionally don't create a foreign key to another service's database.
    created_by_id = models.PositiveBigIntegerField()

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=[
                    "client",
                    "service_type",
                    "period_start",
                    "period_end",
                ],
                name="unique_client_service_period",
            ),
        ]

        indexes = [
            models.Index(
                fields=[
                    "client",
                    "service_type",
                    "period_start",
                ]
            ),
            models.Index(
                fields=[
                    "period_start",
                    "period_end",
                ]
            ),
        ]

    def __str__(self):
        return (
            f"{self.client.name} - "
            f"{self.service_type.name} - "
            f"{self.period_start}"
        )