from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from common.permissions import IsAdmin

from .models import Client
from .serializers import ClientSerializer


class ClientViewSet(viewsets.ModelViewSet):
    """Client directory.

    Admins own the client list. Managers and team members read it (they need
    client names on engagements and tasks) but cannot change it.
    """

    queryset = Client.objects.all()
    serializer_class = ClientSerializer

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [IsAuthenticated()]
        return [IsAdmin()]

    def get_queryset(self):
        queryset = super().get_queryset()

        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == "true")

        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(name__icontains=search)

        return queryset

    def perform_destroy(self, instance: Client) -> None:
        # Engagements reference clients with PROTECT; deactivating keeps the
        # history intact while removing the client from new work.
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])
