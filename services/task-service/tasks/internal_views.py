"""Service-to-service endpoints for tasks."""

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsInternalService

from .generation import TaskGenerationService
from .internal_serializers import BulkTaskCreationSerializer


class BulkTaskCreationView(APIView):
    """Create an engagement's tasks. Called by the Worker Service.

    Idempotent: replaying the same event returns 200 with ``created_count: 0``
    rather than duplicating work or failing.
    """

    authentication_classes: list = []
    permission_classes = [IsInternalService]

    def post(self, request):
        serializer = BulkTaskCreationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        result = TaskGenerationService.bulk_create(
            engagement_id=serializer.validated_data["engagement_id"],
            tasks_data=serializer.validated_data["tasks"],
        )

        response_status = (
            status.HTTP_201_CREATED if result["created_count"] else status.HTTP_200_OK
        )

        return Response(result, status=response_status)
