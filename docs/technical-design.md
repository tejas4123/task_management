# Technical Design Note

Why this system is built the way it is. The README covers *what* it does and how to
run it; this covers the decisions and their trade-offs.

---

## 1. Service boundaries

**Decision.** Four services, split by ownership rather than by entity:

| Service | Owns | Why it is its own service |
|---|---|---|
| `auth-service` | Users, credentials, roles, JWT | Identity has a different security and change profile from business data |
| `engagement-service` | Clients, service types, task templates, engagements | The "what work exists" domain: setup and configuration |
| `task-service` | Tasks, task history | The "who is doing what" domain: high write volume, the workflow authority |
| `worker-service` | Nothing | Async execution; it holds no business data |

**Rejected: one service per entity.** Six services for six models would put a
network hop between `Engagement` and the `TaskTemplate` rows it always reads
together, and turn an ordinary transaction into a distributed one. The cost of a
microservice is paid at its boundaries; boundaries should fall where the coupling is
already weak.

**Rejected: a single monolith.** The brief calls for a multi-service architecture,
and the split does earn its keep: the Task Service takes the write volume as tasks
grow toward millions, and it scales independently of the Engagement Service, which
stays comparatively static.

**Consequence.** Some data is fetched over HTTP that a monolith would join. The
worker makes two internal calls per event. That is the price of the boundary, and it
is bounded — the calls are on the async path, not in a user request.

---

## 2. Database ownership

**Decision.** One PostgreSQL instance, one logical database per service:
`auth_db`, `engagement_db`, `task_db`. No cross-service foreign keys; services
reference each other by id.

**Why not one shared database with a table-name convention?** Because a convention
is enforced by memory. A separate database per service makes "the Task Service
cannot read the users table" true at the connection level — the table is not there.
It also avoids a real collision: three Django projects sharing one `django_migrations`
table and three different definitions of "the user model" is a genuine mess, not a
hypothetical one.

**Why not separate instances?** Nothing here needs independent failure domains or
independent tuning yet, and three RDS instances would triple the cost and the
operational surface for no current benefit. One instance, three databases, promotes
cleanly to separate instances later — the application code does not change, only the
connection strings.

**Consequence.** No referential integrity across services. `assigned_to_id` can in
principle point at a user that no longer exists. This is handled deliberately:
deleting a user *deactivates* rather than removes it, and the same applies to
clients, which engagements reference with `PROTECT`.

The Engagement and Task services do not install `django.contrib.auth` at all. They
verify JWTs with PyJWT directly, so no user or permission table is ever created in
their databases. Keeping simplejwt would have dragged `django.contrib.auth` — and an
`auth_user` table — into two services that own no users.

---

## 3. Authentication

**Decision.** The Auth Service signs an HS256 JWT carrying `user_id`, `role` and
`email`. Every other service verifies the signature locally with the shared key.

**Why not call the Auth Service to validate each request?** It would make the Auth
Service a synchronous dependency of every request in the system — one outage takes
everything down, and every request costs an extra round trip. Local verification is
the standard answer.

**Trade-off.** A token stays valid until it expires; there is no instant revocation.
Access tokens live 30 minutes, which bounds the exposure. Real revocation would need
a shared denylist in Redis — worth adding when there is a reason, not before.

**Trade-off.** A shared symmetric key means every service can *mint* tokens, not just
verify them. Asymmetric RS256 (Auth signs with a private key, others verify with the
public one) is the stronger design and the natural upgrade; HS256 keeps the local
setup to a single environment variable.

**Detail that matters.** The `role` claim has to survive `/auth/refresh/`. Tokens are
built in one place, `users/tokens.py`, and a test asserts a refreshed access token
still carries the role — otherwise every user would silently lose their permissions
30 minutes after signing in.

---

## 4. Service-to-service authentication

**Decision.** Internal endpoints live under `/api/v1/internal/`, require a shared
`X-Internal-Token` header, and reject user JWTs — including an admin's.

Task creation is the reason. `POST /api/v1/internal/tasks/bulk-create/` writes tasks
directly, bypassing the workflow. It has to exist for the worker, and it must not be
reachable by any user token. Splitting the URL namespace makes that enforceable at
the network edge too: in production the ALB simply does not route `/api/v1/internal/`.

A test asserts a manager's JWT gets a `403` from the bulk-create endpoint.

---

## 5. Duplicate prevention and the race

**Decision.** Duplicate engagements are prevented by

```sql
UNIQUE (client_id, service_type_id, period_start, period_end)
```

and the `IntegrityError` is translated into `409 Conflict`.

**Why not check first?**

```python
if Engagement.objects.filter(...).exists():   # ← both requests see "no"
    raise Conflict
Engagement.objects.create(...)                # ← both requests insert
```

Two concurrent requests both read "no row" before either writes. The check passes
twice and duplicate rows are created. Under load — a retried form submission, a
double-clicked button, two workers processing the same event — this happens.

The constraint is the only guard that holds, because the database serialises the
insert. The application does not check first at all; it attempts the write and
handles the failure.

**Related consequence.** DRF's `ModelSerializer` would infer a
`UniqueTogetherValidator` from that constraint and answer duplicates with `400`
before the service layer ran. The validator is switched off explicitly on the create
serializer: a duplicate is a *conflict*, not a malformed payload, and the check
belongs where it is race-free.

---

## 6. Events and transactions

**Decision.** `ENGAGEMENT_CREATED` is published from `transaction.on_commit`.

```python
with transaction.atomic():
    engagement = Engagement.objects.create(...)
    transaction.on_commit(lambda: publish_engagement_created(...))
```

**Why.** Publishing inside the transaction risks this sequence:

```
create engagement
publish event          ← the worker may already be reading it
transaction rolls back ← the engagement never existed
```

The worker would then generate tasks for an engagement id that is not in the
database. `on_commit` makes the event strictly a consequence of a durable write.

**Trade-off.** The write can commit and the publish can then fail — the event is lost
and no tasks are generated. That is the dual-write problem, and it is the correct
direction to fail in: missing tasks are visible and fixable by replaying, whereas
tasks for a nonexistent engagement are corruption. A transactional outbox is the
proper fix and is the first thing to add if the failure ever shows up in practice.

A test asserts the publish happens as an `on_commit` callback rather than inline.

---

## 7. Idempotency

**Decision.** Task generation is idempotent, guaranteed by

```sql
UNIQUE (engagement_id, template_id)
```

with `bulk_create(..., ignore_conflicts=True)`.

**Why.** Celery over Redis is at-least-once. A worker that crashes after creating
tasks but before acknowledging will process the same event again on restart. Rather
than trying to make delivery exactly-once — which distributed systems do not offer —
the handler is written so that repeating it is harmless.

Replaying an event inserts nothing and returns `200` with `created_count: 0`, so a
retry is a success rather than an error the operator has to interpret. `ignore_conflicts`
is used rather than a pre-flight query for the same reason as §5: two workers can
run the same event at the same time.

The constraint doubles as the business rule — one task per template per engagement.

---

## 8. Recurring engagements, and why they terminate

**Decision.** After generating tasks the worker asks the Engagement Service to open
the next period. The Engagement Service creates it **only if the current period has
already closed** (`period_end < today`).

**Why the guard exists.** Creating an engagement publishes `ENGAGEMENT_CREATED`,
which asks for the next period, which creates an engagement, which publishes
`ENGAGEMENT_CREATED`… A monthly service would generate periods until something ran
out. Bounding generation to periods that have closed makes the chain catch up to
today and stop.

The seed data demonstrates it: seeding August 2026 produces September 2026 and then
halts, because September is still open.

**Alternative considered.** A nightly Celery beat schedule that sweeps recurring
engagements. It is more predictable and does not depend on an event arriving, and it
is the better production answer. The event-driven version was kept because it keeps
one mechanism instead of two, and the termination guard makes it safe — a beat
schedule would call the same idempotent service method.

**Period alignment.** A monthly engagement must cover a whole calendar month, a
quarterly one a calendar quarter starting in Jan/Apr/Jul/Oct. Without that rule
`UNIQUE(client, service, period_start, period_end)` is meaningless — "September" and
"1 Sep to 29 Sep" would be different periods, and the duplicate check would never
fire. The rules live in `engagements/periods.py` as pure functions and are the most
heavily parametrised tests in the project.

---

## 9. The workflow

**Decision.** One transition map, one entry point.

```python
ALLOWED_TRANSITIONS = {
    Status.NOT_STARTED:        frozenset({Status.IN_PROGRESS}),
    Status.IN_PROGRESS:        frozenset({Status.WAITING_FOR_CLIENT, Status.READY_FOR_REVIEW}),
    Status.WAITING_FOR_CLIENT: frozenset({Status.IN_PROGRESS}),
    Status.READY_FOR_REVIEW:   frozenset({Status.COMPLETED, Status.CHANGES_REQUESTED}),
    Status.CHANGES_REQUESTED:  frozenset({Status.IN_PROGRESS}),
    Status.COMPLETED:          frozenset(),
}
```

Every change goes through `TaskService.change_status`, which in one transaction:

1. locks the row (`select_for_update`),
2. validates the transition,
3. validates authorization,
4. updates the task,
5. appends a `TaskHistory` row.

**Why the lock.** Two reviewers opening the same task both read `READY_FOR_REVIEW`;
without the lock both decisions apply and the history records a transition that never
happened from the state it claims.

**Why one method.** `approve()` and `request_changes()` are thin wrappers over
`change_status`, not parallel implementations. There is exactly one place that writes
`Task.status`, so the audit trail cannot have gaps.

**Why the API returns `allowed_transitions`.** The frontend renders only the actions
that are reachable, without embedding a copy of the workflow in TypeScript that would
drift. It is a convenience; the server re-validates every call.

---

## 10. Authorization

**Decision.** Authorization is enforced in two layers, both server-side.

**Row scoping in the queryset.** A team member's task queryset is filtered to
`assigned_to_id = user.id`. Because the scope is on the queryset rather than an
object-level check, a direct `GET /api/v1/tasks/{id}/` for someone else's task
returns `404` — and any endpoint added later inherits the scoping automatically
instead of needing a check someone might forget.

**Transition rules in the service layer.** Review transitions (`COMPLETED`,
`CHANGES_REQUESTED`) require a reviewer role *and* that the reviewer is not the
assignee.

The self-approval rule is deliberately written against **assignment, not role**:

```python
if task.assigned_to_id == user.id:
    raise PermissionDeniedError("You cannot review your own work.")
```

A role-based check ("team members cannot approve") would let a manager assigned to a
task sign off their own work. Two tests pin this: the assigned manager is refused,
a different manager succeeds.

---

## 11. Layering

```
View            parses the request, maps exceptions to status codes
Serializer      validates the shape of the payload
Service layer   decides whether the operation is allowed and performs it
ORM             persists
Database        constraints as the final guarantee
```

Views contain no business rules. `EngagementService.create_engagement` and
`TaskService.change_status` are called directly by tests without an HTTP client —
which is why most of the test suite tests rules rather than endpoints.

Domain exceptions carry their own status code (`DomainError` → 400, `ConflictError`
→ 409, `PermissionDeniedError` → 403) and a single exception handler renders them.
Every error response in the system is `{"detail": "..."}`, so the frontend has one
shape to handle.

---

## 12. Scaling to ~5 million tasks

**Indexes follow the queries, not the columns.**

| Index | Query it serves |
|---|---|
| `(assigned_to_id, status)` | "My tasks", optionally filtered by status |
| `(status, due_date)` | Dashboard counters; overdue and due-today |
| `(engagement_id)` | Tasks for one engagement |

**Cursor pagination on the task list.** Offset pagination degrades with depth —
`OFFSET 100000` still scans 100,000 rows. A cursor keeps every page a bounded index
range scan regardless of how deep the caller goes.

**The dashboard is SQL.** A single query with conditional aggregates:

```python
queryset.aggregate(
    open_tasks=Count("id", filter=Q(status__in=OPEN_STATUSES)),
    overdue=Count("id", filter=Q(status__in=OPEN_STATUSES, due_date__lt=today)),
    ...
)
```

Loading tasks into Python to count them works at 62 rows and fails at 5 million.

**Heavy work is asynchronous.** Task generation and recurrence run in the worker, so
creating an engagement returns as soon as one row is committed rather than after
N inserts and two HTTP calls.

**What comes next, when measured.** If the dashboard aggregate becomes the
bottleneck: cached counters in Redis, then a summary table maintained on write, then
a materialized view. Deliberately not built yet — that is complexity bought against
a guess.

---

## 13. What was left out

Things a production system would need, consciously not built:

- **Transactional outbox.** The event publish can fail after commit (§6). The outbox
  pattern fixes it properly; the failure mode today is missing tasks, which is
  visible and replayable.
- **Token revocation.** No denylist; the 30-minute expiry bounds it (§3).
- **Asymmetric JWT signing.** RS256 would stop every service from being able to mint
  tokens (§3).
- **Rate limiting.** Belongs at the ALB / API gateway.
- **Notifications.** No email when a task is assigned or sent back.
- **Terraform.** The AWS target is documented; the infrastructure is not codified.

Each of these is a real gap. The reason for listing them rather than half-building
them is that the brief asks for a small, complete, defensible system — and a
half-built outbox is worse than a documented one.
