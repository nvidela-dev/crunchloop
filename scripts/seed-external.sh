#!/usr/bin/env bash
#
# Seed the EXTERNAL Todo API with demo data — over HTTP only.
# The external API is treated as a black box: this script never touches its code,
# it just POSTs to its public endpoints. Idempotent: lists already present
# (matched by source_id) are skipped, so it is safe to re-run.

set -euo pipefail

BASE="${EXTERNAL_API_URL:-http://localhost:4000}"

# Wait until the external API answers.
for _ in $(seq 1 30); do
  if curl -fsS "${BASE}/todolists" >/dev/null 2>&1; then break; fi
  sleep 1
done

existing="$(curl -fsS "${BASE}/todolists")"

# True if a list with the given source_id already exists in the snapshot.
has_source() {
  printf '%s' "${existing}" \
    | grep -qE "\"source_id\"[[:space:]]*:[[:space:]]*\"$1\""
}

seed_list() {
  local source_id="$1" payload="$2"
  if has_source "${source_id}"; then
    echo "external: '${source_id}' already present, skipping"
  else
    curl -fsS -X POST "${BASE}/todolists" \
      -H 'Content-Type: application/json' -d "${payload}" >/dev/null
    echo "external: seeded '${source_id}'"
  fi
}

seed_list "ext-demo-1" '{
  "source_id": "ext-demo-1",
  "name": "Release checklist (external)",
  "items": [
    { "source_id": "ext-demo-1-a", "description": "Cut the release branch", "completed": true },
    { "source_id": "ext-demo-1-b", "description": "Publish the changelog", "completed": false }
  ]
}'

seed_list "ext-demo-2" '{
  "source_id": "ext-demo-2",
  "name": "Bug triage (external)",
  "items": [
    { "source_id": "ext-demo-2-a", "description": "Label incoming issues", "completed": false }
  ]
}'

count="$(curl -fsS "${BASE}/todolists" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')"
echo "External API now has ${count} list(s)."
