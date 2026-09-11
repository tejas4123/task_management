# Task & Engagement Management Tool

A task and engagement management system for a professional services team, built as
four backend services plus a React frontend.

A manager creates an engagement for a client and a period; the system generates that
engagement's task checklist asynchronously, team members work the tasks through a
enforced workflow, and managers review and approve. Recurring services roll into
their next period on their own.

---

## Contents

- [Quick start](#quick-start)
- [What is running](#what-is-running)
- [Demo accounts](#demo-accounts)
- [Architecture](#architecture)
- [The task workflow](#the-task-workflow)
- [Authorization](#authorization)
- [API reference](#api-reference)
- [Testing](#testing)
- [Postman](#postman)
- [Everyday commands](#everyday-commands)
- [User management](#user-management)
- [Design decisions](#design-decisions)
- [Deployment](#deployment)
- [Production](#production)
- [Repository layout](#repository-layout)

---

## Quick start

Requires Docker and Docker Compose. Run everything from the repository root.

```bash
cp .env.example .env      # then replace every REPLACE_WITH_* placeholder
make up                   # or: docker compose up -d --build
make seed                 # demo users, clients, services, engagements and tasks
```

Then open **http://localhost:5173** and sign in as `manager1` / `Password123!`.

`docker compose` picks up `docker-compose.override.yml` automatically, which runs
the frontend as the Vite dev server with hot reload. Deployment skips that file —
see [Deployment](#deployment).

| | Local development | EC2 |
|---|---|---|
| Command | `docker compose up -d --build` | `docker compose -f docker-compose.yml up -d --build` |
| Frontend | Vite dev server, `http://localhost:5173` | nginx image, `http://EC2_PUBLIC_IP:3000` |
| Auth | `http://localhost:8001` | `http://EC2_PUBLIC_IP:8001` |
| Engagement | `http://localhost:8002` | `http://EC2_PUBLIC_IP:8002` |
| Task | `http://localhost:8003` | `http://EC2_PUBLIC_IP:8003` |
| Vite env file | `frontend/.env.development` | `frontend/.env.production` |

Postgres and Redis are Docker containers in **both** environments and are never
published to the host.

`make seed` is safe to re-run. To start over completely:

```bash
make reset && make up && make seed
```

### The first administrator

There is no public registration flow — the app never lets someone sign themselves
up. `make seed` creates a demo `admin`, but a real environment bootstraps its first
administrator through Django:

```bash
docker compose exec auth-service python manage.py createsuperuser
```

The custom user manager gives that account `role = ADMIN` alongside
`is_superuser`, because authorization reads `role` and never `is_superuser`. Every
subsequent user is created by an admin through `POST /api/v1/users/`.

---

## What is running

| Service | Port | Owns |
|---|---|---|
| `frontend` | 5173 local / 3000 EC2 | React + TypeScript UI (Vite dev server locally, nginx in deployment) |
| `auth-service` | 8001 | Users, authentication, JWT issuance, roles |
| `engagement-service` | 8002 | Clients, service types, task templates, engagements |
| `task-service` | 8003 | Tasks, task history, the workflow |
| `worker-service` | — | Celery consumer: task generation, recurring engagements |
| `postgres` | internal | One instance, one logical database per service |
| `redis` | internal | Celery broker |

Postgres and Redis have no published ports — nothing outside the stack needs them.

---

## Demo accounts

All demo users share the password **`Password123!`**.

| Username | Role | Can do |
|---|---|---|
| `admin` | Admin | Everything administrative: users, clients, services, templates |
| `manager1`, `manager2` | Manager | Create engagements, assign work, set deadlines, review and approve |
| `member1` … `member4` | Team Member | Work their own tasks and submit them for review |

Only an admin can add to this list — see [User management](#user-management).

---

## Architecture

```
                 ┌───────────┐
                 │  frontend │
                 └─────┬─────┘
        ┌──────────────┼──────────────┐
        │              │              │
   ┌────▼────┐  ┌──────▼──────┐  ┌────▼────┐
   │  auth   │  │ engagement  │  │  task   │
   │  :8001  │  │    :8002    │  │  :8003  │
   └────┬────┘  └──────┬──────┘  └────┬────┘
        │              │              │
        │        ENGAGEMENT_CREATED   │
        │              ▼              │
        │           ┌───────┐         │
        │           │ redis │         │
        │           └───┬───┘         │
        │               ▼             │
        │          ┌─────────┐        │
        │          │ worker  │────────┘
        │          └────┬────┘   bulk-create tasks
        │               └─────────────► fetch templates,
        │                               roll period forward
        └───────────────┬──────────────┘
                        ▼
                  ┌──────────┐
                  │ postgres │  auth_db │ engagement_db │ task_db
                  └──────────┘
```

**The end-to-end flow.** A manager posts an engagement. The Engagement Service
validates it, writes it in a transaction, and publishes `ENGAGEMENT_CREATED` via
`transaction.on_commit`. The Worker picks the event up, asks the Engagement Service
for the service's task templates, and asks the Task Service to create the tasks. A
manager assigns them; team members move them through the workflow; a manager
approves. For recurring services the Worker also asks the Engagement Service to open
the next period.

**Service boundaries.** Each service has its own database in the shared Postgres
instance, so "don't touch another service's tables" is enforced by the connection,
not by discipline. There are no cross-service foreign keys — services reference each
other by id (`engagement_id`, `template_id`, `assigned_to_id`, `created_by_id`).

**Authentication.** The Auth Service signs a JWT carrying `user_id`, `role` and
`email`. Every other service verifies the signature locally with the shared key —
no service calls the Auth Service to check a token. The Engagement and Task services
do not install `django.contrib.auth` at all; they hold no user rows.

**Service-to-service calls.** Endpoints under `/api/v1/internal/` require the shared
`X-Internal-Token` header and reject user JWTs, including an admin's. They are not
exposed publicly.

---

## The task workflow

```
NOT_STARTED ──► IN_PROGRESS ──► READY_FOR_REVIEW ──► COMPLETED
                     │   ▲              │
                     ▼   │              ▼
             WAITING_FOR_CLIENT   CHANGES_REQUESTED
                                        │
                                        ▼
                                   IN_PROGRESS
```

`COMPLETED` is terminal. Any transition not on this diagram is rejected with
`400` and a message naming both statuses:

```json
{ "detail": "Cannot transition from NOT_STARTED to COMPLETED." }
```

The map lives in one place — `services/task-service/tasks/workflow.py` — and every
status change runs through `TaskService.change_status`, which in a single
transaction validates the transition, validates authorization, locks and updates the
task, and appends a `TaskHistory` row. Nothing else writes `Task.status`.

The task API returns `allowed_transitions` on every task so the UI can render only
reachable actions. That is a convenience, not a control: the server re-checks.

---

## Authorization

Every rule below is enforced server-side. The frontend hides buttons the user cannot
use, but hiding a button is not a security control.

| | Admin | Manager | Team Member |
|---|:--:|:--:|:--:|
| Manage users | ● | | |
| Manage clients, services, templates | ● | | |
| Read clients, services, templates | ● | ● | ● |
| Create / manage engagements | ● | ● | |
| Assign and reassign tasks | ● | ● | |
| Set deadlines | ● | ● | |
| Approve / request changes | ● | ● | |
| See all tasks | ● | ● | |
| See own tasks | ● | ● | ● |
| Move own task through the workflow | ● | ● | ● |

Two rules deserve calling out:

- **Nobody approves their own work.** The check is on assignment, not role, so it
  binds managers and admins too — a manager assigned a task needs a different
  reviewer.
- **A team member never sees another member's task.** Scoping is applied to the
  queryset, so a direct `GET /api/v1/tasks/{id}/` for someone else's task returns
  `404`, not a leak.

---

## User management

The Auth Service owns the whole user lifecycle. Nothing else writes to the `users`
table — not another service, and certainly not the frontend.

```text
Initial deployment
       ↓
createsuperuser  →  role = ADMIN
       ↓
Admin signs in
       ↓
POST /api/v1/users/   →  Admin / Manager / Team Member
       ↓
they can sign in
```

`IsAdmin` guards every write on `/api/v1/users/`, and it reads the application
`role` rather than `is_staff` — a Django staff flag on a manager grants nothing.

| Caller | `POST /api/v1/users/` |
|---|---|
| Admin | `201 Created` |
| Manager | `403 Forbidden` |
| Team Member | `403 Forbidden` |
| No token | `401 Unauthorized` |

Reads are deliberately wider: any authenticated user may `GET /api/v1/users/`,
because managers need the directory to assign work and the UI renders assignee
names. Passwords are hashed by Django and never appear in a response.

An admin can also edit a user, change a role, and deactivate or reactivate an
account. Two edits are refused even for an admin — dropping your own `ADMIN` role
and deactivating your own account — because either one can empty the room and
leave nobody able to administer the system.

Deleting a user deactivates it instead of removing the row: tasks in the Task
Service reference users by `assigned_to_id`, and those references have no foreign
key to cascade.

In the UI, **Team** appears in the sidebar only for admins and the route redirects
anyone else. That is convenience, not the control — the backend answers `403`
regardless of what the UI shows.

---

## API reference

Public APIs are under `/api/v1/`, service-to-service APIs under `/api/v1/internal/`.

### Auth Service — `localhost:8001`

| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/auth/login/` | Returns `access`, `refresh` and the user |
| POST | `/api/v1/auth/refresh/` | New access token, role claim preserved |
| GET | `/api/v1/auth/me/` | Current user |
| GET | `/api/v1/users/` | Directory; filter `?role=`, `?is_active=` |
| POST/PATCH/DELETE | `/api/v1/users/{id}/` | Admin only; DELETE deactivates |
| GET | `/api/v1/internal/users/?ids=1,2` | Internal token required |

### Engagement Service — `localhost:8002`

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/api/v1/clients/` | Write: admin |
| PATCH/DELETE | `/api/v1/clients/{id}/` | DELETE deactivates |
| GET/POST | `/api/v1/services/` | Write: admin |
| GET/POST | `/api/v1/templates/` | Filter `?service_type=1`; write: admin |
| GET/POST | `/api/v1/engagements/` | Write: admin or manager |
| GET/PATCH | `/api/v1/engagements/{id}/` | |
| POST | `/api/v1/engagements/{id}/status/` | |
| GET | `/api/v1/internal/services/{id}/templates/` | Internal token |
| POST | `/api/v1/internal/engagements/{id}/next-period/` | Internal token |

### Task Service — `localhost:8003`

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/tasks/` | Cursor paginated; `?status=`, `?engagement_id=`, `?mine=true`, `?due_before=`, `?due_after=` |
| GET | `/api/v1/tasks/{id}/` | Includes the audit history |
| GET | `/api/v1/tasks/dashboard/` | Aggregated counters |
| POST | `/api/v1/tasks/{id}/status/` | `{"status": ..., "comment": ...}` |
| POST | `/api/v1/tasks/{id}/assign/` | Admin/manager |
| POST | `/api/v1/tasks/{id}/due-date/` | Admin/manager |
| POST | `/api/v1/tasks/{id}/approve/` | Admin/manager, not the assignee |
| POST | `/api/v1/tasks/{id}/request-changes/` | Comment required |
| POST | `/api/v1/internal/tasks/bulk-create/` | Internal token; idempotent |

### Status codes

| Code | Meaning |
|---|---|
| 400 | Validation or business-rule error (invalid transition, misaligned period) |
| 401 | Missing or invalid token |
| 403 | Authenticated but not allowed |
| 404 | Not found, or not visible to this user |
| 409 | Conflict — the engagement already exists for that client/service/period |

Every error is `{"detail": "..."}`.

---

## Testing

```bash
make test
```

87 tests across the four services, all of them about behaviour rather than status
codes for their own sake:

| Suite | Covers |
|---|---|
| `auth-service` (18) | Token claims, claim survival across refresh, inactive login, the full admin-only user-management matrix, password never exposed, superuser bootstrap, self-lockout guards, soft delete, internal token |
| `engagement-service` (28) | Period alignment for each frequency, duplicate → 409 via the DB constraint, event published only on commit, recurrence termination, role checks |
| `task-service` (38) | Every legal and illegal transition, self-approval, cross-member access, idempotent generation, history, dashboard aggregates |
| `worker-service` (3) | Due dates anchored to the period, template ids preserved for idempotency |

Some tests worth pointing at:

- `test_engagement_created_event_is_published_only_after_commit` — asserts the event
  is queued as an `on_commit` callback, so a rolled-back transaction cannot announce
  an engagement that does not exist.
- `test_duplicate_is_rejected_by_the_database_not_a_prior_exists_check` — the
  duplicate guard is the `UNIQUE` constraint, which holds under concurrency; an
  `if exists()` check does not.
- `test_generation_is_idempotent` — replaying an event creates nothing and returns
  success.
- `test_manager_cannot_approve_a_task_assigned_to_themselves` and
  `test_a_different_manager_can_approve_the_same_task` — self-approval is blocked by
  assignment, not by role.
- `test_recurring_roll_forward_stops_once_it_reaches_the_open_period` — the
  recurrence chain terminates.
- `test_createsuperuser_bootstraps_an_application_admin` — the bootstrap account
  gets `role = ADMIN`, so the first administrator can actually administer.
- `test_superuser_flag_alone_does_not_grant_admin_api_access` — `role` is the
  source of truth for business permissions; `is_staff`/`is_superuser` is not.
- `test_admin_cannot_lock_themselves_out` — an admin cannot drop their own admin
  role or deactivate their own account.

---

## Testing it yourself

**[docs/testing-guide.md](docs/testing-guide.md)** is a step-by-step walkthrough:
the automated suites, a UI click-through per role, the Postman folder of
expected-to-fail requests, and a set of copy-pasteable checks that prove the parts
that actually matter — the duplicate race under concurrency, idempotent replay,
workflow enforcement, self-approval, and the recurrence guard. It ends with a
15-item checklist.

---

## Postman

Import both files from `postman/`:

- `Task Management API.postman_collection.json`
- `Task Management - Local.postman_environment.json`

Every request signs itself in as the role it needs and resolves the ids it needs at
run time, so any request runs on its own, in any order, and the collection is safe
to re-run without reseeding. **Run collection** should give **129 requests, 79
assertions, 0 failures**. It also runs headless under Newman — see the
[testing guide](docs/testing-guide.md#4-postman).

The environment file deliberately holds only the three base URLs and the internal
token. Everything else is written to *collection* scope by the prerequest scripts,
and an environment variable of the same name would outrank it and pin a stale id.

The **Authorization checks (expected to fail)** folder covers invalid transitions, a
team member approving or assigning, a manager or team member creating a user, a role
change without admin rights, duplicate engagements, misaligned periods, a missing
token, and internal endpoints reached with a user JWT. Each asserts the
400/401/403/409 it should get.

---

## Everyday commands

```bash
make up                 # build and start everything
make down               # stop, keep data
make reset              # stop and delete all data
make ps                 # container status
make logs               # follow all logs
make migrate            # run migrations in every service
make seed               # demo data
make test               # every backend suite

docker compose logs worker-service         # watch task generation
docker compose exec task-service pytest    # one suite
```

Django commands run **inside** the container, so they use `POSTGRES_HOST=postgres`
and never accidentally hit a Postgres running on the developer's laptop:

```bash
docker compose exec engagement-service python manage.py migrate
```

---

## Design decisions

The reasoning behind these is in **[docs/technical-design.md](docs/technical-design.md)**.

1. **Four domain services, not one per entity.** Boundaries follow ownership —
   identity, engagement setup, task execution, async work.
2. **One Postgres instance, one database per service.** Logical ownership made
   physical, without the cost of separate clusters.
3. **No cross-service foreign keys.** Services reference each other by id.
4. **Local JWT verification.** Every request would otherwise become two.
5. **Database constraints as the last line of defence.** `UNIQUE(client, service,
   period_start, period_end)` and `UNIQUE(engagement_id, template_id)` are what make
   duplicate prevention and idempotency real under concurrency.
6. **`transaction.on_commit` before publishing.** No events for data that was rolled
   back.
7. **At-least-once, not exactly-once.** Handlers are safe to replay.
8. **One transition map, one service method.** The workflow is not spread across
   views.
9. **Business logic in the service layer.** Views parse, serializers validate shape,
   services decide.
10. **Recurrence bounded by the current period.** Otherwise a monthly engagement
    generates periods forever.

---

## Deployment

### How the frontend learns its API URLs

The browser — not a container — calls the APIs, so the frontend can never use the
internal service names. The three URLs come from Vite environment variables and are
**inlined into the bundle at build time**, which means changing them requires a
rebuild, not a restart.

| File | Loaded by | Values |
|---|---|---|
| `frontend/.env.development` | `npm run dev` (mode = development) | `http://localhost:8001-8003` |
| `frontend/.env.production` | `npm run build` (mode = production) | `http://EC2_PUBLIC_IP:8001-8003` |

`src/api/client.ts` reads `import.meta.env.VITE_AUTH_URL`,
`VITE_ENGAGEMENT_URL` and `VITE_TASK_URL`. No host or IP is hard-coded in React
source, and the real EC2 IP is not committed — `.env.production` ships a
`EC2_PUBLIC_IP` placeholder that is substituted on the server.

Shell environment variables take priority over the `.env` files, so the same build
can also be driven by `--build-arg`/`environment` if that is ever preferred. The
committed placeholder is deliberate: an operator who forgets to substitute it gets an
obviously broken hostname rather than a bundle that silently points at `localhost`.

### EC2 (temporary testing on ports 3000/8001-8003)

```bash
# 1. Configure the server environment
cp .env.example .env
EC2_IP=$(curl -s ifconfig.me)
sed -i "s/^DJANGO_ALLOWED_HOSTS=.*/DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,$EC2_IP/" .env
sed -i "s#^CORS_ALLOWED_ORIGINS=.*#CORS_ALLOWED_ORIGINS=http://$EC2_IP:3000#" .env
# then replace every REPLACE_WITH_* secret in .env

# 2. Point the frontend bundle at this host
sed -i "s/EC2_PUBLIC_IP/$EC2_IP/g" frontend/.env.production

# 3. Build and start WITHOUT the local dev override
docker compose -f docker-compose.yml up -d --build
docker compose -f docker-compose.yml exec auth-service python manage.py migrate
```

| | URL |
|---|---|
| Frontend | `http://EC2_PUBLIC_IP:3000` |
| Auth | `http://EC2_PUBLIC_IP:8001` |
| Engagement | `http://EC2_PUBLIC_IP:8002` |
| Task | `http://EC2_PUBLIC_IP:8003` |

The EC2 security group needs inbound `3000`, `8001`, `8002` and `8003`. Postgres and
Redis stay on the internal compose network with no published ports.

**This port layout is temporary.** The intended end state puts nginx in front on
**80/443** with TLS, serving the static bundle at `/` and reverse-proxying
`/api/auth/`, `/api/engagement/` and `/api/task/` to the backend containers. At that
point the three backend ports close entirely, the frontend's three `VITE_*` URLs
collapse to same-origin paths, and CORS stops being needed at all.

### Environment reference

| Variable | Local | EC2 |
|---|---|---|
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1` | `localhost,127.0.0.1,<ec2-ip>` |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:3000` | `http://<ec2-ip>:3000` |
| `CORS_ALLOW_ALL_ORIGINS` | `false` | `false` |
| `POSTGRES_HOST` / `REDIS_HOST` | `postgres` / `redis` | `postgres` / `redis` |

Both host lists are parsed with a comma-split that drops blanks, so a trailing comma
or a stray space never becomes an empty host entry. No IP appears in Python source.

`DJANGO_ALLOWED_HOSTS` carries **public** hosts only. The internal compose
hostnames — `auth-service`, `engagement-service`, `task-service` — plus `127.0.0.1`
are appended by `settings.py` and must not be listed in `.env`. They are required
because service-to-service calls send them as the `Host` header: the worker fetches
templates from `http://engagement-service:8000/` and posts tasks to
`http://task-service:8000/`, and the container healthcheck hits `127.0.0.1`. A
deployment that set only the public IP answered those calls with `DisallowedHost`,
which stopped task generation with no error visible on the worker. None of these
names resolve outside the compose network, so allowing them adds no public surface.

---

## Production

The whole stack runs as Docker containers on a single **EC2** host, driven by the
same `docker-compose.yml` used locally:

```
Internet ──► EC2 security group ──► docker compose
                                      frontend (nginx)   :3000
                                      auth               :8001 ─┐
                                      engagement         :8002 ─┼─► postgres (container)
                                      task               :8003 ─┘   redis    (container)
                                      worker (celery)
```

- **PostgreSQL and Redis are containers**, not RDS or ElastiCache. `infra/postgres/init.sql`
  creates `auth_db`, `engagement_db` and `task_db` on first start; data lives in the
  `postgres_data` named volume.
- Neither has a published port — they are reachable only over the compose network.
- `JWT_SECRET_KEY`, `INTERNAL_SERVICE_TOKEN`, `DJANGO_SECRET_KEY` and
  `POSTGRES_PASSWORD` come from the server's `.env`, which is gitignored. No secret,
  `.pem` file or IP is committed.
- `ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS` are environment driven;
  `CORS_ALLOW_ALL_ORIGINS` stays `false` outside a developer laptop.
- Celery runs **only** in `worker-service`. The Task Service serves HTTP through
  gunicorn and nothing else.
- `healthz/` on each service backs the compose healthchecks and, later, the nginx
  upstream checks.
- Logs go to the container log driver, carrying `request_id`, `user_id`, `task_id`,
  `engagement_id`, event and service.

The next step is nginx on **80/443** terminating TLS and reverse-proxying the API
paths — see [Deployment](#deployment).

**Scaling to ~5M tasks.** The task table carries the indexes the real queries use —
`(assigned_to_id, status)` for "my tasks", `(status, due_date)` for the dashboard and
overdue counts, `(engagement_id)` for the engagement view. The task list is
**cursor paginated**, because `OFFSET 100000` still scans 100k rows. The dashboard is
pure SQL aggregation, never a Python loop over rows. Task generation and recurrence
run in the worker so a manager's request returns immediately. Cached counters or
summary tables are the next step if the dashboard aggregate ever becomes the
bottleneck — measured, not assumed.

**CI/CD.** `.github/workflows/ci.yml` runs every backend suite and the frontend build
on each push and pull request. Deployment is a `docker compose -f docker-compose.yml
up -d --build` on the EC2 host after a green run on `main`.

---

## Repository layout

```
task-management/
├── docker-compose.yml            base stack; frontend = nginx image on :3000
├── docker-compose.override.yml   local only; frontend = Vite dev server on :5173
├── Makefile
├── .env.example
├── infra/postgres/init.sql       one database per service
├── scripts/seed.sh               demo data, in dependency order
├── postman/                      collection + environment
├── docs/technical-design.md
├── .github/workflows/ci.yml
├── frontend/                     React + TypeScript (Vite)
│   ├── .env.development          API URLs for `npm run dev`
│   ├── .env.production           API URLs inlined by `npm run build`
│   ├── Dockerfile                dev stage -> build stage -> nginx
│   └── nginx.conf                SPA fallback so deep links survive refresh
└── services/
    ├── auth-service/             users, JWT, roles
    ├── engagement-service/       clients, services, templates, engagements
    │   ├── common/               JWT auth, permissions, errors, pagination
    │   └── engagements/
    │       ├── periods.py        reporting-period rules
    │       ├── services.py       engagement business rules
    │       └── events.py         ENGAGEMENT_CREATED
    ├── task-service/             tasks, history, the workflow
    │   └── tasks/
    │       ├── workflow.py       the transition map
    │       ├── services.py       transitions, assignment, review
    │       ├── generation.py     idempotent bulk creation
    │       └── dashboard.py      SQL aggregates
    └── worker-service/           Celery consumer
```
