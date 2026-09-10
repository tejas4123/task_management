"""Service-to-service endpoints for engagements."""

import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsInternalService

from .models import Engagement
from .serializers import EngagementSerializer
from .services import EngagementService

logger = logging.getLogger(__name__)


class InternalEngagementDetailView(APIView):
    """Engagement lookup for the Worker (it only receives ids in the event)."""

    authentication_classes: list = []
    permission_classes = [IsInternalService]

    def get(self, request, engagement_id: int):
        try:
            engagement = Engagement.objects.select_related(
                "client", "service_type"
            ).get(pk=engagement_id)
        except Engagement.DoesNotExist:
            return Response(
                {"detail": "Engagement not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(EngagementSerializer(engagement).data)


class InternalGenerateNextPeriodView(APIView):
    """Create the following period of a recurring engagement.

    Called by the Worker after it has generated tasks. Idempotent: a repeated
    call returns 200 with ``created: false`` instead of failing, because the
    event may be delivered more than once.
    """

    authentication_classes: list = []
    permission_classes = [IsInternalService]

    def post(self, request, engagement_id: int):
        try:
            engagement = Engagement.objects.select_related(
                "client", "service_type"
            ).get(pk=engagement_id)
        except Engagement.DoesNotExist:
            return Response(
                {"detail": "Engagement not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        created = EngagementService.create_next_recurring_engagement(
            engagement=engagement
        )

        if created is None:
            return Response({"created": False, "engagement": None})

        return Response(
            {"created": True, "engagement": EngagementSerializer(created).data},
            status=status.HTTP_201_CREATED,
        )
