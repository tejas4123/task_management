import pytest
from rest_framework.test import APIClient

from common.authentication import TokenUser


@pytest.fixture
def api() -> APIClient:
    return APIClient()


@pytest.fixture
def anonymous_api() -> APIClient:
    """A client that never authenticates.

    `force_authenticate(user=None)` would call Django's session logout, and
    these services deliberately do not install the sessions app.
    """
    return APIClient()


@pytest.fixture
def admin_user() -> TokenUser:
    return TokenUser(id=1, role="ADMIN", email="admin@example.com")


@pytest.fixture
def manager_user() -> TokenUser:
    return TokenUser(id=2, role="MANAGER", email="manager@example.com")


@pytest.fixture
def team_member_user() -> TokenUser:
    return TokenUser(id=3, role="TEAM_MEMBER", email="member@example.com")
