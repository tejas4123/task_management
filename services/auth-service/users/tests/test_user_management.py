"""Only an ADMIN may create or modify users.

These mirror the authorization matrix in the user-management rule: the backend
is the control, not the hidden button in the UI.
"""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from users.models import User

pytestmark = pytest.mark.django_db


@pytest.fixture
def api() -> APIClient:
    return APIClient()


def make_user(username: str, role: str, password: str = "Password123!") -> User:
    user = User.objects.create(
        username=username,
        email=f"{username}@example.com",
        role=role,
    )
    user.set_password(password)
    user.save()
    return user


NEW_USER = {
    "username": "manager01",
    "email": "manager01@example.com",
    "first_name": "Manager",
    "last_name": "One",
    "password": "SecurePassword123!",
    "role": User.Role.MANAGER,
}


def test_admin_can_create_a_user(api):
    api.force_authenticate(user=make_user("admin1", User.Role.ADMIN))

    response = api.post(reverse("user-list"), NEW_USER, format="json")

    assert response.status_code == 201

    created = User.objects.get(username="manager01")
    assert created.role == User.Role.MANAGER
    assert created.check_password("SecurePassword123!")


def test_team_member_cannot_create_a_user(api):
    api.force_authenticate(user=make_user("member1", User.Role.TEAM_MEMBER))

    response = api.post(reverse("user-list"), NEW_USER, format="json")

    assert response.status_code == 403
    assert not User.objects.filter(username="manager01").exists()


def test_unauthenticated_request_cannot_create_a_user(api):
    response = api.post(reverse("user-list"), NEW_USER, format="json")

    assert response.status_code == 401
    assert not User.objects.filter(username="manager01").exists()


def test_created_user_response_never_exposes_the_password(api):
    api.force_authenticate(user=make_user("admin2", User.Role.ADMIN))

    response = api.post(reverse("user-list"), NEW_USER, format="json")

    assert response.status_code == 201
    assert "password" not in response.data

    listed = api.get(reverse("user-list"))
    for row in listed.data["results"]:
        assert "password" not in row


def test_duplicate_username_is_rejected(api):
    api.force_authenticate(user=make_user("admin3", User.Role.ADMIN))
    make_user("manager01", User.Role.MANAGER)

    response = api.post(reverse("user-list"), NEW_USER, format="json")

    assert response.status_code == 400
    assert "username" in response.data["detail"]


def test_invalid_role_is_rejected(api):
    api.force_authenticate(user=make_user("admin4", User.Role.ADMIN))

    response = api.post(
        reverse("user-list"),
        {**NEW_USER, "role": "SUPER_MANAGER"},
        format="json",
    )

    assert response.status_code == 400
    assert not User.objects.filter(username="manager01").exists()


def test_weak_password_is_rejected(api):
    api.force_authenticate(user=make_user("admin5", User.Role.ADMIN))

    response = api.post(
        reverse("user-list"),
        {**NEW_USER, "password": "12345"},
        format="json",
    )

    assert response.status_code == 400
    assert not User.objects.filter(username="manager01").exists()


def test_manager_cannot_change_another_users_role(api):
    member = make_user("member2", User.Role.TEAM_MEMBER)
    api.force_authenticate(user=make_user("manager2", User.Role.MANAGER))

    response = api.patch(
        reverse("user-detail", args=[member.id]),
        {"role": User.Role.ADMIN},
        format="json",
    )

    assert response.status_code == 403
    member.refresh_from_db()
    assert member.role == User.Role.TEAM_MEMBER


def test_admin_can_change_a_role_and_deactivate(api):
    member = make_user("member3", User.Role.TEAM_MEMBER)
    api.force_authenticate(user=make_user("admin6", User.Role.ADMIN))

    promoted = api.patch(
        reverse("user-detail", args=[member.id]),
        {"role": User.Role.MANAGER, "is_active": False},
        format="json",
    )

    assert promoted.status_code == 200
    member.refresh_from_db()
    assert member.role == User.Role.MANAGER
    assert member.is_active is False


def test_admin_cannot_lock_themselves_out(api):
    admin = make_user("admin7", User.Role.ADMIN)
    api.force_authenticate(user=admin)

    demote = api.patch(
        reverse("user-detail", args=[admin.id]),
        {"role": User.Role.TEAM_MEMBER},
        format="json",
    )
    deactivate = api.patch(
        reverse("user-detail", args=[admin.id]),
        {"is_active": False},
        format="json",
    )

    assert demote.status_code == 403
    assert deactivate.status_code == 403

    admin.refresh_from_db()
    assert admin.role == User.Role.ADMIN
    assert admin.is_active is True


def test_createsuperuser_bootstraps_an_application_admin():
    """`manage.py createsuperuser` is how the first admin exists. Without the
    role the account could log in but could not administer anything."""

    superuser = User.objects.create_superuser(
        username="bootstrap",
        email="bootstrap@example.com",
        password="SecurePassword123!",
    )

    assert superuser.role == User.Role.ADMIN
    assert superuser.is_superuser is True


def test_superuser_flag_alone_does_not_grant_admin_api_access(api):
    """`role` is the source of truth for business permissions, not is_staff."""

    staffer = make_user("staffer", User.Role.MANAGER)
    staffer.is_staff = True
    staffer.is_superuser = True
    staffer.save(update_fields=["is_staff", "is_superuser"])

    api.force_authenticate(user=staffer)
    response = api.post(reverse("user-list"), NEW_USER, format="json")

    assert response.status_code == 403
