# Manual Verification Guide

This guide verifies the backend sync behavior with real HTTP calls against the
local NestJS API, the external Todo API, and Postgres.

All runnable commands are exposed through the top-level `Makefile`. The longer
curl flows live in `scripts/`, but reviewers should run them through `make`.

The verification targets intentionally avoid the frontend. They run the API,
Postgres, and external API with `SYNC_CRON_ENABLED=false` so sync checks are
deterministic.

## Prerequisites

- Docker is running.
- The current branch is checked out.
- Ports `3000`, `4000`, and `5432` are available.

## Fast Path

Run the full backend verification suite:

```bash
make verify-backend
```

This target runs:

- backend reset with scheduler disabled
- backend tests, build, lint, Prettier, and whitespace checks
- black-box functional sync suite
- manual sync smoke checks
- direct endpoint smoke checks
- database schema check confirming there is no local `description` column

Expected result: every target exits successfully.

Run the frontend verification separately:

```bash
make verify-frontend
```

Expected result: the frontend lint and production build both succeed.

## Step-by-Step Verification

Use this section when you want to inspect each layer separately.

### 1. Reset the Backend Stack

```bash
make verify-reset
```

Expected:

- Postgres, local API, and external API are rebuilt/started.
- Frontend is not started.
- The command waits until both APIs answer HTTP `200`.

### 2. Seed Both APIs

```bash
make seed
```

Expected:

- Local API seed reports `2 lists, 4 items`.
- External API seed reports `3 list(s)`.

### 3. Run the Black-Box Functional Suite

```bash
make functional-test
```

Expected:

```text
30 passed, 0 failed
```

This target resets and seeds the backend stack before it runs. It covers:

- request validation
- initial convergence
- idempotent re-sync
- local item creation under a synced list becoming `pending_remote_create`
- local-to-remote updates
- remote-to-local updates
- local-to-remote deletes
- remote-to-local deletes
- external API outage handling

### 4. Run Backend Quality Gates

```bash
make verify-quality
```

Expected:

- Jest passes.
- Nest build succeeds.
- ESLint reports no warnings or errors.
- Prettier reports all matched API files use Prettier style.
- The Makefile whitespace check reports no errors.

### 5. Run Manual Sync Smoke Checks

```bash
make verify-manual-sync
```

Expected:

```text
Manual sync smoke result: 26 passed, 0 failed
```

This target resets and seeds the backend stack before it runs. It verifies:

- baseline seed sync pulls remote-only data and pushes local-only data
- immediate re-sync is a no-op
- local `title` becomes remote `description`
- remote `description` becomes local `title`
- local item payloads do not expose `description`
- the unsupported external item-create endpoint is explicit
- a new local item under an already-synced list becomes `pending_remote_create`
- local updates propagate to the external API
- remote updates propagate to the local API
- local deletes propagate to the external API
- remote deletes propagate to the local API

### 6. Run Direct Endpoint Smoke Checks

```bash
make verify-endpoints
```

Expected:

```text
Endpoint smoke result: 19 passed, 0 failed
```

This target resets and seeds the backend stack before it runs. It verifies:

- local list CRUD endpoints
- local nested item CRUD endpoints
- local item responses omit `description`
- external list CRUD endpoints
- external nested item update/delete endpoints

### 7. Verify the Database Schema

```bash
make verify-schema
```

Expected column list:

```text
id,title,completed,todoListId,externalId,syncStatus,createdAt,updatedAt,deletedAt
```

There should be no local `description` column.

### 8. Stop the Stack

```bash
make down
```

## What `pending_remote_create` Means

The external API can create items only as nested payloads in `POST /todolists`.
It cannot create one new item under an already-existing list.

The local sync service therefore preserves the local item, marks it as
`pending_remote_create`, reports it in sync summaries, and avoids destructive
delete/recreate workarounds.

This is the intended behavior until the external API supports creating a single
item under an existing list. See `RFC-001-external-api-item-lifecycle.md` and
`RFC-002-sync-service-interim-action-plan.md`.
