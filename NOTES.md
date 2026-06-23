<!--
  NOTES.md — Crunchloop Senior Challenge (Part 2: Sync)
  This is a TEMPLATE. Fill the TODOs, delete the HTML comments before submitting.
  Keep it tight: a reviewer should read this in ~5 minutes. Argue the WHY, not the HOW.
  Decisions already converged on are pre-filled in [brackets] — confirm or change them.
-->

# Sync Engine — Design Notes

## 1. High-level overview

<!-- 1 short paragraph. What it does + the shape of the solution. -->
The sync engine reconciles `TodoList`s and `TodoItem`s bidirectionally between this
local NestJS/Postgres API and an external Todo API. It is a **state-based reconciliation
loop** (snapshot both sides → compute a plan → apply it), modelled on the Kubernetes
controller pattern: it reacts to *current state*, not to an event stream, which makes it
self-healing — a missed change is repaired on the next run.

<!-- TODO: one line on the three phases: snapshot → reconcile (pure) → apply (effects). -->

## 2. How to run

```bash
# TODO: confirm these against your final setup (must work inside the dev container)
docker compose up -d            # or: Reopen in Container
npm install
npm run start:dev               # API up

# Trigger a sync run:
curl -X POST http://localhost:3000/sync
# (also runs automatically on a schedule via @Cron — see SyncService)

npm test                        # unit + integration
```

## 3. Architecture

<!-- Name the major components and the ONE boundary that matters: pure core vs effectful edges. -->
- `sync/reconciler.ts` — **pure** `reconcile(locals, remotes, base) → SyncPlan`. No HTTP, no DB. The heart; fully unit-tested.
- `sync/sync.service.ts` — orchestration: load state → reconcile → apply with retries.
- `sync/ports/external-todo.port.ts` — interface for the external API (DTOs + methods).
- `sync/ports/external-todo.http.ts` — HTTP adapter (@nestjs/axios) with retry/backoff.
- Trigger adapters: `POST /sync` (manual, for demo/tests) + `@Cron` (scheduled).

<!-- Mention: the port lets a FakeExternalTodoPort drive the whole engine in tests with zero network. -->

## 4. Key design decisions

### 4.1 Identity mapping
- Correlation key is the external API's `source_id` = `String(localId)`. On create we send it; we store the returned external `id` in a new `externalId` column on the local row.
- **Why no separate mapping table:** the API gives us `source_id` for exactly this; an in-row `externalId` is the simplest two-way link. <!-- TODO: confirm/adjust -->

### 4.2 Change detection & performance
- New `@UpdateDateColumn` (`updatedAt`) — TypeORM stamps it on every existing `save()` for free.
- Reconciler compares `updatedAt` vs external `updated_at`; **equal ⇒ no API call**. Steady-state sync of an unchanged dataset ≈ 1 call (the GET).
- **Honest limit:** no delta endpoint, so we still `GET` all remote rows each run. See §8.

### 4.3 Conflict resolution
<!-- DECISION SLOT — pick ONE and delete the other. -->
- **[Last-write-wins]** by timestamp: newer `updated_at` wins; tie → local.
  - Accepted failure modes: clock skew between systems; silent lost update on true concurrent edits. Acceptable for todo semantics; would revisit for higher-value data.
- <!-- Alternative if you implement it: three-way merge with a stored "shadow" (last-synced
     snapshot per row) so we can tell WHICH side changed and apply LWW only on real conflicts.
     More correct, ~one extra column. State which you shipped. -->

### 4.4 Deletes
- **Soft delete:** `delete()` sets a `deletedAt` tombstone; the reconciler propagates the external `DELETE`, then a sweep hard-deletes after confirmation. Reads filter `deletedAt IS NULL`.
- **Why:** a hard delete leaves no trace for sync to detect. Soft-delete is the simplest mechanism that propagates deletes in both directions.

## 5. Resilience & error handling

- **Idempotency:** only create remotely when `externalId IS NULL`; persist the returned `externalId` immediately (per-item) so a crash mid-run never double-creates. Re-running a sync converges, never duplicates.
- **Watermark advances last:** `lastSyncAt` moves forward only after a fully successful run (at-least-once delivery; a failed run re-reads its window).
- **Retries:** exponential backoff + jitter; retry on 5xx/timeout, **never on 4xx** (terminal).
- **Partial failure:** each plan item applied independently; failures are collected, logged (structured), and surfaced in a run summary `{ created, updated, deleted, failed[] }`. The next run retries whatever is still dirty.

## 6. Edge cases handled

<!-- Keep this a tight checklist of what your tests actually cover. -->
- Re-run after crash (idempotent, no duplicates).
- Local-only row → created remotely; remote-only row → created locally.
- Concurrent edit on both sides → conflict resolved per §4.3.
- Rename / update on a synced row → propagated, not re-created.
- Local item has `title`; external item has only `description` → mapping in §7.
- Soft-deleted row → propagated as remote delete.

## 7. Assumptions

- External API dedupes (or is safe) on `source_id`. <!-- TODO: verify; note if unverified -->
- Single API instance (no concurrent sync runs). 
- `GET /todolists` returns all lists with items (no pagination).
- Local `title` maps to external `description` (external has no `title` field). <!-- confirm mapping -->
- No item-create endpoint on the external API for existing lists (see §9) — handled by <!-- TODO: how? -->.

## 8. Areas for improvement

- **Near-real-time outbound:** a transactional outbox + relay would replace poll-driven push, with the reconciler kept as the anti-entropy backstop. (Latency/reliability — *not* a scaling change.)
- **Scale:** with a delta endpoint, diff via cursors / Merkle trees instead of full `GET`.
- Three-way merge with a shadow copy (if shipped with plain LWW).
- Distributed lock if run on multiple instances.

## 9. Proposed external-API changes

<!-- Free points — the brief explicitly invites this. Keep to 3–4 bullets. -->
- `GET /todolists?since=<timestamp>` — delta sync; removes the full-scan bottleneck.
- `POST /todolists/{id}/todoitems` — currently no documented way to add an item to an existing list.
- `If-Match` / ETag support — optimistic concurrency instead of timestamp-only LWW.
- Batch create/update — cut call volume for large syncs.
