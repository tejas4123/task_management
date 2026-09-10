import pytest
from django.urls import reverse

from clients.models import Client

pytestmark = pytest.mark.django_db


def test_team_member_can_read_but_not_create_clients(api, team_member_user):
    Client.objects.create(name="Northwind Traders")
    api.force_authenticate(user=team_member_user)

    assert api.get(reverse("client-list")).status_code == 200

    response = api.post(reverse("client-list"), {"name": "Rogue Ltd"}, format="json")
    assert response.status_code == 403
    assert not Client.objects.filter(name="Rogue Ltd").exists()


def test_deleting_a_client_deactivates_it(api, admin_user):
    record = Client.objects.create(name="Umbrella Logistics")
    api.force_authenticate(user=admin_user)

    assert api.delete(reverse("client-detail", args=[record.id])).status_code == 204

    record.refresh_from_db()
    assert record.is_active is False


def test_anonymous_requests_are_rejected(api):
    assert api.get(reverse("client-list")).status_code == 401
