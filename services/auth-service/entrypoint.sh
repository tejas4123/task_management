#!/bin/sh
# Apply migrations before serving. Safe to re-run: `migrate` is idempotent.
set -e

python manage.py migrate --noinput
exec "$@"
