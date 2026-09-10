from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import User
from .permissions import IsAdmin
from .serializers import LoginSerializer, UserCreateSerializer, UserSerializer
from .services import UserService
from .tokens import issue_token_pair


class LoginView(APIView):
    """Exchange username/password for an access + refresh token pair."""

    authentication_classes: list = []
    permission_classes: list = []

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.validated_data["user"]
        tokens = issue_token_pair(user)

        return Response(
            {**tokens, "user": UserSerializer(user).data},
            status=status.HTTP_200_OK,
        )


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class UserViewSet(viewsets.ModelViewSet):
    """Admin-managed user directory.

    Any authenticated user may *list* users (managers need the directory to
    assign tasks, and the frontend renders assignee names), but only an admin
    may create, modify or deactivate them. Hiding the button in the UI is not
    the control - ``IsAdmin`` is.
    """

    queryset = User.objects.all().order_by("id")

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        return UserSerializer

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [IsAuthenticated()]
        return [IsAdmin()]

    def get_queryset(self):
        queryset = super().get_queryset()

        role = self.request.query_params.get("role")
        if role:
            queryset = queryset.filter(role=role)

        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == "true")

        return queryset

    def perform_destroy(self, instance: User) -> None:
        UserService.deactivate_user(user=instance, actor=self.request.user)
