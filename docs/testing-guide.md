# Testing Guide

How to verify this system yourself, from a cold start. Six levels, roughly in order
of how much they prove:

1. [Start clean](#1-start-clean)
2. [Automated tests](#2-automated-tests)
3. [Click through the UI](#3-click-through-the-ui)
4. [Postman](#4-postman)
5. [Prove the hard parts](#5-prove-the-hard-parts) ← the interesting one
6. [Check the database directly](#6-check-the-database-directly)

Run everything from the repository root.

---

## 1. Start clean

```bash
cp .env.example .env      # first time only
make reset                # delete all data (safe: it is only demo data)
make up                   # build and start
sleep 20                  # give the services a moment
make seed                 # demo users, clients, services, engagements, tasks
```

Confirm all seven containers are up:

```bash
make ps
curl -s localhost:8001/healthz/; echo
curl -s localhost:8002/healthz/; echo
curl -s localhost:8003/healthz/; echo
```

You should see `{"status": "ok", "service": ...}` three times.

`make seed` ends by printing the login details. All demo users use
**`Password123!`**: `admin`, `manager1`, `manager2`, `member1`…`member4`.

---

## 2. Automated tests

```bash
make test
```

Expected: **18 + 28 + 38 + 3 = 87 passing**, no failures.

To run one suite, or one test:

```bash
docker compose exec task-service pytest -v
docker compose exec task-service pytest tasks/tests/test_workflow.py -v
docker compose exec engagement-service pytest -k recurring -v
```

Reading the test names is the fastest way to see what rules exist:

```bash
docker compose exec task-service pytest --collect-only -q
```

### The tests worth reading

| Test | What it proves |
|---|---|
| `test_engagement_created_event_is_published_only_after_commit` | No event for a rolled-back engagement |
| `test_duplicate_is_rejected_by_the_database_not_a_prior_exists_check` | The guard is the constraint, not an `if exists()` |
| `test_generation_is_idempotent` | Replaying an event creates nothing |
| `test_manager_cannot_approve_a_task_assigned_to_themselves` | Self-approval is blocked by *assignment*, not role |
| `test_a_different_manager_can_approve_the_same_task` | …and the rule is not just "managers can't approve" |
| `test_recurring_roll_forward_stops_once_it_reaches_the_open_period` | The recurrence chain terminates |
| `test_a_team_member_cannot_even_read_someone_elses_task` | Scoping returns 404, not a leak |

### Make a test fail on purpose

The quickest way to confirm the tests actually test something:

```bash
# Break the workflow map, then re-run
docker compose exec task-service python -c "
import re, pathlib
p = pathlib.Path('tasks/workflow.py'); s = p.read_text()
p.write_text(s.replace('Status.NOT_STARTED: frozenset({Status.IN_PROGRESS})',
                       'Status.NOT_STARTED: frozenset({Status.IN_PROGRESS, Status.COMPLETED})'))
"
docker compose exec task-service pytest tasks/tests/test_workflow.py -q   # should FAIL
git checkout services/task-service/tasks/workflow.py                      # undo
```

---

## 3. Click through the UI

Open **http://localhost:5173**.

### As a team member — `member1` / `Password123!`

- The nav says **My tasks**, not "Tasks".
- The task list contains only tasks assigned to `#4`. Scroll: every row says `#4`.
- Open any *Not started* task. The only button is **Move to in progress** — no
  Approve, no Assign, no Due date.
- Click it. The status badge flips to *In progress*, a history entry appears, and the
  buttons become **Move to ready for review** / **Move to waiting for client**. Those
  buttons come from the backend's `allowed_transitions`, not from frontend logic.
- Add a comment in the box before clicking — it lands in the history.
- Move the task to **Ready for review**. Now there is *no* button at all for you:
  a team member cannot review.

**Try to break the scoping.** Note a task id that is *not* yours (sign in as
`manager1` in another browser profile to find one), then visit
`http://localhost:5173/tasks/<that-id>` as `member1`. You get an error, not the task —
the backend returns 404 because the queryset never contained it.

### As a manager — `manager1` / `Password123!`

- The nav says **Tasks** and the list shows every assignee.
- Open the task `member1` submitted. You now see **Approve** and **Request changes**,
  plus **Assign to** and **Due date**.
- Click **Request changes** with an empty comment → an error appears: a comment is
  mandatory. Add one and retry → status becomes *Changes requested*.
- Sign back in as `member1`: the task is back in their queue and can go to
  *In progress*.
- As `manager1` again, approve it. The status is *Completed* and the actions area
  says there are no further transitions.

**Try to approve your own work.** As `manager1`, assign a task to yourself
(**Assign to** does not list managers, so use curl — see §5.4), submit it, then try to
approve. You get *"You cannot review your own work."*

### As an admin — `admin` / `Password123!`

- **Clients** shows an *Add a client* form. Sign in as `manager1` and the form is gone
  — clients are admin-owned.
- **Services** lists each service with its generated checklist and its frequency.
- **Engagements** → create one for a client + *Monthly GST Compliance* with
  `2026-12-01` to `2026-12-15`. Rejected: a monthly period must end `2026-12-31`.
- Fix the end date and submit. It succeeds and says tasks are being generated. Wait a
  second, go to **Tasks**, filter by that engagement — five tasks appeared, created by
  the worker, not by your request.
- **Team** is in the sidebar. *Create user* asks for a username, email, name, a
  password typed twice, a role and an active flag. Create a manager, then sign out and
  sign in as them — the account works and **Team** is gone from their sidebar.
- Back as `admin`, **Edit** that user, change the role to Team member, save, then
  **Deactivate** them. Tick *Show deactivated* to see them again. Try to deactivate
  your own account: the backend refuses it, because an admin who deactivates
  themselves can leave nobody able to administer anything.
- Create a second user with a username that already exists: *A user with this username
  already exists.*

Navigating to `/team` as `manager1` redirects to the dashboard — but that is
convenience, not the control. The check that matters is in section 5.10.

---

## 4. Postman

Import both files from `postman/`:

- `Task Management API.postman_collection.json`
- `Task Management - Local.postman_environment.json`

Select the **Task Management - Local** environment. You do not need to log in first:
every request is self-contained, with a pre-request script that signs in as the role
that request needs and, where a workflow state matters, finds a task in the right
state first. So you can run any request, in any folder, in any order, and re-run the
collection without reseeding.

The environment holds only the three base URLs and the internal token. The tokens and
ids live in *collection* scope, written by those scripts — an environment variable of
the same name would outrank collection scope and pin a stale token or id, which
silently turns every authenticated request into a 401.

Use **Run collection** in the Collection Runner. Expected: **129 requests, 79
assertions, 0 failures.**

The **Authorization checks (expected to fail)** folder is the interesting one — those
requests assert the 400/401/403/409 they *should* get, so green means the rules held.

### Running it headless

The collection also runs under [Newman](https://github.com/postmanlabs/newman), which
is how it is verified:

```bash
npm install -g newman

newman run "postman/Task Management API.postman_collection.json" \
  -e "postman/Task Management - Local.postman_environment.json"
```

Or without installing anything locally, from inside the frontend container (note the
docker service names rather than `localhost`):

```bash
docker compose exec frontend npm i -g newman --silent
docker compose cp "postman/Task Management API.postman_collection.json" \
  frontend:/tmp/collection.json
docker compose exec frontend newman run /tmp/collection.json \
  --env-var base_auth_url=http://auth-service:8000 \
  --env-var base_engagement_url=http://engagement-service:8000 \
  --env-var base_task_url=http://task-service:8000 \
  --env-var internal_token=development-internal-token
```

---

## 5. Prove the hard parts

This is where the design actually gets tested. Each block is copy-pasteable.

First, a helper:

```bash
login() {
  curl -s -X POST http://localhost:8001/api/v1/auth/login/ \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"$1\",\"password\":\"Password123!\"}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access"])'
}
MGR=$(login manager1); MEM=$(login member1); ADM=$(login admin)
```

### 5.1 The duplicate race — the whole point of the UNIQUE constraint

Fire five *simultaneous* identical engagement creations:

```bash
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -w "%{http_code} " -X POST http://localhost:8002/api/v1/engagements/ \
    -H "Authorization: Bearer $MGR" -H 'Content-Type: application/json' \
    -d '{"client":4,"service_type":1,"period_start":"2027-01-01","period_end":"2027-01-31"}' &
done; wait; echo
```

**Expected: `201` exactly once, `409` four times** (in any order).

This is the test an `if exists()` check fails. All five requests read "no such
engagement" before any of them writes; only the database can serialise the insert.

### 5.2 Idempotent task generation

Replay a task-generation call for an engagement that already has its tasks:

```bash
curl -s -X POST http://localhost:8003/api/v1/internal/tasks/bulk-create/ \
  -H "X-Internal-Token: development-internal-token" -H 'Content-Type: application/json' \
  -d '{"engagement_id":1,"tasks":[
        {"template_id":1,"title":"Collect sales and purchase registers","due_date":"2026-08-04"}]}' \
  -w "\n  http=%{http_code}\n"
```

**Expected:** `created_count: 0`, `skipped_count: 1`, **HTTP 200** — a replay is a
success, not an error. Run it ten times; the task count never moves.

### 5.3 Workflow enforcement

```bash
# Find one of member1's not-started tasks
TID=$(curl -s "http://localhost:8003/api/v1/tasks/?status=NOT_STARTED&page_size=1" \
  -H "Authorization: Bearer $MEM" | python3 -c 'import sys,json;print(json.load(sys.stdin)["results"][0]["id"])')
echo "task $TID"

# Skip the workflow -> 400
curl -s -X POST http://localhost:8003/api/v1/tasks/$TID/status/ \
  -H "Authorization: Bearer $MEM" -H 'Content-Type: application/json' \
  -d '{"status":"COMPLETED"}' -w "  http=%{http_code}\n"
```

**Expected:** `{"detail":"Cannot transition from NOT_STARTED to COMPLETED."}` with 400.

Try every illegal jump — `NOT_STARTED → READY_FOR_REVIEW`,
`WAITING_FOR_CLIENT → READY_FOR_REVIEW`, `COMPLETED → IN_PROGRESS`. All 400.

### 5.4 Nobody approves their own work — including a manager

```bash
# Manager assigns a task to themselves (user id 2), then submits and tries to approve
curl -s -X POST http://localhost:8003/api/v1/tasks/$TID/assign/ \
  -H "Authorization: Bearer $MGR" -H 'Content-Type: application/json' \
  -d '{"assigned_to_id":2}' -o /dev/null -w "assign http=%{http_code}\n"

curl -s -X POST http://localhost:8003/api/v1/tasks/$TID/status/ \
  -H "Authorization: Bearer $MGR" -H 'Content-Type: application/json' \
  -d '{"status":"IN_PROGRESS"}' -o /dev/null -w "start  http=%{http_code}\n"

curl -s -X POST http://localhost:8003/api/v1/tasks/$TID/status/ \
  -H "Authorization: Bearer $MGR" -H 'Content-Type: application/json' \
  -d '{"status":"READY_FOR_REVIEW"}' -o /dev/null -w "submit http=%{http_code}\n"

# Same manager approves their own work -> 403
curl -s -X POST http://localhost:8003/api/v1/tasks/$TID/approve/ \
  -H "Authorization: Bearer $MGR" -H 'Content-Type: application/json' -d '{}' \
  -w "  http=%{http_code}\n"

# A different manager approves the same task -> 200
MGR2=$(login manager2)
curl -s -X POST http://localhost:8003/api/v1/tasks/$TID/approve/ \
  -H "Authorization: Bearer $MGR2" -H 'Content-Type: application/json' \
  -d '{"comment":"Reviewed."}' -o /dev/null -w "  other manager http=%{http_code}\n"
```

**Expected:** `403` for the assignee, `200` for the other manager. The rule is about
assignment, not role — a role-only check would have let the first one through.

### 5.5 Cross-user access is a 404, not a 403

```bash
# A task belonging to someone other than member1
OTHER=$(curl -s "http://localhost:8003/api/v1/tasks/?assigned_to_id=5&page_size=1" \
  -H "Authorization: Bearer $MGR" | python3 -c 'import sys,json;print(json.load(sys.stdin)["results"][0]["id"])')

curl -s "http://localhost:8003/api/v1/tasks/$OTHER/" -H "Authorization: Bearer $MEM" \
  -w "\n  http=%{http_code}\n"
```

**Expected: 404.** A 403 would confirm the task exists; scoping in the queryset means
it never existed as far as this user is concerned.

### 5.6 Internal endpoints reject user tokens

```bash
# Admin JWT against an internal endpoint -> 403
curl -s http://localhost:8002/api/v1/internal/services/1/templates/ \
  -H "Authorization: Bearer $ADM" -w "\n  admin jwt   http=%{http_code}\n"

# Correct service token -> 200
curl -s http://localhost:8002/api/v1/internal/services/1/templates/ \
  -H "X-Internal-Token: development-internal-token" -o /dev/null \
  -w "  service tok http=%{http_code}\n"
```

**Expected:** `403` then `200`. Even an admin cannot inject tasks directly.

### 5.7 Period alignment

```bash
for period in \
  '{"period_start":"2027-02-01","period_end":"2027-02-15"}' \
  '{"period_start":"2027-02-05","period_end":"2027-02-28"}' \
  '{"period_start":"2027-02-01","period_end":"2027-02-28"}'
do
  curl -s -X POST http://localhost:8002/api/v1/engagements/ \
    -H "Authorization: Bearer $MGR" -H 'Content-Type: application/json' \
    -d "{\"client\":5,\"service_type\":1,${period:1}" -w "  http=%{http_code}\n"
done
```

**Expected:** `400` — *"must end on 2027-02-28"*, `400` — *"must start on the first
day of a month"*, then `201`. February 2027 is a 28-day month, so the end date is
computed, not hardcoded.

### 5.8 The async pipeline, end to end

Watch the worker in one terminal:

```bash
docker compose logs -f worker-service
```

Create an engagement in another:

```bash
curl -s -X POST http://localhost:8002/api/v1/engagements/ \
  -H "Authorization: Bearer $MGR" -H 'Content-Type: application/json' \
  -d '{"client":1,"service_type":1,"period_start":"2027-03-01","period_end":"2027-03-31"}' \
  -o /dev/null -w "created http=%{http_code}\n"
```

In the worker log you should see, within a second:

```
Handling ENGAGEMENT_CREATED engagement_id=… service_type_id=1 attempt=1
engagement_id=…: 5 tasks created, 0 already present.
Task events.engagement_created[…] succeeded … 'next_period_created': False
```

`next_period_created: False` because March 2027 has not closed yet — that is the
guard that stops recurrence from looping forever.

**Now watch it recur.** The seed creates *August 2026* engagements, which have closed:

```bash
docker compose logs worker-service | grep "generated next period"
```

You will see September 2026 engagements being created from the August ones — and then
stopping, because September is the open period.

**Confirm the recurrence terminated:**

```bash
docker compose exec engagement-service python manage.py shell -c "
from engagements.models import Engagement
for e in Engagement.objects.order_by('id'):
    print(e.id, e.client.name[:18], e.service_type.frequency, e.period_start, e.period_end)"
```

Monthly engagements exist for August and September 2026 and stop there. If the guard
were missing this list would be unbounded.

### 5.9 Worker resilience

Kill the worker, create engagements, bring it back:

```bash
docker compose stop worker-service

curl -s -X POST http://localhost:8002/api/v1/engagements/ \
  -H "Authorization: Bearer $MGR" -H 'Content-Type: application/json' \
  -d '{"client":2,"service_type":2,"period_start":"2027-04-01","period_end":"2027-04-30"}' \
  -o /dev/null -w "created while worker is down: http=%{http_code}\n"

# No tasks yet - the event is sitting in Redis
docker compose start worker-service
sleep 5
docker compose logs worker-service --tail 5
```

The queued event is processed on startup and the tasks appear. Nothing was lost.

---

### 5.10 Only an admin creates users

Hiding the *Create user* button is not a security control. Prove the server enforces
it — the four cases below are also automated in
`auth-service/users/tests/test_user_management.py` and in the Postman
**Authorization checks** folder.

```bash
login() {
  curl -s -X POST http://localhost:8001/api/v1/auth/login/ \
    -H 'Content-Type: application/json' \
    -d "{\"username\": \"$1\", \"password\": \"Password123!\"}" \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["access"])'
}

NEW='{"username":"probe1","email":"probe1@example.com","first_name":"Probe",
      "last_name":"One","role":"MANAGER","password":"SecurePassword123!"}'

# No token -> 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8001/api/v1/users/ \
  -H 'Content-Type: application/json' -d "$NEW"

# Team member -> 403
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8001/api/v1/users/ \
  -H "Authorization: Bearer $(login member1)" \
  -H 'Content-Type: application/json' -d "$NEW"

# Manager -> 403
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8001/api/v1/users/ \
  -H "Authorization: Bearer $(login manager1)" \
  -H 'Content-Type: application/json' -d "$NEW"

# Admin -> 201
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8001/api/v1/users/ \
  -H "Authorization: Bearer $(login admin)" \
  -H 'Content-Type: application/json' -d "$NEW"
```

Expected: `401`, `403`, `403`, `201`.

The permission reads the application `role`, not `is_staff`. A Django staff flag on a
manager grants nothing:

```bash
docker compose exec -T auth-service python manage.py shell -c "
from users.models import User
u = User.objects.get(username='manager1')
u.is_staff = u.is_superuser = True
u.save(update_fields=['is_staff', 'is_superuser'])
print('manager1 is now Django staff')
"
```

Repeat the manager call above — still `403`. Undo it by setting both flags back to
`False`.

And the bootstrap path, which is how the first admin exists at all:

```bash
docker compose exec -T -e DJANGO_SUPERUSER_PASSWORD='BootstrapPass123!' auth-service \
  python manage.py createsuperuser --noinput --username boot --email boot@example.com

docker compose exec -T auth-service python manage.py shell -c "
from users.models import User
u = User.objects.get(username='boot')
print('role =', u.role, '| is_superuser =', u.is_superuser)
u.delete()
"
```

Expected: `role = ADMIN | is_superuser = True`. Without that, the first account could
sign in but could not use a single admin endpoint.

---

## 6. Check the database directly

The constraints are the load-bearing part of the design, so look at them:

```bash
docker compose exec postgres psql -U task_admin -d task_db -c '\d tasks_task'
```

Look for:

```
"unique_task_per_engagement_template" UNIQUE CONSTRAINT, btree (engagement_id, template_id)
"task_assignee_status_idx"  btree (assigned_to_id, status)
"task_status_due_idx"       btree (status, due_date)
"task_engagement_idx"       btree (engagement_id)
```

And on the engagement side:

```bash
docker compose exec postgres psql -U task_admin -d engagement_db \
  -c "SELECT conname, contype FROM pg_constraint
      WHERE conname IN ('unique_client_service_period',
                        'unique_template_sequence_per_service',
                        'recurring_flag_matches_frequency');"
```

**Try to violate one by hand** — this is the clearest proof the guarantee is in the
database and not just in Python:

```bash
docker compose exec postgres psql -U task_admin -d task_db -c "
INSERT INTO tasks_task (engagement_id, template_id, title, description, due_date,
                        status, created_by_type, created_at, updated_at)
SELECT engagement_id, template_id, 'Duplicate', '', due_date,
       'NOT_STARTED', 'SYSTEM', now(), now()
FROM tasks_task LIMIT 1;"
```

**Expected:** `duplicate key value violates unique constraint
"unique_task_per_engagement_template"`.

**Verify the service boundary.** Each service's database contains only its own
tables, and no user table exists outside the Auth Service:

```bash
docker compose exec postgres psql -U task_admin -d task_db       -c '\dt'
docker compose exec postgres psql -U task_admin -d engagement_db -c '\dt'
docker compose exec postgres psql -U task_admin -d auth_db       -c '\dt'
```

`task_db` has three tables: `tasks_task`, `tasks_taskhistory` and Django's own
`django_migrations`. Neither `task_db` nor `engagement_db` contains `auth_user`,
`auth_permission` or `django_content_type` — those services do not install
`django.contrib.auth` at all.

**Check the query plan** on the dashboard's hot path:

```bash
docker compose exec postgres psql -U task_admin -d task_db -c "
EXPLAIN SELECT count(*) FROM tasks_task
WHERE status <> 'COMPLETED' AND due_date < CURRENT_DATE;"
```

At 62 rows Postgres will pick a sequential scan — that is correct at this size. The
index matters at millions of rows; what you are checking is that
`(status, due_date)` exists for the planner to use.

---

## Resetting

Any of the above leaves extra data behind. To get back to a known state:

```bash
make reset && make up && sleep 20 && make seed
```

---

## Quick checklist

| # | Check | Expected |
|---|---|---|
| 1 | `make test` | 87 passed |
| 2 | Team member sees only own tasks | Every row is their id |
| 3 | Team member opens another's task | 404 |
| 4 | `NOT_STARTED → COMPLETED` | 400, names both statuses |
| 5 | Team member approves | 403 |
| 6 | Assigned manager approves own task | 403 |
| 7 | Different manager approves it | 200 |
| 8 | Five concurrent duplicate engagements | one 201, four 409 |
| 9 | Misaligned monthly period | 400, names the right end date |
| 10 | Replayed bulk-create | 200, `created_count: 0` |
| 11 | Admin JWT on `/internal/` | 403 |
| 12 | Engagement created → worker log | 5 tasks generated |
| 13 | Recurring roll-forward | Stops at the open period |
| 14 | Worker restarted after downtime | Queued event processed |
| 15 | Manual duplicate INSERT | Constraint violation |
| 16 | `newman run` the collection | 129 requests, 79 assertions, 0 failures |
| 17 | Manager/team member `POST /api/v1/users/` | 403; no token 401; admin 201 |
