from rest_framework import serializers

from .models import ServiceType, TaskTemplate


class ServiceTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceType
        fields = (
            "id",
            "name",
            "description",
            "frequency",
            "is_recurring",
            "created_at",
            "updated_at",
        )
        # Derived from `frequency` in ServiceType.save().
        read_only_fields = ("id", "is_recurring", "created_at", "updated_at")


class TaskTemplateSerializer(serializers.ModelSerializer):
    service_name = serializers.CharField(source="service_type.name", read_only=True)

    class Meta:
        model = TaskTemplate
        fields = (
            "id",
            "service_type",
            "service_name",
            "title",
            "description",
            "sequence",
            "default_due_days",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")
        validators = [
            # Mirrors the database UNIQUE constraint so the caller gets a field
            # error instead of a 500. The constraint remains the real guarantee.
            serializers.UniqueTogetherValidator(
                queryset=TaskTemplate.objects.all(),
                fields=("service_type", "sequence"),
                message="This sequence is already used by another template for this service.",
            )
        ]
