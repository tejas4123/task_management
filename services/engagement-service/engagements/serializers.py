from rest_framework import serializers

from .models import Engagement


class EngagementSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.name", read_only=True)
    service_name = serializers.CharField(source="service_type.name", read_only=True)
    frequency = serializers.CharField(source="service_type.frequency", read_only=True)

    class Meta:
        model = Engagement
        fields = (
            "id",
            "client",
            "client_name",
            "service_type",
            "service_name",
            "frequency",
            "period_start",
            "period_end",
            "status",
            "created_by_id",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_by_id", "created_at", "updated_at")


class EngagementCreateSerializer(serializers.ModelSerializer):
    """Input validation only.

    Business rules (period alignment, duplicates, inactive clients) belong to
    ``EngagementService``; this checks the shape of the payload.
    """

    class Meta:
        model = Engagement
        fields = ("client", "service_type", "period_start", "period_end")
        # DRF would otherwise infer a UniqueTogetherValidator from the model
        # constraint and answer duplicates with 400. Duplicates are a conflict,
        # not a malformed payload, and the check belongs where it is race-free:
        # the database. EngagementService turns the IntegrityError into a 409.
        validators: list = []


class EngagementStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Engagement.Status.choices)
