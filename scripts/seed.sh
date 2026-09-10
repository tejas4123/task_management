#!/usr/bin/env bash
#
# Seed the demo dataset.
#
# Order matters: users first (engagements record a creator id), then clients,
# services and engagements. Creating an engagement publishes ENGAGEMENT_CREATED,
# so the worker generates the tasks - we wait for it before assigning them.

set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Users"
docker compose exec -T auth-service python manage.py seed_users

MANAGER_ID=$(docker compose exec -T auth-service python manage.py shell -c \
  "from users.models import User; print(User.objects.filter(role='MANAGER').order_by('id').first().id)" \
  | tail -1 | tr -d '\r')

echo "==> Clients, services, templates and engagements"
docker compose exec -T engagement-service python manage.py seed_engagements --created-by "$MANAGER_ID"

echo "==> Waiting for the worker to generate tasks"
sleep 6

MEMBER_IDS=$(docker compose exec -T auth-service python manage.py shell -c \
  "from users.models import User; print(' '.join(str(u.id) for u in User.objects.filter(role='TEAM_MEMBER').order_by('id')))" \
  | tail -1 | tr -d '\r')

echo "==> Distributing tasks across team members ($MEMBER_IDS)"
# shellcheck disable=SC2086
docker compose exec -T task-service python manage.py assign_unassigned_tasks $MEMBER_IDS

echo
echo "Done. Sign in at http://localhost:5173 with admin / manager1 / member1 and password Password123!"
