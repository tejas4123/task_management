# Convenience wrappers. Always run these from the repository root -
# `docker compose` resolves paths relative to the compose file.

.PHONY: up down build logs migrate seed test reset ps

up:            ## Build and start the whole stack
	docker compose up -d --build

down:          ## Stop the stack (keeps data)
	docker compose down

reset:         ## Stop the stack and delete all data
	docker compose down -v

build:
	docker compose build

ps:
	docker compose ps

logs:
	docker compose logs -f --tail=100

migrate:
	docker compose exec auth-service python manage.py migrate
	docker compose exec engagement-service python manage.py migrate
	docker compose exec task-service python manage.py migrate

seed:          ## Seed demo users, clients, services and engagements
	./scripts/seed.sh

test:          ## Run every backend test suite
	docker compose exec -T auth-service pytest
	docker compose exec -T engagement-service pytest
	docker compose exec -T task-service pytest
	docker compose exec -T worker-service python -m pytest
