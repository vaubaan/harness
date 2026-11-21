# Postgres over SQLite for the invoice store

## Context
Invoices must survive concurrent issue from two workers.

## Decision
One Postgres database. Embodied by `docker-compose.yml` (service `db`)
and `src/db/client.ts`. Introduced in commit `4f1c2ab`.

## Consequences
Local setup needs Docker. Migrations live in `db/migrations/`.

## Rejected alternatives
### SQLite
Where it started; its single-writer lock lost a write under two workers.
