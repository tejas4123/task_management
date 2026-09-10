from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import User
from .services import UserService


class UserSerializer(serializers.ModelSerializer):
    """Read/update representation of a user. Passwords are never returned."""

    email = serializers.EmailField(required=True, allow_blank=False)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "role",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def update(self, instance: User, validated_data: dict) -> User:
        return UserService.update_user(
            user=instance,
            actor=self.context["request"].user,
            changes=validated_data,
        )


class UserCreateSerializer(serializers.ModelSerializer):
    """Admin-only user creation.

    ``username`` uniqueness comes from the model's UNIQUE constraint (DRF turns
    it into a 400 with a readable message), ``role`` is constrained to the
    ``Role`` choices, and the password runs through Django's configured
    validators before it is hashed.
    """

    email = serializers.EmailField(required=True, allow_blank=False)
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "role",
            "is_active",
            "password",
        )

    def validate_password(self, value: str) -> str:
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value

    def create(self, validated_data: dict) -> User:
        password = validated_data.pop("password")
        return UserService.create_user(password=password, **validated_data)


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs: dict) -> dict:
        user = authenticate(
            username=attrs["username"],
            password=attrs["password"],
        )

        # `authenticate` already rejects inactive users via ModelBackend, so a
        # None result covers both "wrong credentials" and "disabled account".
        # We keep the message generic on purpose.
        if user is None:
            raise serializers.ValidationError("Invalid username or password.")

        attrs["user"] = user
        return attrs
