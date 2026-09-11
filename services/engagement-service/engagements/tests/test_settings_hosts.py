"""Service-to-service calls must survive a narrow DJANGO_ALLOWED_HOSTS.

The worker fetches templates over http://engagement-service:8000/, so that
hostname arrives as the Host header. When ALLOWED_HOSTS was driven purely by
the environment, a deployment that listed only the public IP answered those
calls with DisallowedHost - and task generation stopped without any obvious
error on the worker side.
"""

import pytest
from django.conf import settings
from django.urls import reverse

INTERNAL_HOSTNAMES = ("engagement-service", "task-service", "auth-service")


@pytest.mark.parametrize("hostname", INTERNAL_HOSTNAMES)
def test_internal_hostnames_are_always_allowed(hostname):
    assert hostname in settings.ALLOWED_HOSTS


def test_the_healthcheck_loopback_address_is_allowed():
    """The container healthcheck requests http://127.0.0.1:8000/healthz/."""
    assert "127.0.0.1" in settings.ALLOWED_HOSTS


def test_healthz_answers_a_request_addressed_to_the_service_name(client):
    """An end-to-end guard: the exact request shape the worker makes."""
    response = client.get(reverse("healthz"), headers={"host": "engagement-service:8000"})

    assert response.status_code == 200
