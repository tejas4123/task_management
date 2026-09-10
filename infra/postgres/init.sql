-- One PostgreSQL instance, one logical database per service.
--
-- Service ownership is enforced by giving every service its own database.
-- This keeps the "a service never touches another service's tables" rule
-- true at the connection level instead of relying on developer discipline,
-- and it maps cleanly onto one RDS instance in production.

CREATE DATABASE auth_db;
CREATE DATABASE engagement_db;
CREATE DATABASE task_db;
