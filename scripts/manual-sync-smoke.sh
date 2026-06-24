#!/usr/bin/env bash
#
# Manual sync smoke test for a freshly reset and seeded backend stack.
# Run via: make verify-manual-sync

set -uo pipefail

API="${API_URL:-http://localhost:3000}"
EXT="${EXTERNAL_API_URL:-http://localhost:4000}"
stamp="manual-$(date +%s)"
pass=0
fail=0

ok_eq() {
  local label="$1" want="$2" got="$3"
  if [ "$want" = "$got" ]; then
    printf '  [ok] %s -> %s\n' "$label" "$got"
    pass=$((pass + 1))
  else
    printf '  [fail] %s want=%s got=%s\n' "$label" "$want" "$got"
    fail=$((fail + 1))
  fi
}

ok_true() {
  ok_eq "$1" "True" "$2"
}

ok_status_in() {
  local label="$1" got="$2"
  shift 2
  local status
  for status in "$@"; do
    if [ "$got" = "$status" ]; then
      printf '  [ok] %s -> %s\n' "$label" "$got"
      pass=$((pass + 1))
      return
    fi
  done
  printf '  [fail] %s got=%s allowed=%s\n' "$label" "$got" "$*"
  fail=$((fail + 1))
}

json_expr() {
  python3 -c "import sys,json; data=json.load(sys.stdin); print($1)"
}

http_code() {
  curl -sS -o "/tmp/manual-sync-body.$$" -w '%{http_code}' "$@"
}

sync_once() {
  curl -sS -X POST "$API/api/sync"
}

echo "### Manual sync smoke ($stamp)"

ok_eq "local GET /api/todolists" 200 "$(http_code "$API/api/todolists")"
ok_eq "external GET /todolists" 200 "$(http_code "$EXT/todolists")"
ok_eq "local POST item under missing list" 404 "$(
  http_code -X POST "$API/api/todolists/999999/items" \
    -H 'content-type: application/json' \
    -d '{"title":"orphan"}'
)"

base_sync="$(sync_once)"
echo "  baseline sync: $base_sync"
ok_eq "baseline pulled" 3 "$(echo "$base_sync" | json_expr 'data["pulled"]')"
ok_eq "baseline pushed" 2 "$(echo "$base_sync" | json_expr 'data["pushed"]')"
ok_eq "baseline failed" 0 "$(echo "$base_sync" | json_expr 'len(data["failed"])')"
ok_eq "baseline pendingRemoteCreates" 0 "$(echo "$base_sync" | json_expr 'data["pendingRemoteCreates"]')"

noop_sync="$(sync_once)"
echo "  no-op sync: $noop_sync"
ok_eq "no-op pulled/pushed/updated/deleted" "0 0 0 0" "$(
  echo "$noop_sync" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["pulled"], d["pushed"], d["updated"], d["deleted"])'
)"

local_list_name="Manual Local $stamp"
local_item_title="Manual local item $stamp"
local_list="$(
  curl -sS -X POST "$API/api/todolists" \
    -H 'content-type: application/json' \
    -d "{\"name\":\"$local_list_name\"}"
)"
local_id="$(echo "$local_list" | json_expr 'data["id"]')"
ok_eq "local POST list syncStatus" pending "$(echo "$local_list" | json_expr 'data["syncStatus"]')"

local_item="$(
  curl -sS -X POST "$API/api/todolists/$local_id/items" \
    -H 'content-type: application/json' \
    -d "{\"title\":\"$local_item_title\"}"
)"
local_item_id="$(echo "$local_item" | json_expr 'data["id"]')"
ok_true "local item response has no description" "$(echo "$local_item" | json_expr '"description" not in data')"
ok_eq "local POST item syncStatus" pending "$(echo "$local_item" | json_expr 'data["syncStatus"]')"

remote_list_name="Manual Remote $stamp"
remote_item_title="Manual remote item $stamp"
remote_list="$(
  curl -sS -X POST "$EXT/todolists" \
    -H 'content-type: application/json' \
    -d "{\"source_id\":\"remote-$stamp\",\"name\":\"$remote_list_name\",\"items\":[{\"source_id\":\"remote-item-$stamp\",\"description\":\"$remote_item_title\",\"completed\":false}]}"
)"
remote_ext_id="$(echo "$remote_list" | json_expr 'data["id"]')"
remote_item_ext_id="$(echo "$remote_list" | json_expr 'data["items"][0]["id"]')"
ok_eq "external POST list item description" "$remote_item_title" "$(echo "$remote_list" | json_expr 'data["items"][0]["description"]')"

unsupported_item_create_code="$(
  http_code -X POST "$EXT/todolists/$remote_ext_id/todoitems" \
    -H 'content-type: application/json' \
    -d "{\"source_id\":\"unsupported-$stamp\",\"description\":\"unsupported\",\"completed\":false}"
)"
ok_status_in "external POST /todolists/:id/todoitems unsupported" "$unsupported_item_create_code" 400 404 405

create_sync="$(sync_once)"
echo "  create sync: $create_sync"
ok_eq "create sync pulled/pushed/failed/pending" "1 1 0 0" "$(
  echo "$create_sync" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["pulled"], d["pushed"], len(d["failed"]), d["pendingRemoteCreates"])'
)"

local_snapshot="$(curl -sS "$API/api/todolists")"
local_external_id="$(
  echo "$local_snapshot" | python3 -c "import sys,json; d=json.load(sys.stdin); print(next(l['externalId'] for l in d if l['id']==$local_id))"
)"
ok_true "local-created list got externalId" "$(python3 -c "print(bool('$local_external_id'))")"

remote_local_id="$(
  echo "$local_snapshot" | python3 -c "import sys,json; d=json.load(sys.stdin); print(next(l['id'] for l in d if l['name']=='$remote_list_name'))"
)"
remote_local_items="$(curl -sS "$API/api/todolists/$remote_local_id/items")"
ok_true "remote description pulled into local title" "$(
  echo "$remote_local_items" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['title']=='$remote_item_title' and 'description' not in d[0])"
)"

remote_snapshot="$(curl -sS "$EXT/todolists")"
ok_true "local title pushed as remote description" "$(
  echo "$remote_snapshot" | python3 -c "import sys,json; d=json.load(sys.stdin); l=next(l for l in d if l['name']=='$local_list_name'); print(l['items'][0]['description']=='$local_item_title')"
)"

local_item_ext_id="$(
  curl -sS "$API/api/todolists/$local_id/items" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(next(i['externalId'] for i in d if i['id']==$local_item_id))"
)"

sleep 1
gap_title="Manual gap item $stamp"
gap_item="$(
  curl -sS -X POST "$API/api/todolists/$local_id/items" \
    -H 'content-type: application/json' \
    -d "{\"title\":\"$gap_title\"}"
)"
gap_id="$(echo "$gap_item" | json_expr 'data["id"]')"
gap_sync="$(sync_once)"
echo "  gap sync: $gap_sync"
ok_eq "gap sync unsynced/pending/failed" "1 1 0" "$(
  echo "$gap_sync" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["unsynced"], d["pendingRemoteCreates"], len(d["failed"]))'
)"
gap_status="$(
  curl -sS "$API/api/todolists/$local_id/items" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(next(i['syncStatus'] for i in d if i['id']==$gap_id))"
)"
ok_eq "gap item local status" pending_remote_create "$gap_status"
ok_eq "gap item not silently created remotely" False "$(
  curl -sS "$EXT/todolists" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); l=next(l for l in d if l['id']=='$local_external_id'); print(any(i.get('description')=='$gap_title' for i in l['items']))"
)"

sleep 1
local_item_title_v2="Manual local item v2 $stamp"
local_item_patch="$(printf '{"title":"%s","completed":true}' "$local_item_title_v2")"
curl -sS -o /dev/null -X PUT "$API/api/todolists/$local_id/items/$local_item_id" \
  -H 'content-type: application/json' \
  -d "$local_item_patch"
local_update_sync="$(sync_once)"
echo "  local update sync: $local_update_sync"
ok_eq "local update sync updated/pending" "1 1" "$(
  echo "$local_update_sync" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["updated"], d["pendingRemoteCreates"])'
)"
ok_true "local item update reached remote" "$(
  curl -sS "$EXT/todolists" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); l=next(l for l in d if l['id']=='$local_external_id'); i=next(i for i in l['items'] if i['id']=='$local_item_ext_id'); print(i['description']=='$local_item_title_v2' and i['completed'] is True)"
)"

remote_local_item_id="$(
  curl -sS "$API/api/todolists/$remote_local_id/items" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'])"
)"
sleep 1
remote_item_title_v2="Manual remote item v2 $stamp"
remote_item_patch="$(printf '{"description":"%s","completed":true}' "$remote_item_title_v2")"
curl -sS -o /dev/null -X PATCH "$EXT/todolists/$remote_ext_id/todoitems/$remote_item_ext_id" \
  -H 'content-type: application/json' \
  -d "$remote_item_patch"
remote_update_sync="$(sync_once)"
echo "  remote update sync: $remote_update_sync"
ok_eq "remote update sync updated/pending" "1 1" "$(
  echo "$remote_update_sync" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["updated"], d["pendingRemoteCreates"])'
)"
ok_true "remote item update reached local" "$(
  curl -sS "$API/api/todolists/$remote_local_id/items" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); i=next(i for i in d if i['id']==$remote_local_item_id); print(i['title']=='$remote_item_title_v2' and i['completed'] is True and 'description' not in i)"
)"

curl -sS -o /dev/null -X DELETE "$API/api/todolists/$local_id/items/$local_item_id"
local_delete_sync="$(sync_once)"
echo "  local delete sync: $local_delete_sync"
ok_true "local item delete removed remote item" "$(
  curl -sS "$EXT/todolists" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); l=next(l for l in d if l['id']=='$local_external_id'); print(not any(i['id']=='$local_item_ext_id' for i in l['items']))"
)"

curl -sS -o /dev/null -X DELETE "$EXT/todolists/$remote_ext_id"
remote_delete_sync="$(sync_once)"
echo "  remote delete sync: $remote_delete_sync"
ok_true "remote list delete removed local list" "$(
  curl -sS "$API/api/todolists" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(not any(l['id']==$remote_local_id for l in d))"
)"

printf '### Manual sync smoke result: %s passed, %s failed\n' "$pass" "$fail"
exit "$fail"
