# Manual Verification Guide

This guide verifies the backend sync behavior with real HTTP calls against the
local NestJS API, the external Todo API, and Postgres.

The commands below intentionally avoid the frontend. They reset the Docker
volumes, seed both APIs, and run deterministic sync checks with the scheduler
disabled.

## Prerequisites

- Docker is running.
- The current branch is checked out.
- Ports `3000`, `4000`, and `5432` are available.

## 1. Start a Clean Backend Stack

This drops the local Postgres and external SQLite volumes.

```bash
docker compose down -v
SYNC_CRON_ENABLED=false docker compose up -d --build postgres api external-api
```

Wait until both APIs answer:

```bash
for i in $(seq 1 60); do
  api_code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/todolists)
  external_code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4000/todolists)
  echo "attempt=$i api=$api_code external=$external_code"
  if [ "$api_code" = "200" ] && [ "$external_code" = "200" ]; then
    break
  fi
  sleep 2
done
```

## 2. Seed Both APIs

```bash
docker compose exec -T api npm run seed
./scripts/seed-external.sh
```

Expected:

- Local API seed reports `2 lists, 4 items`.
- External API seed reports `3 list(s)`.

## 3. Run the Black-Box Functional Suite

```bash
bash scripts/functional-test.sh
```

Expected:

```text
30 passed, 0 failed
```

This covers:

- request validation
- initial convergence
- idempotent re-sync
- local item creation under a synced list becoming `pending_remote_create`
- local-to-remote updates
- remote-to-local updates
- local-to-remote deletes
- remote-to-local deletes
- external API outage handling

## 4. Run Backend Quality Gates

```bash
cd api
npm test -- --runInBand
npm run build
npm run lint -- --max-warnings=0
npx prettier --check "src/**/*.ts"
cd ..
git diff --check
```

Expected:

- Jest: all suites pass.
- Nest build succeeds.
- ESLint reports no warnings or errors.
- Prettier reports all matched files use Prettier style.
- `git diff --check` prints no whitespace errors.

## 5. Manual Sync Smoke Test

Run one baseline sync:

```bash
curl -s -X POST http://localhost:3000/api/sync | python3 -m json.tool
```

Expected after the seed:

```json
{
  "pulled": 3,
  "pushed": 2,
  "adopted": 0,
  "updated": 0,
  "deleted": 0,
  "unsynced": 0,
  "pendingRemoteCreates": 0,
  "failed": []
}
```

Run it again:

```bash
curl -s -X POST http://localhost:3000/api/sync | python3 -m json.tool
```

Expected no-op values:

```json
{
  "pulled": 0,
  "pushed": 0,
  "updated": 0,
  "deleted": 0,
  "failed": []
}
```

## 6. Verify Local Title to Remote Description Mapping

Create a local list and item:

```bash
LOCAL_LIST_ID=$(
  curl -s -X POST http://localhost:3000/api/todolists \
    -H 'content-type: application/json' \
    -d '{"name":"Manual Local"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])'
)

LOCAL_ITEM_ID=$(
  curl -s -X POST "http://localhost:3000/api/todolists/$LOCAL_LIST_ID/items" \
    -H 'content-type: application/json' \
    -d '{"title":"Manual local item"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])'
)
```

Sync:

```bash
curl -s -X POST http://localhost:3000/api/sync | python3 -m json.tool
```

Verify the local item was created remotely as `description`:

```bash
curl -s http://localhost:4000/todolists \
| python3 -c 'import sys,json; d=json.load(sys.stdin); print(next(i["description"] for l in d if l["name"]=="Manual Local" for i in l["items"]))'
```

Expected:

```text
Manual local item
```

Verify local item payloads do not expose `description`:

```bash
curl -s "http://localhost:3000/api/todolists/$LOCAL_LIST_ID/items/$LOCAL_ITEM_ID" \
| python3 -c 'import sys,json; d=json.load(sys.stdin); print("description" in d)'
```

Expected:

```text
False
```

## 7. Verify the External API Gap Is Explicit

Create a new item under the already-synced local list:

```bash
GAP_ITEM_ID=$(
  curl -s -X POST "http://localhost:3000/api/todolists/$LOCAL_LIST_ID/items" \
    -H 'content-type: application/json' \
    -d '{"title":"Manual gap item"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])'
)

curl -s -X POST http://localhost:3000/api/sync | python3 -m json.tool
```

Expected summary includes:

```json
{
  "unsynced": 1,
  "pendingRemoteCreates": 1,
  "failed": []
}
```

Verify the local status:

```bash
docker compose exec -T postgres psql -U postgres -d nestjs_db -tA \
  -c "SELECT \"syncStatus\" FROM todo_item WHERE id=$GAP_ITEM_ID"
```

Expected:

```text
pending_remote_create
```

This is the intended behavior until the external API supports creating a single
item under an existing list. See `RFC-001-external-api-item-lifecycle.md` and
`RFC-002-sync-service-interim-action-plan.md`.

## 8. Verify the Database Schema

```bash
docker compose exec -T postgres psql -U postgres -d nestjs_db -tA \
  -c "SELECT column_name FROM information_schema.columns WHERE table_name='todo_item' ORDER BY ordinal_position;"
```

Expected columns:

```text
id
title
completed
todoListId
externalId
syncStatus
createdAt
updatedAt
deletedAt
```

There should be no local `description` column.

## 9. Stop the Stack

```bash
docker compose down
```
