"""Service-to-service endpoints for the service catalogue."""

from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsInternalService

from .models import TaskTemplate


class InternalTaskTemplateView(APIView):
    """Templates for a service type, used by the Worker to generate tasks."""

    authentication_classes: list = []
    permission_classes = [IsInternalService]

    def get(self, request, service_type_id: int):
        templates = TaskTemplate.objects.filter(
            service_type_id=service_type_id
        ).order_by("sequence")

        return Response(
            [
                {
                    "id": template.id,
                    "title": template.title,
                    "description": template.description,
                    "sequence": template.sequence,
                    "default_due_days": template.default_due_days,
                }
                for template in templates
            ]
        )
