#!/usr/bin/env bash
#
# Direct endpoint smoke test for a freshly reset and seeded backend stack.
# Run via: make verify-endpoints

set -uo pipefail

API="${API_URL:-http://localhost:3000}"
EXT="${EXTERNAL_API_URL:-http://localhost:4000}"
stamp="endpoint-$(date +%s)"
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

json_expr() {
  python3 -c "import sys,json; data=json.load(sys.stdin); print($1)"
}

http_code() {
  curl -sS -o "/tmp/endpoint-smoke-body.$$" -w '%{http_code}' "$@"
}

echo "### Direct endpoint smoke ($stamp)"

local_list_code="$(
  http_code -X POST "$API/api/todolists" \
    -H 'content-type: application/json' \
    -d "{\"name\":\"Local endpoint $stamp\"}"
)"
ok_eq "local POST /api/todolists" 201 "$local_list_code"
local_list_body="$(cat "/tmp/endpoint-smoke-body.$$")"
local_id="$(echo "$local_list_body" | json_expr 'data["id"]')"

ok_eq "local GET /api/todolists/:id" 200 "$(http_code "$API/api/todolists/$local_id")"
ok_eq "local PUT /api/todolists/:id" 200 "$(
  http_code -X PUT "$API/api/todolists/$local_id" \
    -H 'content-type: application/json' \
    -d "{\"name\":\"Local endpoint renamed $stamp\"}"
)"

item_code="$(
  http_code -X POST "$API/api/todolists/$local_id/items" \
    -H 'content-type: application/json' \
    -d "{\"title\":\"Local endpoint item $stamp\"}"
)"
ok_eq "local POST /api/todolists/:id/items" 201 "$item_code"
item_body="$(cat "/tmp/endpoint-smoke-body.$$")"
item_id="$(echo "$item_body" | json_expr 'data["id"]')"

ok_eq "local GET /api/todolists/:id/items" 200 "$(http_code "$API/api/todolists/$local_id/items")"
ok_eq "local GET /api/todolists/:id/items/:itemId" 200 "$(http_code "$API/api/todolists/$local_id/items/$item_id")"
ok_true "local item payload has no description" "$(cat "/tmp/endpoint-smoke-body.$$" | json_expr '"description" not in data')"
local_item_patch="$(printf '{"title":"%s","completed":true}' "Local endpoint item v2 $stamp")"
ok_eq "local PUT /api/todolists/:id/items/:itemId" 200 "$(
  http_code -X PUT "$API/api/todolists/$local_id/items/$item_id" \
    -H 'content-type: application/json' \
    -d "$local_item_patch"
)"
ok_eq "local DELETE /api/todolists/:id/items/:itemId" 200 "$(
  http_code -X DELETE "$API/api/todolists/$local_id/items/$item_id"
)"
ok_eq "local DELETE /api/todolists/:id" 200 "$(
  http_code -X DELETE "$API/api/todolists/$local_id"
)"

external_create="$(
  curl -sS -X POST "$EXT/todolists" \
    -H 'content-type: application/json' \
    -d "{\"source_id\":\"ext-endpoint-$stamp\",\"name\":\"External endpoint $stamp\",\"items\":[{\"source_id\":\"ext-endpoint-item-$stamp\",\"description\":\"External endpoint item $stamp\",\"completed\":false}]}"
)"
external_id="$(echo "$external_create" | json_expr 'data["id"]')"
external_item_id="$(echo "$external_create" | json_expr 'data["items"][0]["id"]')"
ok_eq "external POST /todolists" "External endpoint $stamp" "$(echo "$external_create" | json_expr 'data["name"]')"
ok_eq "external GET /todolists" 200 "$(http_code "$EXT/todolists")"
ok_eq "external PATCH /todolists/:id" 200 "$(
  http_code -X PATCH "$EXT/todolists/$external_id" \
    -H 'content-type: application/json' \
    -d "{\"name\":\"External endpoint renamed $stamp\"}"
)"
ok_eq "external list rename persisted" "External endpoint renamed $stamp" "$(cat "/tmp/endpoint-smoke-body.$$" | json_expr 'data["name"]')"
external_item_patch="$(printf '{"description":"%s","completed":true}' "External endpoint item v2 $stamp")"
ok_eq "external PATCH /todolists/:id/todoitems/:itemId" 200 "$(
  http_code -X PATCH "$EXT/todolists/$external_id/todoitems/$external_item_id" \
    -H 'content-type: application/json' \
    -d "$external_item_patch"
)"
ok_eq "external item patch description persisted" "External endpoint item v2 $stamp" "$(cat "/tmp/endpoint-smoke-body.$$" | json_expr 'data["description"]')"
ok_true "external item patch completed persisted" "$(cat "/tmp/endpoint-smoke-body.$$" | json_expr 'data["completed"] is True')"
ok_eq "external DELETE /todolists/:id/todoitems/:itemId" 204 "$(
  http_code -X DELETE "$EXT/todolists/$external_id/todoitems/$external_item_id"
)"
ok_eq "external DELETE /todolists/:id" 204 "$(
  http_code -X DELETE "$EXT/todolists/$external_id"
)"

printf '### Endpoint smoke result: %s passed, %s failed\n' "$pass" "$fail"
exit "$fail"
