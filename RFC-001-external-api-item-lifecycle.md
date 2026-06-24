# RFC-001 — Item lifecycle & idempotency for the external Todo API

| | |
|---|---|
| **Status** | Draft / Proposed |
| **Author** | Nicolas Videla |
| **Created** | 2026-06-23 |
| **Audience** | External Todo API team |
| **Related** | RFC-002 (consumer-side interim plan) |

## 1. Summary

The external Todo API can create items **only** as a nested payload inside `POST /todolists`.

There is no endpoint to add an item to a list that already exists. This makes the single most common steady-state operation in a Todo product — "add a task to an existing list" — **impossible to propagate** for any integrator syncing into the API.

This RFC proposes a small, backward-compatible set of additions, in priority order, that close the gap and make synchronization safe and idempotent.

## 2. Motivation / Problem

Today's documented surface is six endpoints:

```text
POST   /todolists                              create list (+ nested items)
GET    /todolists                              fetch all lists with items
PATCH  /todolists/{id}                         update list name
DELETE /todolists/{id}                         delete list (+ items)
PATCH  /todolists/{id}/todoitems/{itemId}      update item
DELETE /todolists/{id}/todoitems/{itemId}      delete item
```

Updates and deletes are fully covered. **Creation of an item under an existing list is not.**

A consumer that has already pushed a list, so the list and its original items hold server-generated IDs, has no contract-compliant way to add a new item to it:

- Re-`POST`ing the list creates a **duplicate** list. `POST /todolists` documents only `201 Created` and says nothing about `source_id` deduplication.
- `DELETE` + re-`POST` is destructive: it churns every item ID, resets `created_at`, and clobbers any server-side edits to sibling items.

The result is a correctness dead-end for the most frequent user action.

## 3. Goals / Non-goals

**Goals**

- Allow creating an item under an existing list.
- Make creation **idempotent** so retries and re-syncs never duplicate data.

**Non-goals**

- Real-time push / webhooks.
- Authentication and authorization.

## 4. Proposal

### P0 — `POST /todolists/{listId}/todoitems`

Create a single item under an existing list.

```http
POST /todolists/{listId}/todoitems
```

Body:

```json
{
  "source_id": "...",
  "description": "...",
  "completed": false
}
```

Responses:

```text
201 → TodoItem with server-generated ID
404 → Unknown listId
```

### P0 — `source_id` as an idempotency key

On any create operation, including `POST /todolists` and the new item endpoint, if a record with the same `source_id` already exists, return the existing record with `200 OK` instead of creating a duplicate with `201 Created`.

```text
POST /todolists
with existing source_id
→ 200 OK existing list

POST /todolists/{listId}/todoitems
with existing source_id
→ 200 OK existing item
```

This single change makes the sync pipeline safe to retry.

### P1 — `If-Match` / ETag on `PATCH`

Return an `ETag` on reads and accept `If-Match` on `PATCH`.

This enables optimistic concurrency and replaces timestamp-based Last-Write-Wins with true conflict detection.

### P2 — `GET /todolists?since=<timestamp>`

Provide a delta endpoint so consumers do not need to re-fetch the entire dataset every sync.

This removes the main performance ceiling for large accounts.

### P2 — Batch create/update

Provide batch operations to reduce call volume during bulk synchronization.

## 5. Alternatives considered

### Document `POST /todolists` as an upsert on `source_id`

Rejected as the sole fix.

Although this would prevent duplicate lists, it still leaves "add one item to an existing list" as a whole-list round-trip.

The same idempotency semantics proposed above should still apply to create operations.

### Generic `PATCH` with nested `items`

A declarative replacement of the entire item collection is more powerful, but significantly harder to implement and reason about safely.

An explicit item endpoint is simpler and easier for consumers to understand.

## 6. Backwards compatibility

All proposed changes are additive.

Existing clients remain unaffected.

The only behavioral difference is that `POST` requests with a duplicate `source_id` would return `200 OK` instead of creating a second resource with `201 Created`, which is safer for current consumers.

## 7. Risks & limitations

- The idempotency change assumes `source_id` uniqueness within the intended scope. Existing data should be audited to confirm this assumption.
- `If-Match` introduces additional client complexity and should remain optional.

## 8. Open questions

- Is `source_id` intended to be globally unique, or only unique within a parent scope?
- Should item `source_id` values be globally unique or unique only within a list?

## 9. References

- External OpenAPI specification: `docs/external-api.yaml`
- Consumer-side handling of the missing item creation capability until these changes are available: **RFC-002**