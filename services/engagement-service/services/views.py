from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from common.permissions import IsAdmin

from .models import ServiceType, TaskTemplate
from .serializers import ServiceTypeSerializer, TaskTemplateSerializer


class _AdminWritesViewSet(viewsets.ModelViewSet):
    """Everyone authenticated can read the catalogue; only admins change it."""

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [IsAuthenticated()]
        return [IsAdmin()]


class ServiceTypeViewSet(_AdminWritesViewSet):
    queryset = ServiceType.objects.all()
    serializer_class = ServiceTypeSerializer


class TaskTemplateViewSet(_AdminWritesViewSet):
    queryset = TaskTemplate.objects.select_related("service_type")
    serializer_class = TaskTemplateSerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        service_type_id = self.request.query_params.get("service_type")
        if service_type_id:
            queryset = queryset.filter(service_type_id=service_type_id)

        return queryset
