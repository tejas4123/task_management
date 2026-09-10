from django.db import models


class ServiceType(models.Model):
    """A service the firm offers, e.g. "Monthly GST Compliance"."""

    class Frequency(models.TextChoices):
        ONE_TIME = "ONE_TIME", "One Time"
        MONTHLY = "MONTHLY", "Monthly"
        QUARTERLY = "QUARTERLY", "Quarterly"
        YEARLY = "YEARLY", "Yearly"

    RECURRING_FREQUENCIES = frozenset(
        {Frequency.MONTHLY, Frequency.QUARTERLY, Frequency.YEARLY}
    )

    name = models.CharField(max_length=255, unique=True)
    description = models.TextField(blank=True)

    frequency = models.CharField(
        max_length=20,
        choices=Frequency.choices,
        default=Frequency.ONE_TIME,
    )

    is_recurring = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            # `is_recurring` is derived from `frequency`; the constraint stops
            # the two from drifting apart via a direct write or a bad payload.
            models.CheckConstraint(
                condition=models.Q(frequency="ONE_TIME", is_recurring=False)
                | (~models.Q(frequency="ONE_TIME") & models.Q(is_recurring=True)),
                name="recurring_flag_matches_frequency",
            ),
        ]

    def save(self, *args, **kwargs):
        self.is_recurring = self.frequency in self.RECURRING_FREQUENCIES
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.name


class TaskTemplate(models.Model):
    """One step of the checklist a service expands into for an engagement."""

    service_type = models.ForeignKey(
        ServiceType,
        on_delete=models.CASCADE,
        related_name="task_templates",
    )

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    sequence = models.PositiveIntegerField(default=1)

    # Days after the engagement's period_start that the generated task is due.
    default_due_days = models.PositiveIntegerField(default=7)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["service_type_id", "sequence"]
        constraints = [
            models.UniqueConstraint(
                fields=["service_type", "sequence"],
                name="unique_template_sequence_per_service",
            )
        ]

    def __str__(self) -> str:
        return f"{self.sequence}. {self.title}"
