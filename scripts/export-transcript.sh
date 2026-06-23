#!/usr/bin/env bash
#
# Export the Claude Code AI conversation transcripts for the *development of this
# project* into the repo, so we keep a record of how it was built.
#
# The log starts from the demo development onward — only sessions explicitly
# allow-listed in transcripts/.sessions are exported. Each run also adds the
# currently-active session to that allow-list, so the log accumulates as
# development continues across sessions. Earlier, unrelated conversations are
# never included.
#
# Claude Code stores each session as a JSONL file under
#   ~/.claude/projects/<slug>/<session-id>.jsonl
# where <slug> is the absolute project path with '/' replaced by '-'.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_DIR="${ROOT_DIR}/transcripts"
ALLOWLIST="${DEST_DIR}/.sessions"

SLUG="${ROOT_DIR//\//-}"
SRC_DIR="${HOME}/.claude/projects/${SLUG}"

if [[ ! -d "${SRC_DIR}" ]]; then
  echo "No Claude Code transcripts found at: ${SRC_DIR}" >&2
  exit 1
fi

mkdir -p "${DEST_DIR}"
touch "${ALLOWLIST}"

# Add the currently-active session (most recently modified) to the allow-list,
# so this development session becomes part of the log.
current="$(ls -t "${SRC_DIR}"/*.jsonl 2>/dev/null | head -n1 || true)"
if [[ -n "${current}" ]]; then
  current_id="$(basename "${current}" .jsonl)"
  if ! grep -qxF "${current_id}" "${ALLOWLIST}"; then
    echo "${current_id}" >>"${ALLOWLIST}"
  fi
fi

# Copy every allow-listed session that exists.
count=0
while IFS= read -r id; do
  [[ -z "${id}" || "${id}" == \#* ]] && continue
  src="${SRC_DIR}/${id}.jsonl"
  if [[ -f "${src}" ]]; then
    cp "${src}" "${DEST_DIR}/"
    count=$((count + 1))
  fi
done <"${ALLOWLIST}"

echo "Exported ${count} development transcript(s) to ${DEST_DIR}/"
echo "Tracked sessions:"
sed 's/^/  /' "${ALLOWLIST}"
