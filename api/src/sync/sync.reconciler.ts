import { Injectable } from '@nestjs/common';
import { TodoList } from '../todo_lists/todo_list.entity';
import { TodoItem } from '../todo_items/todo_item.entity';
import { RemoteTodoList } from './domain/remote-todo-list';
import { RemoteTodoItem } from './domain/remote-todo-item';

export interface RemoteItemTarget {
  listExternalId: string;
  item: TodoItem;
}

export interface SyncPlan {
  pullLists: RemoteTodoList[];
  pushLists: TodoList[];
  pushItems: RemoteItemTarget[];
  syncedLists: TodoList[];
  syncedItems: TodoItem[];
}

@Injectable()
export class SyncReconciler {
  reconcile(locals: TodoList[], remotes: RemoteTodoList[]): SyncPlan {
    const remoteByExternalId = new Map(remotes.map((r) => [r.externalId, r]));
    const remoteBySourceId = indexBySourceId(remotes);
    const matchedRemoteIds = new Set<string>();

    const pushLists: TodoList[] = [];
    const pushItems: RemoteItemTarget[] = [];
    const syncedLists: TodoList[] = [];
    const syncedItems: TodoItem[] = [];

    for (const local of locals) {
      const remote = this.matchList(local, remoteByExternalId, remoteBySourceId);
      if (remote === null) {
        pushLists.push(local);
        continue;
      }
      matchedRemoteIds.add(remote.externalId);
      syncedLists.push(local);
      this.partitionItems(local, remote, syncedItems, pushItems);
    }

    const pullLists = remotes.filter((r) => !matchedRemoteIds.has(r.externalId));
    return { pullLists, pushLists, pushItems, syncedLists, syncedItems };
  }

  private matchList(
    local: TodoList,
    byExternalId: Map<string, RemoteTodoList>,
    bySourceId: Map<string, RemoteTodoList>,
  ): RemoteTodoList | null {
    if (local.externalId !== null) {
      return byExternalId.get(local.externalId) ?? null;
    }
    return bySourceId.get(String(local.id)) ?? null;
  }

  private partitionItems(
    local: TodoList,
    remote: RemoteTodoList,
    synced: TodoItem[],
    toPush: RemoteItemTarget[],
  ): void {
    const remoteItemExternalIds = new Set(
      remote.items.map((item) => item.externalId),
    );
    const remoteItemSourceIds = collectSourceIds(remote.items);

    for (const item of local.items) {
      if (matchesRemoteItem(item, remoteItemExternalIds, remoteItemSourceIds)) {
        synced.push(item);
      } else {
        toPush.push({ listExternalId: remote.externalId, item });
      }
    }
  }
}

function indexBySourceId(
  remotes: RemoteTodoList[],
): Map<string, RemoteTodoList> {
  const index = new Map<string, RemoteTodoList>();
  for (const remote of remotes) {
    if (remote.sourceId !== null) {
      index.set(remote.sourceId, remote);
    }
  }
  return index;
}

function collectSourceIds(items: RemoteTodoItem[]): Set<string> {
  const sourceIds = new Set<string>();
  for (const item of items) {
    if (item.sourceId !== null) {
      sourceIds.add(item.sourceId);
    }
  }
  return sourceIds;
}

function matchesRemoteItem(
  item: TodoItem,
  remoteExternalIds: Set<string>,
  remoteSourceIds: Set<string>,
): boolean {
  if (item.externalId !== null) {
    return remoteExternalIds.has(item.externalId);
  }
  return remoteSourceIds.has(String(item.id));
}
