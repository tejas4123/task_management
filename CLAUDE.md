# Task & Engagement Management Tool

## Project Overview

Build a production-quality **Task & Engagement Management Tool** for a professional services team.

The application manages:

* Clients
* Service Types
* Task Templates
* Engagements
* Tasks
* Users
* Task workflow
* Manager review
* Recurring engagements
* Audit/history

The application is being built as a **multi-service architecture** using:

* Python
* Django + Django REST Framework
* PostgreSQL
* Redis
* Celery
* Docker
* React + TypeScript
* AWS

The implementation should remain small, complete, maintainable, and technically defensible.

The assignment explicitly prioritizes:

1. Backend Engineering
2. Database & Domain Design
3. Code Quality & Testing
4. Frontend & UX
5. Business/Workflow Understanding
6. Technical Communication

Do NOT over-engineer the application with unnecessary infrastructure or features.

---

# Assignment Requirements

The system must support:

## User Roles

### Admin

* Manage users and clients
* Create service types
* Create task templates
* View all engagements and tasks

### Manager

* Create/manage engagements
* Assign/reassign tasks
* Set deadlines
* Review submitted work
* Approve work
* Send work back for correction

### Team Member

* View own tasks
* Update task status
* Mark task as waiting for client information
* Submit work for review

---

# Core Entities

Required entities:

* User
* Client
* ServiceType
* Engagement
* TaskTemplate
* Task

Additional entities are allowed where useful.

We use:

* `TaskHistory` for audit/history tracking.

---

# Required Task Workflow

The backend MUST enforce the following transitions.

```text
NOT_STARTED
    ↓
IN_PROGRESS
    ↓
READY_FOR_REVIEW
    ↓
COMPLETED
```

Additional allowed paths:

```text
IN_PROGRESS
    ↓
WAITING_FOR_CLIENT
    ↓
IN_PROGRESS
```

and:

```text
READY_FOR_REVIEW
    ↓
CHANGES_REQUESTED
    ↓
IN_PROGRESS
```

Invalid transitions MUST be rejected by backend business logic.

Do not rely on frontend validation for workflow enforcement.

---

# Authorization Requirements

Authorization MUST be enforced server-side.

Examples:

* Team Member cannot update another user's task.
* Team Member cannot approve work.
* Users cannot approve their own work.
* Only Admin/Manager can assign or reassign tasks.
* Only authorized users can manage engagements.
* Managers/Admins can review submitted work.

The frontend may hide unavailable actions, but the backend remains the source of truth.

---

# Recurring Engagement Requirements

Services can be:

* ONE_TIME
* MONTHLY
* QUARTERLY
* YEARLY

When an engagement is created:

1. Validate client.
2. Validate service.
3. Validate period.
4. Create the engagement.
5. Publish `ENGAGEMENT_CREATED`.
6. Worker consumes the event.
7. Worker retrieves task templates.
8. Worker asks Task Service to create tasks.
9. Tasks are created transactionally.

For recurring services, the next period's engagement must be generated.

Duplicate recurring engagements for the same:

```text
client
service
period_start
period_end
```

MUST be prevented.

Use a PostgreSQL UNIQUE constraint.

Never rely only on:

```python
if exists():
```

because concurrent requests can race.

---

# Architecture

Use four backend services:

```text
auth-service
engagement-service
task-service
worker-service
```

Frontend:

```text
frontend
```

Infrastructure:

```text
PostgreSQL
Redis
```

---

# Service Responsibilities

## Auth Service

Owns:

* User
* Authentication
* JWT issuance
* Roles

Endpoints:

```text
POST /api/v1/auth/login/
POST /api/v1/auth/refresh/
GET  /api/v1/auth/me/
```

JWT contains:

```text
user_id
role
email
```

Auth Service owns user data.

Other services MUST NOT create foreign keys into the Auth Service database.

---

## Engagement Service

Owns:

```text
Client
ServiceType
TaskTemplate
Engagement
```

Responsibilities:

* Client management
* Service management
* Task template management
* Engagement creation
* Engagement validation
* Duplicate engagement prevention
* Publishing `ENGAGEMENT_CREATED`

---

## Task Service

Owns:

```text
Task
TaskHistory
```

Responsibilities:

* Task retrieval
* Task assignment
* Task reassignment
* Task status changes
* Workflow validation
* Manager review
* Approval
* Change requests
* Audit history

Task Service is the authority for task workflow.

---

## Worker Service

Owns no business data.

Responsibilities:

* Consume asynchronous events
* Generate recurring engagements
* Fetch templates
* Request task creation
* Retry failed background operations

Use Celery + Redis.

---

# Database Ownership

Use one PostgreSQL instance for local development and AWS RDS in production.

Logical ownership:

```text
Auth Service
    └── users

Engagement Service
    ├── clients
    ├── service_types
    ├── task_templates
    └── engagements

Task Service
    ├── tasks
    └── task_history
```

A service MUST NOT directly manipulate another service's tables.

Do not implement cross-service foreign keys.

Cross-service references are represented using IDs:

```python
engagement_id
template_id
assigned_to_id
created_by_id
```

---

# Important Data Models

## User

```text
id
username
email
password
first_name
last_name
role
is_active
created_at
updated_at
```

Roles:

```text
ADMIN
MANAGER
TEAM_MEMBER
```

---

## Client

```text
id
name
email
phone
is_active
created_at
updated_at
```

---

## ServiceType

```text
id
name
description
frequency
is_recurring
created_at
updated_at
```

`name` should be unique.

---

## TaskTemplate

```text
id
service_type_id
title
description
sequence
default_due_days
created_at
updated_at
```

Constraint:

```text
UNIQUE(service_type_id, sequence)
```

---

## Engagement

```text
id
client_id
service_type_id
period_start
period_end
status
created_by_id
created_at
updated_at
```

Constraint:

```text
UNIQUE(
    client_id,
    service_type_id,
    period_start,
    period_end
)
```

---

## Task

```text
id
engagement_id
template_id
title
description
assigned_to_id
created_by_id
created_by_type
due_date
status
completed_at
created_at
updated_at
```

`created_by_type`:

```text
USER
SYSTEM
```

System-generated tasks may have:

```text
created_by_id = NULL
created_by_type = SYSTEM
```

Constraint:

```text
UNIQUE(engagement_id, template_id)
```

This guarantees one task from each template per engagement.

Recommended indexes:

```text
(assigned_to_id, status)
(status, due_date)
(engagement_id)
```

---

## TaskHistory

```text
id
task_id
from_status
to_status
changed_by_id
comment
created_at
```

Recommended index:

```text
(task_id, created_at)
```

---

# Authentication Architecture

Auth Service creates JWT.

Example claims:

```json
{
  "user_id": 123,
  "role": "MANAGER",
  "email": "manager@example.com"
}
```

Other services verify the JWT using the same signing key.

Do NOT call Auth Service on every request just to validate the token.

Use local JWT signature validation.

Development:

```env
JWT_SECRET_KEY=development-secret
```

Production:

Store secret in AWS Secrets Manager.

Never commit secrets.

---

# Internal Service Communication

Use REST for synchronous calls.

Use Celery/Redis for asynchronous work.

Example:

```text
Engagement Service
        |
        | ENGAGEMENT_CREATED
        v
      Redis
        |
        v
Worker Service
        |
        | GET templates
        v
Engagement Service
        |
        | task definitions
        v
Worker Service
        |
        | bulk create
        v
Task Service
```

---

# Event Contract

Event:

```text
ENGAGEMENT_CREATED
```

Payload:

```json
{
  "event": "ENGAGEMENT_CREATED",
  "engagement_id": 5,
  "client_id": 2,
  "service_type_id": 1,
  "period_start": "2026-09-01",
  "period_end": "2026-09-30"
}
```

Events must contain stable IDs and enough information for downstream processing.

---

# Transaction Rules

When creating an Engagement:

```text
BEGIN
    validate
    create engagement
COMMIT
publish event
```

Use:

```python
transaction.atomic()
transaction.on_commit(...)
```

Do NOT publish an event before the database transaction successfully commits.

Reason:

```text
create engagement
publish event
transaction fails
```

would create an event for data that does not actually exist.

---

# Idempotency

Distributed systems may deliver messages more than once.

The system MUST tolerate duplicate event processing.

For tasks:

```text
UNIQUE(engagement_id, template_id)
```

is the database-level guarantee.

Example:

```text
Event #1
    -> create 3 tasks

Event #2
    -> no duplicates
```

Do not assume exactly-once delivery.

Design for at-least-once processing.

---

# API Design

Use:

```text
/api/v1/
```

for public APIs.

Use:

```text
/api/v1/internal/
```

for service-to-service APIs.

Examples:

## Client

```text
GET    /api/v1/clients/
POST   /api/v1/clients/
PATCH  /api/v1/clients/{id}/
DELETE /api/v1/clients/{id}/
```

## Service Types

```text
GET  /api/v1/services/
POST /api/v1/services/
```

## Task Templates

```text
GET  /api/v1/templates/
POST /api/v1/templates/
```

Filter:

```text
GET /api/v1/templates/?service_type=1
```

## Engagement

```text
GET  /api/v1/engagements/
POST /api/v1/engagements/
GET  /api/v1/engagements/{id}/
PATCH /api/v1/engagements/{id}/
```

## Tasks

```text
GET /api/v1/tasks/
GET /api/v1/tasks/{id}/
POST /api/v1/tasks/{id}/status/
POST /api/v1/tasks/{id}/assign/
POST /api/v1/tasks/{id}/approve/
POST /api/v1/tasks/{id}/request-changes/
```

## Internal Task Creation

```text
POST /api/v1/internal/tasks/bulk-create/
```

---

# Error Handling

Use proper HTTP semantics.

Recommended:

```text
400 → validation/business input error
401 → unauthenticated
403 → unauthorized
404 → resource not found
409 → duplicate/conflict
500 → unexpected server error
```

For example:

Duplicate engagement:

```http
409 Conflict
```

Response:

```json
{
  "detail": "An engagement already exists for this client, service and period."
}
```

Invalid transition:

```http
400 Bad Request
```

Response:

```json
{
  "detail": "Cannot transition from NOT_STARTED to COMPLETED."
}
```

---

# Business Logic

Do not put significant business logic directly inside ViewSets.

Preferred flow:

```text
View
  ↓
Serializer / Validation
  ↓
Service Layer
  ↓
ORM / Repository
  ↓
Database
```

Example:

```text
POST /engagements
       ↓
EngagementView
       ↓
EngagementSerializer
       ↓
EngagementService.create_engagement()
       ↓
transaction.atomic()
       ↓
PostgreSQL
       ↓
on_commit()
       ↓
publish event
```

---

# Workflow Implementation

Use a single centralized transition map.

Example:

```python
ALLOWED_TRANSITIONS = {
    "NOT_STARTED": {
        "IN_PROGRESS",
    },
    "IN_PROGRESS": {
        "WAITING_FOR_CLIENT",
        "READY_FOR_REVIEW",
    },
    "WAITING_FOR_CLIENT": {
        "IN_PROGRESS",
    },
    "READY_FOR_REVIEW": {
        "COMPLETED",
        "CHANGES_REQUESTED",
    },
    "CHANGES_REQUESTED": {
        "IN_PROGRESS",
    },
    "COMPLETED": set(),
}
```

Every status change must:

1. Validate transition.
2. Validate authorization.
3. Update Task.
4. Create TaskHistory.
5. Execute atomically.

---

# Authorization Rules

## Team Member

Can:

```text
View assigned tasks
Move own task:
    NOT_STARTED -> IN_PROGRESS
    IN_PROGRESS -> WAITING_FOR_CLIENT
    IN_PROGRESS -> READY_FOR_REVIEW
    WAITING_FOR_CLIENT -> IN_PROGRESS
    CHANGES_REQUESTED -> IN_PROGRESS
```

Cannot:

```text
Approve
Request changes
Update another user's task
Assign tasks
Create engagements
```

## Manager

Can:

```text
Create engagement
Assign/reassign tasks
Set deadlines
Review tasks
Approve
Request changes
```

Cannot approve their own assigned task.

## Admin

Can perform all administrative actions.

---

# Docker

Use Docker for all services.

Local infrastructure:

```text
postgres
redis
```

Application containers:

```text
auth-service
engagement-service
task-service
worker-service
```

Frontend:

```text
frontend
```

Docker Compose is for local development.

Do not expose PostgreSQL or Redis unnecessarily to the host.

Internal communication:

```text
postgres:5432
redis:6379
auth-service:8000
engagement-service:8000
task-service:8000
```

Only public-facing application endpoints should have published ports.

Current local development ports:

```text
Auth        → localhost:8001
Engagement  → localhost:8002
Task        → localhost:8003
```

---

# Docker Development

Run from:

```text
task-management/
```

Never run Compose commands from inside `services/`.

Use:

```bash
docker compose up -d --build
```

Check:

```bash
docker compose ps
```

Logs:

```bash
docker compose logs auth-service
docker compose logs engagement-service
docker compose logs task-service
docker compose logs worker-service
```

Django commands should normally be executed inside the container:

```bash
docker compose exec auth-service python manage.py migrate
docker compose exec engagement-service python manage.py migrate
docker compose exec task-service python manage.py migrate
```

Do not accidentally connect Django to the developer's local PostgreSQL.

Containers should use:

```text
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
```

not:

```text
localhost
```

---

# Postman

All API testing must use Postman.

Do not use curl unless specifically needed for debugging.

Create one collection:

```text
Task Management API
```

Variables:

```text
base_auth_url = http://localhost:8001
base_engagement_url = http://localhost:8002
base_task_url = http://localhost:8003
access_token = ...
```

Use:

```text
Authorization
→ Bearer Token
→ {{access_token}}
```

Recommended request groups:

```text
Auth
Clients
Services
Task Templates
Engagements
Tasks
```

---

# Testing Requirements

Minimum backend automated tests: 3.

Target at least 7 meaningful tests.

Required/suggested tests:

```text
1. Unauthorized task update is rejected.
2. Duplicate recurring engagement is rejected.
3. Invalid workflow transition is rejected.
4. Manager approval works correctly.
5. Team Member cannot approve own work.
6. Task generation is idempotent.
7. Changes Requested sends task back to In Progress.
```

Use:

```text
pytest
pytest-django
```

Tests must focus on backend business rules rather than merely checking that endpoints return 200.

---

# Dashboard

Provide a simple dashboard with:

```text
Open tasks
Overdue tasks
Tasks due today
Tasks waiting for client
Tasks waiting for review
```

Use database queries/aggregations rather than loading all tasks into application memory.

Recommended indexes:

```text
(status, due_date)
(assigned_to_id, status)
```

---

# Sample Data

Seed dummy data:

```text
1 Admin
2 Managers
4 Team Members

5 Clients

3 Service Types

20+ Tasks
```

Suggested services:

```text
Monthly GST Compliance
GST Registration
GST Refund
```

Do not use real or confidential information.

---

# Production Scaling

The assignment asks us to consider growth to approximately 5 million tasks.

Address:

## Database indexes

Use indexes for:

```text
assigned_to_id
status
due_date
engagement_id
```

and combined indexes based on dashboard/task-list queries.

## Pagination

Never return millions of tasks.

Use pagination.

Prefer cursor pagination for large task lists.

## Background Jobs

Recurring work and heavy processing should run in Worker/Celery.

Do not block user requests with recurring generation.

## Dashboard

Use indexed queries and aggregation.

For very large scale, consider:

```text
cached counters
summary tables
materialized views
```

only when justified.

## Logging

Include:

```text
request_id
user_id
task_id
engagement_id
event
service
timestamp
error
```

## Monitoring

Use:

```text
AWS CloudWatch
```

for application logs and metrics.

---

# AWS Architecture

Production target:

```text
                     Internet
                         |
                       HTTPS
                         |
                      ALB
                         |
                ECS / Fargate
         ┌────────┬──────┼───────┐
         │        │      │       │
       Auth   Engagement  Task   Worker
         │        │       │       │
         └────────┴──────┼───────┘
                         |
                    RDS PostgreSQL
                         |
                  ElastiCache Redis
```

AWS services:

```text
ECR
ECS Fargate
ALB
RDS PostgreSQL
ElastiCache Redis
CloudWatch
Secrets Manager
```

Container images should be stored in ECR.

Do not use EC2 unless there is a specific reason.

---

# CI/CD

Preferred deployment pipeline:

```text
GitHub
   ↓
GitHub Actions
   ↓
Run tests
   ↓
Build Docker images
   ↓
Push images to ECR
   ↓
Deploy ECS services
```

The pipeline should fail if backend tests fail.

---

# Frontend

Use:

```text
React
TypeScript
```

Keep the UI intentionally simple.

Pages:

```text
Login
Dashboard
Clients
Services
Engagements
My Tasks
Task Details
```

Do not spend excessive time on animations or visual complexity.

Backend correctness has higher priority.

---

# Current Project State

The project was started manually and already has the following work completed.

## Completed

```text
Docker Compose
PostgreSQL
Redis

Auth Service
    User model
    JWT login
    JWT refresh
    /me
    role claims

Engagement Service
    Client
    ServiceType
    TaskTemplate
    Engagement
    validation
    duplicate engagement constraint
    JWT authentication
    role authorization

Task Service
    tasks app
    Task model
    TaskHistory model
    JWT configuration
    workflow/business logic foundation

Worker Service
    Celery
    Redis broker
    event-driven task generation foundation
```

## Current priority

The application must now be brought to a stable, coherent implementation.

Do not randomly add new features.

First verify and correct:

```text
1. Auth Service
2. Engagement Service
3. Task Service
4. Worker Service
5. Docker Compose
```

Then complete:

```text
6. Service-to-service authentication
7. Idempotent task generation
8. Recurring engagement generation
9. Assignment/reassignment
10. Manager review APIs
11. Dashboard
12. Tests
13. Frontend
14. AWS deployment
15. README
16. Technical design note
```

---

# Important Existing Design Decisions

These decisions have already been made.

Do not change them without a strong architectural reason.

### Decision 1

Use a small number of domain-oriented services instead of creating one service per entity.

### Decision 2

Use one PostgreSQL instance locally and RDS PostgreSQL in production.

### Decision 3

Service ownership is logical even when using one PostgreSQL instance.

### Decision 4

Use Redis + Celery for asynchronous event processing.

### Decision 5

Use JWT for authentication and role claims.

### Decision 6

Use PostgreSQL constraints as the final line of defense for duplicate prevention.

### Decision 7

Use transactions for multi-step operations.

### Decision 8

Use `transaction.on_commit()` before publishing domain events.

### Decision 9

Design background processing to tolerate duplicate delivery.

### Decision 10

Do not put business logic in ViewSets.

---

# Code Quality Rules

Always:

* Use type hints where useful.
* Keep functions small.
* Keep services cohesive.
* Validate input at the API boundary.
* Keep business rules in service/domain layer.
* Use meaningful exception types.
* Return clear error responses.
* Use transactions for atomic operations.
* Add indexes intentionally.
* Write automated tests for business rules.
* Avoid duplicated constants.
* Avoid unnecessary abstractions.
* Prefer readable code over clever code.

Do not:

* Put all logic into views.
* Access another service's database directly.
* Hard-code production secrets.
* Trust frontend authorization.
* Allow arbitrary task status changes.
* Return entire large datasets.
* Add unnecessary microservices.
* Add infrastructure solely to appear "enterprise."

---

# Definition of Done

A feature is not considered complete until:

```text
Code implemented
↓
Migration created
↓
Docker build passes
↓
Service starts
↓
Postman endpoint tested
↓
Authorization tested
↓
Validation tested
↓
Automated tests added where relevant
↓
Logs checked
```

---

# Implementation Order

Follow this order unless there is a clear dependency requiring a change:

```text
PHASE 1
Infrastructure
    Docker
    PostgreSQL
    Redis

PHASE 2
Auth Service
    JWT
    Roles
    User endpoints

PHASE 3
Engagement Service
    Clients
    Service Types
    Task Templates
    Engagements

PHASE 4
Task Service
    Tasks
    Workflow
    Assignment
    Review
    Audit

PHASE 5
Worker
    Celery
    Redis
    EngagementCreated
    Task generation
    Idempotency

PHASE 6
Recurring processing
    Monthly
    Quarterly
    Yearly
    Duplicate prevention

PHASE 7
Automated tests

PHASE 8
Dashboard

PHASE 9
React frontend

PHASE 10
Service-to-service security

PHASE 11
AWS
    ECR
    ECS/Fargate
    RDS
    ElastiCache
    ALB
    CloudWatch
    Secrets Manager

PHASE 12
README
Technical Design Note
Final validation
```

---

# Final Goal

The final end-to-end flow should be:

```text
Manager logs in
       ↓
Auth Service
       ↓
JWT
       ↓
Manager creates Engagement
       ↓
Engagement Service
       ↓
PostgreSQL transaction
       ↓
ENGAGEMENT_CREATED
       ↓
Redis
       ↓
Worker Service
       ↓
Fetch Task Templates
       ↓
Task Service
       ↓
Create Tasks transactionally
       ↓
Tasks available to Team Members
       ↓
Team Member updates task
       ↓
READY_FOR_REVIEW
       ↓
Manager reviews
       ├── COMPLETED
       └── CHANGES_REQUESTED
                ↓
           IN_PROGRESS
```

The implementation should demonstrate strong backend engineering, clean domain boundaries, database constraints, server-side authorization, workflow enforcement, asynchronous processing, idempotency, automated testing, and production-aware deployment decisions.
