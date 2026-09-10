"""Engagement business rules.

Views stay thin; everything that decides whether an engagement may exist lives
here so it can be tested without HTTP and reused by the internal API the Worker
calls when rolling a recurring service into its next period.
"""

from __future__ import annotations

import logging
from datetime import date

from django.db import IntegrityError, transaction

from clients.models import Client
from common.exceptions import ConflictError, DomainError
from services.models import ServiceType

from .events import publish_engagement_created
from .models import Engagement
from .periods import next_period, period_errors

logger = logging.getLogger(__name__)


class EngagementService:
    @staticmethod
    def create_engagement(
        *,
        client: Client,
        service_type: ServiceType,
        period_start: date,
        period_end: date,
        created_by_id: int,
    ) -> Engagement:
        """Validate, persist and announce a new engagement.

        The whole write is one transaction; the ``ENGAGEMENT_CREATED`` event is
        queued with ``on_commit`` so the Worker never sees an engagement that
        was rolled back.
        """

        EngagementService._validate(
            client=client,
            service_type=service_type,
            period_start=period_start,
            period_end=period_end,
        )

        with transaction.atomic():
            try:
                engagement = Engagement.objects.create(
                    client=client,
                    service_type=service_type,
                    period_start=period_start,
                    period_end=period_end,
                    created_by_id=created_by_id,
                )
            except IntegrityError as exc:
                # The UNIQUE constraint is the authority, not a prior
                # `exists()` check - two concurrent requests can both pass that.
                raise ConflictError(
                    "An engagement already exists for this client, service and period."
                ) from exc

            transaction.on_commit(
                lambda: publish_engagement_created(
                    engagement_id=engagement.id,
                    client_id=engagement.client_id,
                    service_type_id=engagement.service_type_id,
                    period_start=engagement.period_start,
                    period_end=engagement.period_end,
                )
            )

        logger.info(
            "Created engagement id=%s client_id=%s service_type_id=%s period=%s..%s",
            engagement.id,
            engagement.client_id,
            engagement.service_type_id,
            engagement.period_start,
            engagement.period_end,
        )

        return engagement

    @staticmethod
    def create_next_recurring_engagement(
        *,
        engagement: Engagement,
        today: date | None = None,
    ) -> Engagement | None:
        """Roll a recurring engagement forward one period.

        Only rolls forward once the current period has ended. That guard is
        what stops the chain: creating an engagement publishes
        ``ENGAGEMENT_CREATED``, which asks for the *next* period again, so
        without a stopping condition a single monthly engagement would generate
        periods forever. Bounding it to periods that have already closed means
        the chain catches up to today and then stops.

        Returns ``None`` when the service is not recurring, the current period
        is still open, or the next period already exists - all normal outcomes,
        because the Worker may process the same event more than once.
        """

        today = today or date.today()

        upcoming = next_period(
            frequency=engagement.service_type.frequency,
            period_start=engagement.period_start,
            period_end=engagement.period_end,
        )

        if upcoming is None:
            return None

        if engagement.period_end >= today:
            logger.info(
                "Engagement id=%s period is still open (ends %s); "
                "not generating the next period yet.",
                engagement.id,
                engagement.period_end,
            )
            return None

        try:
            return EngagementService.create_engagement(
                client=engagement.client,
                service_type=engagement.service_type,
                period_start=upcoming.start,
                period_end=upcoming.end,
                created_by_id=engagement.created_by_id,
            )
        except ConflictError:
            logger.info(
                "Next period for engagement id=%s already exists; nothing to do.",
                engagement.id,
            )
            return None
        except DomainError as exc:
            # The next period is no longer valid business-wise - the client was
            # deactivated, or the service lost its templates. That is a reason to
            # stop recurring, not an error: letting it propagate would fail the
            # Worker's HTTP call and burn its whole retry budget on every event.
            logger.info(
                "Not rolling engagement id=%s forward: %s",
                engagement.id,
                exc.detail,
            )
            return None

    @staticmethod
    def _validate(
        *,
        client: Client,
        service_type: ServiceType,
        period_start: date,
        period_end: date,
    ) -> None:
        if not client.is_active:
            raise DomainError(f"Client '{client.name}' is inactive.")

        errors = period_errors(
            frequency=service_type.frequency,
            period_start=period_start,
            period_end=period_end,
        )

        if errors:
            raise DomainError(" ".join(errors))

        if not service_type.task_templates.exists():
            raise DomainError(
                f"Service '{service_type.name}' has no task templates, "
                "so the engagement would produce no work."
            )
