#!/usr/bin/env bash
#
# Black-box functional test of the running stack via curl + psql assertions.
# Exercises validation, CRUD, soft delete, bidirectional sync, status flagging,
# adoption, and resilience against the real containers.
#
# Expects a freshly-seeded stack with the scheduler disabled (so the only syncs
# are the ones this script triggers). `make functional-test` sets that up; to run
# standalone:  SYNC_CRON_ENABLED=false make up && make seed && bash scripts/functional-test.sh

set -uo pipefail
API="${API_URL:-http://localhost:3000}"
EXT="${EXTERNAL_API_URL:-http://localhost:4000}"
pass=0
fail=0

ok() {
  if [ "$2" = "$3" ]; then
    printf '  \033[32m✓\033[0m %s\n' "$1"
    pass=$((pass + 1))
  else
    printf '  \033[31m✗ %s (want=%s got=%s)\033[0m\n' "$1" "$2" "$3"
    fail=$((fail + 1))
  fi
}
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
J() { python3 -c "import sys,json;print($1)"; }
psql() { docker compose exec -T postgres psql -U postgres -d nestjs_db -tA -c "$1" 2>/dev/null; }
sync() { curl -s -X POST "$API/api/sync"; }
nlocal() { curl -s "$API/api/todolists" | J 'len(json.load(sys.stdin))'; }
next() { curl -s "$EXT/todolists" | J 'len(json.load(sys.stdin))'; }

echo "### 1) Request validation (class-validator + ValidationPipe)"
ok "POST list {} -> 400"          400 "$(code -X POST $API/api/todolists -H 'content-type: application/json' -d '{}')"
ok "POST list {name:123} -> 400"  400 "$(code -X POST $API/api/todolists -H 'content-type: application/json' -d '{"name":123}')"
ok "POST list {name:\"\"} -> 400"   400 "$(code -X POST $API/api/todolists -H 'content-type: application/json' -d '{"name":""}')"
ok "POST list valid -> 201"       201 "$(code -X POST $API/api/todolists -H 'content-type: application/json' -d '{"name":"Functest"}')"
FID=$(curl -s $API/api/todolists | J 'next((l["id"] for l in json.load(sys.stdin) if l["name"]=="Functest"),"")')
ok "POST item missing title -> 400" 400 "$(code -X POST $API/api/todolists/$FID/items -H 'content-type: application/json' -d '{"description":"x"}')"
ok "POST item valid -> 201"        201 "$(code -X POST $API/api/todolists/$FID/items -H 'content-type: application/json' -d '{"title":"t","description":"x"}')"
curl -s -o /dev/null -X DELETE $API/api/todolists/$FID

echo "### 2) CRUD + soft delete"
LID=$(curl -s -X POST $API/api/todolists -H 'content-type: application/json' -d '{"name":"CRUD"}' | J 'json.load(sys.stdin)["id"]')
IID=$(curl -s -X POST $API/api/todolists/$LID/items -H 'content-type: application/json' -d '{"title":"a","description":"b"}' | J 'json.load(sys.stdin)["id"]')
ok "item created, listed" 1 "$(curl -s $API/api/todolists/$LID/items | J 'len(json.load(sys.stdin))')"
curl -s -o /dev/null -X DELETE $API/api/todolists/$LID/items/$IID
ok "soft-deleted item hidden from API" 0 "$(curl -s $API/api/todolists/$LID/items | J 'len(json.load(sys.stdin))')"
ok "soft-deleted item tombstoned in DB" t "$(psql "SELECT \"deletedAt\" IS NOT NULL FROM todo_item WHERE id=$IID")"
curl -s -o /dev/null -X DELETE $API/api/todolists/$LID

echo "### 3) Sync convergence (pull remote-only + push local-only)"
ok "pre: local lists = 2"    2 "$(nlocal)"
ok "pre: external lists = 3" 3 "$(next)"
S=$(sync); echo "    $S"
ok "pulled = 3" 3 "$(echo "$S" | J 'json.load(sys.stdin)["pulled"]')"
ok "pushed = 2" 2 "$(echo "$S" | J 'json.load(sys.stdin)["pushed"]')"
ok "failed = 0 (zod parsed live external)" 0 "$(echo "$S" | J 'len(json.load(sys.stdin)["failed"])')"
ok "post: local lists = 5"    5 "$(nlocal)"
ok "post: external lists = 5" 5 "$(next)"
ok "every local list synced + has externalId" True "$(curl -s $API/api/todolists | J 'all(l["externalId"] and l["syncStatus"]=="synced" for l in json.load(sys.stdin))')"
curl -s $EXT/todolists -o /tmp/ext_check.json
ok "pushed lists carry source_id=String(localId)" True "$(python3 -c 'import json;d=json.load(open("/tmp/ext_check.json"));print(any(l.get("source_id")=="1" for l in d) and any(l.get("source_id")=="2" for l in d))')"

echo "### 4) Idempotency (re-run = no-op, no duplicates)"
S2=$(sync)
ok "re-sync pulled = 0" 0 "$(echo "$S2" | J 'json.load(sys.stdin)["pulled"]')"
ok "re-sync pushed = 0" 0 "$(echo "$S2" | J 'json.load(sys.stdin)["pushed"]')"
ok "local still 5"    5 "$(nlocal)"
ok "external still 5" 5 "$(next)"

echo "### 5) Status flagging: new item on a synced list (algorithm flags it)"
GID=$(curl -s $API/api/todolists | J 'next(l["id"] for l in json.load(sys.stdin) if l["name"]=="Groceries (local)")')
NID=$(curl -s -X POST $API/api/todolists/$GID/items -H 'content-type: application/json' -d '{"title":"new","description":"z"}' | J 'json.load(sys.stdin)["id"]')
ok "created as pending (not unsynced)" pending "$(psql "SELECT \"syncStatus\" FROM todo_item WHERE id=$NID")"
sync >/dev/null
ok "flagged unsynced after sync" unsynced "$(psql "SELECT \"syncStatus\" FROM todo_item WHERE id=$NID")"

echo "### 6) Edit honesty: edit a synced item -> pending, stays pending"
EID=$(psql "SELECT id FROM todo_item WHERE \"syncStatus\"='synced' LIMIT 1")
curl -s -o /dev/null -X PUT $API/api/todolists/$GID/items/$EID -H 'content-type: application/json' -d '{"title":"edited","description":"y","completed":true}'
ok "edited -> pending" pending "$(psql "SELECT \"syncStatus\" FROM todo_item WHERE id=$EID")"
sync >/dev/null
ok "still pending after sync (not lied synced)" pending "$(psql "SELECT \"syncStatus\" FROM todo_item WHERE id=$EID")"

echo "### 7) Adopt: recover lost externalId without duplicating"
IPID=$(curl -s $API/api/todolists | J 'next(l["id"] for l in json.load(sys.stdin) if l["name"]=="Interview prep (local)")')
extbefore=$(next)
psql "UPDATE todo_list SET \"externalId\"=NULL, \"syncStatus\"='pending' WHERE id=$IPID" >/dev/null
S4=$(sync)
ok "adopted >= 1" True "$(echo "$S4" | J 'json.load(sys.stdin)["adopted"]>=1')"
ok "no duplicate remote (external count unchanged)" "$extbefore" "$(next)"
ok "externalId backfilled + synced" t "$(psql "SELECT (\"externalId\" IS NOT NULL AND \"syncStatus\"='synced') FROM todo_list WHERE id=$IPID")"

echo "### 8) Resilience: external API unreachable -> graceful, no crash"
docker compose stop external-api >/dev/null 2>&1
S5=$(sync)
ok "sync reports failure, doesn't throw" True "$(echo "$S5" | J 'len(json.load(sys.stdin)["failed"])>=1')"
ok "API still serving (200)" 200 "$(code $API/api/todolists)"
docker compose start external-api >/dev/null 2>&1

echo
echo "=================  $pass passed, $fail failed  ================="
exit $fail
