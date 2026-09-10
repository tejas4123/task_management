from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from common.permissions import IsAdminOrManager

from .models import Engagement
from .serializers import (
    EngagementCreateSerializer,
    EngagementSerializer,
    EngagementStatusSerializer,
)
from .services import EngagementService


class EngagementViewSet(viewsets.ModelViewSet):
    queryset = Engagement.objects.select_related("client", "service_type")
    serializer_class = EngagementSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [IsAuthenticated()]
        return [IsAdminOrManager()]

    def get_queryset(self):
        queryset = super().get_queryset()
        params = self.request.query_params

        for param, field in (
            ("client", "client_id"),
            ("service_type", "service_type_id"),
            ("status", "status"),
        ):
            value = params.get(param)
            if value:
                queryset = queryset.filter(**{field: value})

        return queryset.order_by("-period_start", "-id")

    def create(self, request, *args, **kwargs):
        serializer = EngagementCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # DomainError / ConflictError are turned into 400 / 409 by the
        # project-wide exception handler.
        engagement = EngagementService.create_engagement(
            **serializer.validated_data,
            created_by_id=request.user.id,
        )

        return Response(
            EngagementSerializer(engagement).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="status")
    def change_status(self, request, pk=None):
        engagement = self.get_object()

        serializer = EngagementStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        engagement.status = serializer.validated_data["status"]
        engagement.save(update_fields=["status", "updated_at"])

        return Response(EngagementSerializer(engagement).data)
