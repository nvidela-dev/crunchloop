import { Injectable } from '@nestjs/common';
import { TodoList } from '../todo_lists/todo_list.entity';
import { TodoItem } from '../todo_items/todo_item.entity';
import { RemoteTodoList } from './domain/remote-todo-list';
import { RemoteTodoItem } from './domain/remote-todo-item';

export interface RemoteItemTarget {
  listExternalId: string;
  item: TodoItem;
}

export interface AdoptTarget {
  local: TodoList;
  remote: RemoteTodoList;
}

export interface SyncPlan {
  pullLists: RemoteTodoList[];
  pushLists: TodoList[];
  adoptLists: AdoptTarget[];
  pushItems: RemoteItemTarget[];
}

@Injectable()
export class SyncReconciler {
  reconcile(locals: TodoList[], remotes: RemoteTodoList[]): SyncPlan {
    const remoteByExternalId = new Map(remotes.map((r) => [r.externalId, r]));
    const remoteBySourceId = indexBySourceId(remotes);
    const matchedRemoteIds = new Set<string>();

    const pushLists: TodoList[] = [];
    const adoptLists: AdoptTarget[] = [];
    const pushItems: RemoteItemTarget[] = [];

    for (const local of locals) {
      if (local.externalId !== null) {
        const remote = remoteByExternalId.get(local.externalId);
        if (remote) {
          matchedRemoteIds.add(remote.externalId);
          this.collectNewItems(local, remote, pushItems);
        }
        continue;
      }

      const remote = remoteBySourceId.get(String(local.id));
      if (remote) {
        matchedRemoteIds.add(remote.externalId);
        adoptLists.push({ local, remote });
      } else {
        pushLists.push(local);
      }
    }

    const pullLists = remotes.filter((r) => !matchedRemoteIds.has(r.externalId));
    return { pullLists, pushLists, adoptLists, pushItems };
  }

  private collectNewItems(
    local: TodoList,
    remote: RemoteTodoList,
    pushItems: RemoteItemTarget[],
  ): void {
    const remoteSourceIds = collectSourceIds(remote.items);
    for (const item of local.items) {
      if (item.externalId !== null) {
        continue;
      }
      if (remoteSourceIds.has(String(item.id))) {
        continue;
      }
      pushItems.push({ listExternalId: remote.externalId, item });
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
