import jwt
import pytest
from django.conf import settings
from django.urls import reverse
from rest_framework.test import APIClient

from users.models import User

pytestmark = pytest.mark.django_db


@pytest.fixture
def api() -> APIClient:
    return APIClient()


def make_user(username: str, role: str, password: str = "Password123!") -> User:
    user = User.objects.create(username=username, email=f"{username}@example.com", role=role)
    user.set_password(password)
    user.save()
    return user


def test_access_token_carries_user_id_role_and_email(api):
    make_user("manager1", User.Role.MANAGER)

    response = api.post(
        reverse("login"),
        {"username": "manager1", "password": "Password123!"},
        format="json",
    )

    assert response.status_code == 200

    claims = jwt.decode(
        response.data["access"],
        settings.SIMPLE_JWT["SIGNING_KEY"],
        algorithms=["HS256"],
    )

    assert claims["role"] == User.Role.MANAGER
    assert claims["email"] == "manager1@example.com"
    assert claims["user_id"] == User.objects.get(username="manager1").id
    assert isinstance(claims["user_id"], int)


def test_refreshed_access_token_keeps_the_role_claim(api):
    make_user("member1", User.Role.TEAM_MEMBER)

    login = api.post(
        reverse("login"),
        {"username": "member1", "password": "Password123!"},
        format="json",
    )

    refreshed = api.post(
        reverse("token-refresh"),
        {"refresh": login.data["refresh"]},
        format="json",
    )

    assert refreshed.status_code == 200

    claims = jwt.decode(
        refreshed.data["access"],
        settings.SIMPLE_JWT["SIGNING_KEY"],
        algorithms=["HS256"],
    )

    # Downstream services authorize from the token alone; losing `role` on
    # refresh would silently downgrade every request after 30 minutes.
    assert claims["role"] == User.Role.TEAM_MEMBER


def test_inactive_user_cannot_log_in(api):
    user = make_user("member2", User.Role.TEAM_MEMBER)
    user.is_active = False
    user.save(update_fields=["is_active"])

    response = api.post(
        reverse("login"),
        {"username": "member2", "password": "Password123!"},
        format="json",
    )

    assert response.status_code == 400


def test_only_admin_can_create_users(api):
    manager = make_user("manager2", User.Role.MANAGER)
    api.force_authenticate(user=manager)

    response = api.post(
        reverse("user-list"),
        {
            "username": "intruder",
            "email": "intruder@example.com",
            "password": "Password123!",
            "role": User.Role.ADMIN,
        },
        format="json",
    )

    assert response.status_code == 403
    assert not User.objects.filter(username="intruder").exists()


def test_admin_deleting_a_user_deactivates_instead_of_removing(api):
    admin = make_user("admin", User.Role.ADMIN)
    member = make_user("member3", User.Role.TEAM_MEMBER)

    api.force_authenticate(user=admin)
    response = api.delete(reverse("user-detail", args=[member.id]))

    assert response.status_code == 204

    member.refresh_from_db()
    assert member.is_active is False


def test_internal_user_lookup_requires_the_service_token(api):
    make_user("member4", User.Role.TEAM_MEMBER)
    url = reverse("internal-user-lookup")

    assert api.get(url, {"ids": "1"}).status_code == 403

    allowed = api.get(
        url,
        {"ids": "1"},
        HTTP_X_INTERNAL_TOKEN=settings.INTERNAL_SERVICE_TOKEN,
    )
    assert allowed.status_code == 200
