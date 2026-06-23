import { RemoteTodoList, RemoteTodoListDraft } from '../domain/remote-todo-list';
import { RemoteTodoItem, RemoteTodoItemDraft } from '../domain/remote-todo-item';

export interface ExternalItemPayload {
  source_id: string;
  description: string;
  completed: boolean;
}

export interface ExternalListPayload {
  source_id: string;
  name: string;
  items: ExternalItemPayload[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== 'string') {
    throw new TypeError(`Expected "${field}" to be a string`);
  }
  return value;
}

function readNullableString(
  record: Record<string, unknown>,
  field: string,
): string | null {
  const value = record[field];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new TypeError(`Expected "${field}" to be a string or null`);
  }
  return value;
}

function readBoolean(record: Record<string, unknown>, field: string): boolean {
  const value = record[field];
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  throw new TypeError(`Expected "${field}" to be a boolean`);
}

function readDate(record: Record<string, unknown>, field: string): Date {
  const parsed = new Date(readString(record, field));
  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError(`Expected "${field}" to be an ISO date`);
  }
  return parsed;
}

function parseRemoteItem(value: unknown): RemoteTodoItem {
  if (!isRecord(value)) {
    throw new TypeError('Expected a remote item object');
  }
  return {
    externalId: readString(value, 'id'),
    sourceId: readNullableString(value, 'source_id'),
    title: readString(value, 'description'),
    completed: readBoolean(value, 'completed'),
    updatedAt: readDate(value, 'updated_at'),
  };
}

export function parseRemoteList(value: unknown): RemoteTodoList {
  if (!isRecord(value)) {
    throw new TypeError('Expected a remote list object');
  }
  const items = value['items'];
  if (!Array.isArray(items)) {
    throw new TypeError('Expected "items" to be an array');
  }
  return {
    externalId: readString(value, 'id'),
    sourceId: readNullableString(value, 'source_id'),
    name: readString(value, 'name'),
    updatedAt: readDate(value, 'updated_at'),
    items: items.map(parseRemoteItem),
  };
}

export function parseRemoteLists(value: unknown): RemoteTodoList[] {
  if (!Array.isArray(value)) {
    throw new TypeError('Expected an array of remote lists');
  }
  return value.map(parseRemoteList);
}

export function toItemPayload(
  draft: RemoteTodoItemDraft,
): ExternalItemPayload {
  return {
    source_id: draft.sourceId,
    description: draft.title,
    completed: draft.completed,
  };
}

export function toListPayload(
  draft: RemoteTodoListDraft,
): ExternalListPayload {
  return {
    source_id: draft.sourceId,
    name: draft.name,
    items: draft.items.map(toItemPayload),
  };
}
