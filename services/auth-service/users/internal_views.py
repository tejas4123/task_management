"""Service-to-service endpoints (``/api/v1/internal/``).

These are not reachable with a user JWT. They require the shared internal
service token and are never exposed through the load balancer in production.
"""

from rest_framework.response import Response
from rest_framework.views import APIView

from .authentication import InternalServiceTokenPermission
from .models import User


class InternalUserLookupView(APIView):
    """Resolve a batch of user ids to display names.

    Other services store only ``assigned_to_id``; this is how they turn ids
    into something human-readable without a cross-service foreign key.
    """

    authentication_classes: list = []
    permission_classes = [InternalServiceTokenPermission]

    def get(self, request):
        raw_ids = request.query_params.get("ids", "")
        ids = [int(value) for value in raw_ids.split(",") if value.strip().isdigit()]

        users = User.objects.filter(id__in=ids).values(
            "id", "username", "email", "first_name", "last_name", "role"
        )

        return Response(list(users))
