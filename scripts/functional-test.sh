#!/usr/bin/env bash
#
# Black-box functional test of the running stack via curl + psql assertions.
# Exercises validation, CRUD, soft delete, and the full bidirectional sync:
# create/pull/push, last-write-wins updates both ways, delete propagation both
# ways, status flagging, adoption, and resilience.
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
lfield() { curl -s "$API/api/todolists" | python3 -c "import sys,json;print(next(l['$2'] for l in json.load(sys.stdin) if l['name']=='$1'))"; }
extget() { curl -s "$EXT/todolists" -o /tmp/ext.json; }

echo "### 1) Request validation (class-validator + ValidationPipe)"
ok "POST list {} -> 400"          400 "$(code -X POST $API/api/todolists -H 'content-type: application/json' -d '{}')"
ok "POST list {name:123} -> 400"  400 "$(code -X POST $API/api/todolists -H 'content-type: application/json' -d '{"name":123}')"
ok "POST list valid -> 201"       201 "$(code -X POST $API/api/todolists -H 'content-type: application/json' -d '{"name":"Functest"}')"
FID=$(lfield Functest id)
ok "POST item missing title -> 400" 400 "$(code -X POST $API/api/todolists/$FID/items -H 'content-type: application/json' -d '{}')"
curl -s -o /dev/null -X DELETE $API/api/todolists/$FID

echo "### 2) Sync convergence (pull remote-only + push local-only)"
ok "pre: local lists = 2"    2 "$(nlocal)"
ok "pre: external lists = 3" 3 "$(next)"
S=$(sync); echo "    $S"
ok "pulled = 3" 3 "$(echo "$S" | J 'json.load(sys.stdin)["pulled"]')"
ok "pushed = 2" 2 "$(echo "$S" | J 'json.load(sys.stdin)["pushed"]')"
ok "failed = 0" 0 "$(echo "$S" | J 'len(json.load(sys.stdin)["failed"])')"
ok "post: local = 5"    5 "$(nlocal)"
ok "post: external = 5" 5 "$(next)"
ok "all local lists synced + externalId" True "$(curl -s $API/api/todolists | J 'all(l["externalId"] and l["syncStatus"]=="synced" for l in json.load(sys.stdin))')"

echo "### 3) Idempotency (re-run = no-op)"
S2=$(sync)
ok "re-sync pulled=0 pushed=0 updated=0 deleted=0" "0 0 0 0" "$(echo "$S2" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["pulled"],d["pushed"],d["updated"],d["deleted"])')"

echo "### 4) Status flagging: new item on a synced list"
GID=$(lfield "Groceries (local)" id)
NID=$(curl -s -X POST $API/api/todolists/$GID/items -H 'content-type: application/json' -d '{"title":"new"}' | J 'json.load(sys.stdin)["id"]')
ok "created as pending" pending "$(psql "SELECT \"syncStatus\" FROM todo_item WHERE id=$NID")"
sync >/dev/null
ok "flagged pending_remote_create (placeholder)" pending_remote_create "$(psql "SELECT \"syncStatus\" FROM todo_item WHERE id=$NID")"

echo "### 5) Update local -> remote (last-write-wins)"
GEXT=$(lfield "Groceries (local)" externalId)
curl -s -o /dev/null -X PUT $API/api/todolists/$GID -H 'content-type: application/json' -d '{"name":"Groceries EDITED"}'
ok "list edit -> pending" pending "$(psql "SELECT \"syncStatus\" FROM todo_list WHERE id=$GID")"
sync >/dev/null
ok "list edit -> synced after sync" synced "$(psql "SELECT \"syncStatus\" FROM todo_list WHERE id=$GID")"
extget
ok "remote list name updated" "Groceries EDITED" "$(python3 -c "import json;d=json.load(open('/tmp/ext.json'));print(next(l['name'] for l in d if l['id']=='$GEXT'))")"

IID=$(curl -s $API/api/todolists/$GID/items | J 'next(i["id"] for i in json.load(sys.stdin) if i["externalId"])')
IEXT=$(curl -s $API/api/todolists/$GID/items | python3 -c "import sys,json;print(next(i['externalId'] for i in json.load(sys.stdin) if i['id']==$IID))")
curl -s -o /dev/null -X PUT $API/api/todolists/$GID/items/$IID -H 'content-type: application/json' -d '{"title":"Milk EDITED","completed":true}'
sync >/dev/null
extget
ok "remote item reflects local edit" "Milk EDITED" "$(python3 -c "import json;d=json.load(open('/tmp/ext.json'));print(next(i['description'] for l in d if l['id']=='$GEXT' for i in l['items'] if i['id']=='$IEXT'))")"

echo "### 6) Update remote -> local (last-write-wins)"
sleep 1
curl -s -o /dev/null -X PATCH $EXT/todolists/$GEXT/todoitems/$IEXT -H 'content-type: application/json' -d '{"description":"REMOTE EDIT","completed":false}'
sync >/dev/null
ok "local item title reflects remote edit" "REMOTE EDIT" "$(psql "SELECT title FROM todo_item WHERE id=$IID")"
ok "local item still synced" synced "$(psql "SELECT \"syncStatus\" FROM todo_item WHERE id=$IID")"

echo "### 7) Delete local -> remote (propagate + purge)"
curl -s -o /dev/null -X DELETE $API/api/todolists/$GID/items/$IID
sync >/dev/null
ok "deleted item purged locally" "" "$(psql "SELECT id FROM todo_item WHERE id=$IID")"
extget
ok "deleted item gone from remote" False "$(python3 -c "import json;d=json.load(open('/tmp/ext.json'));print(any(i['id']=='$IEXT' for l in d if l['id']=='$GEXT' for i in l['items']))")"

PLID=$(lfield "Interview prep (local)" id)
PEXT=$(lfield "Interview prep (local)" externalId)
curl -s -o /dev/null -X DELETE $API/api/todolists/$PLID
sync >/dev/null
ok "deleted list purged locally" "" "$(psql "SELECT id FROM todo_list WHERE id=$PLID")"
extget
ok "deleted list gone from remote" False "$(python3 -c "import json;d=json.load(open('/tmp/ext.json'));print(any(l['id']=='$PEXT' for l in d))")"

echo "### 8) Delete remote -> local (propagate)"
BLID=$(lfield "Bug triage (external)" id)
BEXT=$(lfield "Bug triage (external)" externalId)
curl -s -o /dev/null -X DELETE $EXT/todolists/$BEXT
sync >/dev/null
ok "local list removed after remote delete" "" "$(psql "SELECT id FROM todo_list WHERE id=$BLID")"

echo "### 9) Idempotency after all changes"
S3=$(sync)
ok "final sync no failures" 0 "$(echo "$S3" | J 'len(json.load(sys.stdin)["failed"])')"
ok "final sync no updates/deletes" "0 0" "$(echo "$S3" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["updated"],d["deleted"])')"

echo "### 10) Resilience: external API unreachable -> graceful"
docker compose stop external-api >/dev/null 2>&1
S4=$(sync)
ok "sync reports failure, doesn't throw" True "$(echo "$S4" | J 'len(json.load(sys.stdin)["failed"])>=1')"
ok "API still serving (200)" 200 "$(code $API/api/todolists)"
docker compose start external-api >/dev/null 2>&1

echo
echo "=================  $pass passed, $fail failed  ================="
exit $fail
