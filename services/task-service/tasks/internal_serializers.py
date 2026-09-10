from rest_framework import serializers


class GeneratedTaskSerializer(serializers.Serializer):
    template_id = serializers.IntegerField()
    title = serializers.CharField(max_length=255)
    description = serializers.CharField(allow_blank=True, required=False, default="")
    due_date = serializers.DateField()


class BulkTaskCreationSerializer(serializers.Serializer):
    engagement_id = serializers.IntegerField()
    tasks = GeneratedTaskSerializer(many=True, allow_empty=False)

    def validate_tasks(self, value: list[dict]) -> list[dict]:
        template_ids = [item["template_id"] for item in value]

        if len(template_ids) != len(set(template_ids)):
            raise serializers.ValidationError(
                "A payload cannot contain the same template_id twice."
            )

        return value
