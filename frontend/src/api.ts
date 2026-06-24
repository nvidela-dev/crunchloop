export type SyncStatus =
  | "synced"
  | "pending"
  | "unsynced"
  | "pending_remote_create";

export interface TodoList {
  id: number;
  name: string;
  externalId: string | null;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TodoItem {
  id: number;
  title: string;
  completed: boolean;
  todoListId: number;
  externalId: string | null;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TodoListWithItems extends TodoList {
  items: TodoItem[];
}

export interface SyncSummary {
  pulled: number;
  pushed: number;
  adopted: number;
  updated: number;
  deleted: number;
  unsynced: number;
  pendingRemoteCreates: number;
  durationMs: number;
  failed: string[];
}

const apiUrl = readStringEnv(
  import.meta.env.VITE_API_URL,
  "http://localhost:3000",
);

export const pollIntervalMs = readPositiveIntegerEnv(
  import.meta.env.VITE_API_POLL_INTERVAL_MS,
  5_000,
);

export async function fetchTodoSnapshot(
  signal?: AbortSignal,
): Promise<TodoListWithItems[]> {
  const lists = await requestJson("/api/todolists", parseTodoLists, signal);
  return await Promise.all(
    lists.map(async (list) => ({
      ...list,
      items: await requestJson(
        `/api/todolists/${list.id}/items`,
        parseTodoItems,
        signal,
      ),
    })),
  );
}

export async function runSync(signal?: AbortSignal): Promise<SyncSummary> {
  return await requestJson("/api/sync", parseSyncSummary, signal, {
    method: "POST",
  });
}

export function formatInterval(ms: number): string {
  if (ms % 1000 !== 0) {
    return `${ms}ms`;
  }

  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = seconds / 60;
  return `${minutes}m`;
}

async function requestJson<T>(
  path: string,
  parse: (value: unknown) => T,
  signal?: AbortSignal,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("accept", "application/json");

  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers,
    signal,
  });

  if (!response.ok) {
    throw new Error(
      `${init?.method ?? "GET"} ${path} failed: ${response.status}`,
    );
  }

  return parse(await response.json());
}

function parseTodoLists(value: unknown): TodoList[] {
  if (!Array.isArray(value)) {
    throw new Error("Expected todo list array");
  }

  return value.map(parseTodoList);
}

function parseTodoItems(value: unknown): TodoItem[] {
  if (!Array.isArray(value)) {
    throw new Error("Expected todo item array");
  }

  return value.map(parseTodoItem);
}

function parseTodoList(value: unknown): TodoList {
  const record = expectRecord(value, "todo list");
  return {
    id: expectNumber(record.id, "todo list id"),
    name: expectString(record.name, "todo list name"),
    externalId: expectNullableString(record.externalId, "todo list externalId"),
    syncStatus: expectSyncStatus(record.syncStatus, "todo list syncStatus"),
    createdAt: expectString(record.createdAt, "todo list createdAt"),
    updatedAt: expectString(record.updatedAt, "todo list updatedAt"),
  };
}

function parseTodoItem(value: unknown): TodoItem {
  const record = expectRecord(value, "todo item");
  return {
    id: expectNumber(record.id, "todo item id"),
    title: expectString(record.title, "todo item title"),
    completed: expectBoolean(record.completed, "todo item completed"),
    todoListId: expectNumber(record.todoListId, "todo item todoListId"),
    externalId: expectNullableString(record.externalId, "todo item externalId"),
    syncStatus: expectSyncStatus(record.syncStatus, "todo item syncStatus"),
    createdAt: expectString(record.createdAt, "todo item createdAt"),
    updatedAt: expectString(record.updatedAt, "todo item updatedAt"),
  };
}

function parseSyncSummary(value: unknown): SyncSummary {
  const record = expectRecord(value, "sync summary");
  const failed = record.failed;
  if (!isStringArray(failed)) {
    throw new Error("Expected sync summary failed array");
  }

  return {
    pulled: expectNumber(record.pulled, "sync pulled"),
    pushed: expectNumber(record.pushed, "sync pushed"),
    adopted: expectNumber(record.adopted, "sync adopted"),
    updated: expectNumber(record.updated, "sync updated"),
    deleted: expectNumber(record.deleted, "sync deleted"),
    unsynced: expectNumber(record.unsynced, "sync unsynced"),
    pendingRemoteCreates: expectNumber(
      record.pendingRemoteCreates,
      "sync pendingRemoteCreates",
    ),
    durationMs: expectNumber(record.durationMs, "sync durationMs"),
    failed,
  };
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Expected ${label} object`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`Expected ${label} string`);
  }

  return value;
}

function expectNullableString(value: unknown, label: string): string | null {
  if (value === null) {
    return null;
  }

  return expectString(value, label);
}

function expectNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Expected ${label} number`);
  }

  return value;
}

function expectBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Expected ${label} boolean`);
  }

  return value;
}

function expectSyncStatus(value: unknown, label: string): SyncStatus {
  if (
    value === "synced" ||
    value === "pending" ||
    value === "unsynced" ||
    value === "pending_remote_create"
  ) {
    return value;
  }

  throw new Error(`Expected ${label} sync status`);
}

function readStringEnv(value: string | undefined, fallback: string): string {
  return value === undefined || value.trim() === "" ? fallback : value;
}

function readPositiveIntegerEnv(
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
