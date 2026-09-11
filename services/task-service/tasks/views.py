from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from common.pagination import TaskCursorPagination
from common.permissions import TEAM_MEMBER, IsAdminOrManager

from .dashboard import build_summary
from .models import Task
from .serializers import (
    RequestChangesSerializer,
    TaskAssignSerializer,
    TaskCommentSerializer,
    TaskCreateSerializer,
    TaskDetailSerializer,
    TaskDueDateSerializer,
    TaskSerializer,
    TaskStatusSerializer,
)
from .services import TaskService


class TaskViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Read access, manual creation, and the workflow actions.

    Most tasks arrive from the Worker through the internal bulk-create endpoint
    when an engagement is created; ``create`` covers the manager who needs one
    that generation did not produce. Tasks are never updated in place or
    deleted - every change goes through a workflow action and leaves history.
    """

    queryset = Task.objects.all()
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = TaskCursorPagination

    def get_permissions(self):
        if self.action == "create":
            return [IsAuthenticated(), IsAdminOrManager()]
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action == "retrieve":
            return TaskDetailSerializer
        if self.action == "create":
            return TaskCreateSerializer
        return TaskSerializer

    def create(self, request, *args, **kwargs):
        """Create a task by hand.

        Defining ``create`` is what makes the router map POST onto the list
        route; the role check above and the one inside the service layer are
        both real - the second is what protects a non-HTTP caller.
        """
        serializer = TaskCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        task = TaskService.create_task(
            data=serializer.validated_data, user=request.user
        )

        return Response(
            TaskSerializer(task).data, status=status.HTTP_201_CREATED
        )

    def get_queryset(self):
        queryset = self.visible_tasks()
        params = self.request.query_params

        status_values = [
            value for value in params.get("status", "").split(",") if value
        ]
        if status_values:
            queryset = queryset.filter(status__in=status_values)

        for param, field in (
            ("engagement_id", "engagement_id"),
            ("assigned_to_id", "assigned_to_id"),
            ("due_before", "due_date__lte"),
            ("due_after", "due_date__gte"),
        ):
            value = params.get(param)
            if value:
                queryset = queryset.filter(**{field: value})

        if params.get("mine", "").lower() == "true":
            queryset = queryset.filter(assigned_to_id=self.request.user.id)

        return queryset

    def visible_tasks(self):
        """Row-level scoping.

        A team member only ever sees their own tasks - enforced in the query,
        so there is no object-level check to forget on a new endpoint.
        """
        queryset = Task.objects.all()
        user = self.request.user

        if user.role == TEAM_MEMBER:
            return queryset.filter(assigned_to_id=user.id)

        return queryset

    def _run(self, serializer_class, handler, request):
        serializer = serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)

        task = handler(self.get_object(), serializer.validated_data)

        return Response(TaskSerializer(task).data)

    @action(detail=True, methods=["post"], url_path="status")
    def change_status(self, request, pk=None):
        return self._run(
            TaskStatusSerializer,
            lambda task, data: TaskService.change_status(
                task=task,
                new_status=data["status"],
                user=request.user,
                comment=data.get("comment", ""),
            ),
            request,
        )

    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        return self._run(
            TaskAssignSerializer,
            lambda task, data: TaskService.assign(
                task=task, assignee_id=data["assigned_to_id"], user=request.user
            ),
            request,
        )

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        return self._run(
            TaskCommentSerializer,
            lambda task, data: TaskService.approve(
                task=task, user=request.user, comment=data.get("comment", "")
            ),
            request,
        )

    @action(detail=True, methods=["post"], url_path="request-changes")
    def request_changes(self, request, pk=None):
        return self._run(
            RequestChangesSerializer,
            lambda task, data: TaskService.request_changes(
                task=task, user=request.user, comment=data["comment"]
            ),
            request,
        )

    @action(detail=True, methods=["post"], url_path="due-date")
    def set_due_date(self, request, pk=None):
        return self._run(
            TaskDueDateSerializer,
            lambda task, data: TaskService.set_due_date(
                task=task, due_date=data["due_date"], user=request.user
            ),
            request,
        )

    @action(detail=False, methods=["get"])
    def dashboard(self, request):
        """Counters over the tasks this caller can see."""
        return Response(build_summary(self.visible_tasks()), status=status.HTTP_200_OK)
