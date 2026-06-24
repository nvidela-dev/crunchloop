import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchTodoSnapshot,
  formatInterval,
  pollIntervalMs,
  runSync,
  type SyncStatus,
  type SyncSummary,
  type TodoListWithItems,
} from "./api";
import "./App.css";
import logo from "./assets/logo.png";

type LoadState = "idle" | "loading" | "ready" | "error";

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function App() {
  const activeRefresh = useRef<AbortController | null>(null);
  const [lists, setLists] = useState<TodoListWithItems[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [lastSummary, setLastSummary] = useState<SyncSummary | null>(null);

  const stats = useMemo(() => getStats(lists), [lists]);

  const refresh = useCallback(async () => {
    activeRefresh.current?.abort();
    const controller = new AbortController();
    activeRefresh.current = controller;

    setIsRefreshing(true);
    setLoadState((current) => (current === "idle" ? "loading" : current));

    try {
      const snapshot = await fetchTodoSnapshot(controller.signal);
      setLists(snapshot);
      setLastRefresh(new Date());
      setLoadState("ready");
      setError(null);
    } catch (caught) {
      if (!isAbortError(caught)) {
        setLoadState("error");
        setError(describeError(caught));
      }
    } finally {
      if (activeRefresh.current === controller) {
        activeRefresh.current = null;
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timerId = window.setInterval(() => {
      void refresh();
    }, pollIntervalMs);

    return () => {
      window.clearInterval(timerId);
      activeRefresh.current?.abort();
    };
  }, [refresh]);

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setError(null);

    try {
      setLastSummary(await runSync());
      await refresh();
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <img className="brand-mark" src={logo} alt="Crunchloop" />
        <div className="sync-panel" aria-live="polite">
          <div>
            <span className="eyebrow">Local API polling</span>
            <p>
              Every {formatInterval(pollIntervalMs)}
              {lastRefresh === null
                ? ""
                : ` | last refresh ${timeFormatter.format(lastRefresh)}`}
            </p>
          </div>
          <button
            className="primary-action"
            disabled={isSyncing}
            type="button"
            onClick={() => {
              void handleSyncNow();
            }}
          >
            {isSyncing ? "Syncing" : "Sync now"}
          </button>
        </div>
      </header>

      <section className="summary-grid" aria-label="Sync summary">
        <Metric label="Lists" value={stats.listCount} />
        <Metric label="Items" value={stats.itemCount} />
        <Metric label="Synced" value={stats.statusCounts.synced} />
        <Metric label="Pending" value={stats.pendingCount} />
      </section>

      {lastSummary !== null && (
        <section className="run-summary" aria-label="Last sync result">
          <span>Last sync</span>
          <strong>
            pulled {lastSummary.pulled}, pushed {lastSummary.pushed}, updated{" "}
            {lastSummary.updated}, pending remote creates{" "}
            {lastSummary.pendingRemoteCreates}
          </strong>
          {lastSummary.failed.length > 0 && (
            <span className="error-text">
              {lastSummary.failed.length} failed
            </span>
          )}
        </section>
      )}

      {error !== null && <p className="error-banner">{error}</p>}

      <section className="content-area">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Todo lists</span>
            <h1>Backend snapshot</h1>
          </div>
          <span className="refresh-state">
            {isRefreshing ? "Refreshing" : loadStateLabel(loadState)}
          </span>
        </div>

        {loadState === "loading" && (
          <p className="empty-state">Loading todos.</p>
        )}
        {loadState !== "loading" && lists.length === 0 && (
          <p className="empty-state">No local todo lists yet.</p>
        )}
        {lists.length > 0 && (
          <div className="list-grid">
            {lists.map((list) => (
              <article className="todo-card" key={list.id}>
                <div className="card-heading">
                  <div>
                    <h2>{list.name}</h2>
                    <p>
                      Local #{list.id}
                      {list.externalId === null
                        ? ""
                        : ` | remote ${list.externalId}`}
                    </p>
                  </div>
                  <StatusBadge status={list.syncStatus} />
                </div>

                <ul className="item-list">
                  {list.items.map((item) => (
                    <li key={item.id}>
                      <span
                        className={
                          item.completed
                            ? "completion-dot done"
                            : "completion-dot"
                        }
                      />
                      <div>
                        <strong>{item.title}</strong>
                        <span>
                          Item #{item.id}
                          {item.externalId === null
                            ? ""
                            : ` | remote ${item.externalId}`}
                        </span>
                      </div>
                      <StatusBadge status={item.syncStatus} />
                    </li>
                  ))}
                  {list.items.length === 0 && (
                    <li className="empty-row">No items in this list.</li>
                  )}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

interface MetricProps {
  label: string;
  value: number;
}

function Metric({ label, value }: MetricProps) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

interface StatusBadgeProps {
  status: SyncStatus;
}

function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`status-badge ${status}`}>{statusLabel(status)}</span>
  );
}

function statusLabel(status: SyncStatus): string {
  switch (status) {
    case "synced":
      return "Synced";
    case "pending":
      return "Pending";
    case "unsynced":
      return "Unsynced";
    case "pending_remote_create":
      return "Pending create";
  }
}

function loadStateLabel(state: LoadState): string {
  switch (state) {
    case "idle":
      return "Idle";
    case "loading":
      return "Loading";
    case "ready":
      return "Live";
    case "error":
      return "Needs attention";
  }
}

function getStats(lists: TodoListWithItems[]) {
  const statusCounts: Record<SyncStatus, number> = {
    synced: 0,
    pending: 0,
    unsynced: 0,
    pending_remote_create: 0,
  };

  let itemCount = 0;
  for (const list of lists) {
    statusCounts[list.syncStatus] += 1;
    itemCount += list.items.length;
    for (const item of list.items) {
      statusCounts[item.syncStatus] += 1;
    }
  }

  return {
    listCount: lists.length,
    itemCount,
    statusCounts,
    pendingCount:
      statusCounts.pending +
      statusCounts.unsynced +
      statusCounts.pending_remote_create,
  };
}

function isAbortError(value: unknown): boolean {
  return value instanceof DOMException && value.name === "AbortError";
}

function describeError(value: unknown): string {
  return value instanceof Error ? value.message : "Unexpected frontend error";
}

export default App;
