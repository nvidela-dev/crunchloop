# RFC-002 — Sync Service: Interim Handling of the Item-Propagation Gap

| | |
|---|---|
| **Status** | Draft / Proposed |
| **Author** | Nicolas Videla |
| **Created** | 2026-06-23 |
| **Audience** | Sync service owners |
| **Depends on** | RFC-001 (external API; external team, unscheduled) |

## 1. Summary

Until the external API gains item-creation capabilities (RFC-001), our sync service cannot propagate items added to an already-synchronized list.

This RFC defines how the service behaves in the meantime.

Our priority is correctness and idempotency over immediate visibility. The default behavior preserves data and records the limitation explicitly. Temporary divergence is accepted and automatically heals once RFC-001 is implemented.

## 2. Background

The synchronization engine follows a state-based reconciliation loop:

```text
snapshot both sides
→ compare
→ generate a SyncPlan
→ apply the plan
```

All operations are covered by granular and idempotent API calls except one:

> Creating an item under a list that already exists remotely.

Because this capability is missing from the external API, the sync engine cannot achieve full convergence for that scenario.

The delivery of the local service must not be blocked by the roadmap of an external team.

## 3. Goals / Non-goals

### Goals

- Never duplicate or silently lose data.
- Preserve idempotency.
- Make the limitation observable.
- Automatically converge when RFC-001 lands.
- Keep the connector replaceable.

### Non-goals

- Full remote visibility before RFC-001.
- Implementing unsupported behavior.
- Depending on undocumented API semantics.

## 4. Decision

> Default to Option A.
>
> Option B is available behind a feature flag for exceptional situations.
>
> Option C is investigation only.

Correctness is prioritized over immediate consistency.

## 5. Options Considered

### Option A — Defer with `pending_remote_create` status ✅ Recommended

When a new item is created locally under an already-synchronized list, the item remains local and is marked:

```text
syncStatus = "pending_remote_create"
```

The sync run logs the limitation and reports it in the run summary.

When RFC-001 becomes available, these items automatically propagate during the next synchronization.

#### Properties

| Property | Value |
|-----------|-------|
| Propagates new items | No |
| Idempotent | Yes |
| Data-loss risk | None |
| Complexity | Low |

#### Why this is the default

This option preserves correctness and transforms a missing capability into a tracked and observable limitation.

---

### Option B — Scoped Delete-and-Recreate ⚠ Flag-gated

A synchronized list that gains a new item can be recreated remotely.

This approach propagates new items but introduces operational risk:

- Entire lists are reprocessed.
- External identifiers change.
- Timestamps are reset.
- Concurrent remote edits may be overwritten.

#### Properties

| Property | Value |
|-----------|-------|
| Propagates new items | Yes |
| Idempotent | No |
| Data-loss risk | Low–Medium |
| Complexity | High |

#### Why it is not the default

It trades a missing feature for correctness risk.

This option should only be enabled when remote visibility is a stronger requirement than strict safety.

---

### Option C — Probe Undocumented Upsert Behavior 🔬

Experimentally determine whether the API performs an upsert when receiving an existing `source_id`.

If so, document the observation and use it as evidence when proposing RFC-001.

#### Why this is not production behavior

Undocumented behavior is not contractual and may change without notice.

---

### Option D — Silent Drop ❌ Rejected

Ignore unsupported item creations.

Rejected because it creates silent divergence between systems.

---

### Comparison

| Option | New items propagate | Idempotent | Data-loss risk | Complexity | Verdict |
|----------|--------------------|-------------|----------------|-------------|----------|
| A · Defer + marker | ✗ until RFC-001 | ✅ | None | Low | Default |
| B · Scoped recreate | ✅ | ✗ | Low–Medium | High | Flag-gated |
| C · Probe upsert | n/a | n/a | None | Low | Investigation |
| D · Silent drop | ✗ | ✅ | Divergence | None | Rejected |

## 6. Rollout Plan

### Phase 0

Investigate undocumented upsert behavior and feed the findings into RFC-001.

### Phase 1

Ship Option A.

New items on synchronized lists become:

```text
pending_remote_create
```

and are surfaced through logs and run summaries.

### Phase 2

Implement Option B behind:

```text
SYNC_FORCE_LIST_RECREATE
```

only if required by business needs.

### Phase 3

Once RFC-001 lands:

- Drain pending items.
- Remove the feature flag.
- Delete the workaround code.

## 7. Limitations

With the default strategy:

- New items on synchronized lists are invisible remotely until RFC-001.
- Full convergence depends on external capabilities.
- Eventual consistency is achieved only after the external API supports item creation.

## 8. Observability

Structured logs:

```text
sync.item.pending_remote_create
sync.list.recreate.start
sync.list.recreate.ok
sync.list.recreate.failed
```

Run summaries report:

- pending items
- recreate operations
- retries
- failures

Option B can be disabled immediately by turning off the feature flag.

## 9. References

- RFC-001 — Item Lifecycle and Idempotency for the External Todo API.
- Sync engine design documents.
- Reconciliation algorithm documentation.
