from rest_framework import serializers

from .models import Task, TaskHistory
from .workflow import next_statuses


class TaskHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskHistory
        fields = (
            "id",
            "from_status",
            "to_status",
            "changed_by_id",
            "comment",
            "created_at",
        )


class TaskSerializer(serializers.ModelSerializer):
    allowed_transitions = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = (
            "id",
            "engagement_id",
            "template_id",
            "title",
            "description",
            "assigned_to_id",
            "created_by_id",
            "created_by_type",
            "due_date",
            "status",
            "allowed_transitions",
            "completed_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_allowed_transitions(self, task: Task) -> list[str]:
        """Advertise the workflow so the UI can render only reachable actions.

        This is a convenience for the frontend, not an authorization decision -
        the service layer re-checks every transition.
        """
        return sorted(next_statuses(task.status))


class TaskDetailSerializer(TaskSerializer):
    history = TaskHistorySerializer(many=True, read_only=True)

    class Meta(TaskSerializer.Meta):
        fields = TaskSerializer.Meta.fields + ("history",)
        read_only_fields = fields


class TaskCreateSerializer(serializers.Serializer):
    """Input validation for a manually created task.

    Shape only - who may create, and what happens when the engagement already
    has a task for this template, are decided by ``TaskService.create_task``.

    ``template_id`` is required because the model column is NOT NULL and
    ``UNIQUE(engagement_id, template_id)`` is what keeps worker task generation
    idempotent. A manual task therefore instantiates a real task template
    rather than inventing a free-form one.
    """

    engagement_id = serializers.IntegerField(min_value=1)
    template_id = serializers.IntegerField(min_value=1)
    title = serializers.CharField(max_length=255)
    description = serializers.CharField(
        required=False, allow_blank=True, default=""
    )
    due_date = serializers.DateField()
    # Null creates the task unassigned; a manager can assign it afterwards.
    assigned_to_id = serializers.IntegerField(
        required=False, allow_null=True, default=None
    )

    def validate_title(self, value: str) -> str:
        title = value.strip()

        if not title:
            raise serializers.ValidationError("A task needs a title.")

        return title


class TaskStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Task.Status.choices)
    comment = serializers.CharField(required=False, allow_blank=True, default="")


class TaskAssignSerializer(serializers.Serializer):
    # Null unassigns. The id refers to a user in the Auth Service.
    assigned_to_id = serializers.IntegerField(allow_null=True)


class TaskDueDateSerializer(serializers.Serializer):
    due_date = serializers.DateField()


class TaskCommentSerializer(serializers.Serializer):
    comment = serializers.CharField(required=False, allow_blank=True, default="")


class RequestChangesSerializer(serializers.Serializer):
    comment = serializers.CharField()
