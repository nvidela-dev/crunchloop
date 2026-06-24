import { z } from 'zod';
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

const remoteItemSchema = z
  .object({
    id: z.string(),
    source_id: z.string().nullable(),
    description: z.string(),
    completed: z
      .union([z.boolean(), z.number()])
      .transform((value) => (typeof value === 'boolean' ? value : value !== 0)),
    updated_at: z.coerce.date(),
  })
  .transform(
    (wire): RemoteTodoItem => ({
      externalId: wire.id,
      sourceId: wire.source_id,
      title: wire.description,
      completed: wire.completed,
      updatedAt: wire.updated_at,
    }),
  );

const remoteListSchema = z
  .object({
    id: z.string(),
    source_id: z.string().nullable(),
    name: z.string(),
    updated_at: z.coerce.date(),
    items: z.array(remoteItemSchema),
  })
  .transform(
    (wire): RemoteTodoList => ({
      externalId: wire.id,
      sourceId: wire.source_id,
      name: wire.name,
      updatedAt: wire.updated_at,
      items: wire.items,
    }),
  );

export function parseRemoteList(value: unknown): RemoteTodoList {
  return remoteListSchema.parse(value);
}

export function parseRemoteLists(value: unknown): RemoteTodoList[] {
  return z.array(remoteListSchema).parse(value);
}

export function toItemPayload(draft: RemoteTodoItemDraft): ExternalItemPayload {
  return {
    source_id: draft.sourceId,
    description: draft.title,
    completed: draft.completed,
  };
}

export function toListPayload(draft: RemoteTodoListDraft): ExternalListPayload {
  return {
    source_id: draft.sourceId,
    name: draft.name,
    items: draft.items.map(toItemPayload),
  };
}
