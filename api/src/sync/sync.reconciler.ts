import { Injectable } from '@nestjs/common';
import { TodoList } from '../todo_lists/todo_list.entity';
import { TodoItem } from '../todo_items/todo_item.entity';
import { SyncStatus } from './sync-status.enum';
import { RemoteTodoList } from './domain/remote-todo-list';
import { RemoteTodoItem } from './domain/remote-todo-item';

export interface AdoptTarget {
  local: TodoList;
  remote: RemoteTodoList;
}

export interface ListPullUpdate {
  local: TodoList;
  remote: RemoteTodoList;
}

export interface ItemPullUpdate {
  item: TodoItem;
  remote: RemoteTodoItem;
}

export interface ItemPullCreate {
  list: TodoList;
  remote: RemoteTodoItem;
}

export interface RemoteItemTarget {
  listExternalId: string;
  item: TodoItem;
}

export interface SyncPlan {
  createLocal: { lists: RemoteTodoList[]; items: ItemPullCreate[] };
  createRemote: { lists: TodoList[]; items: RemoteItemTarget[] };
  adopt: { lists: AdoptTarget[]; items: ItemPullUpdate[] };
  updateRemote: { lists: TodoList[]; items: RemoteItemTarget[] };
  updateLocal: { lists: ListPullUpdate[]; items: ItemPullUpdate[] };
  deleteRemote: { lists: TodoList[]; items: RemoteItemTarget[] };
  removeLocal: { lists: TodoList[]; items: TodoItem[] };
  markSynced: { lists: TodoList[]; items: TodoItem[] };
}

@Injectable()
export class SyncReconciler {
  reconcile(locals: TodoList[], remotes: RemoteTodoList[]): SyncPlan {
    const plan = emptyPlan();
    const remoteByExternalId = new Map(remotes.map((r) => [r.externalId, r]));
    const remoteBySourceId = indexBySourceId(remotes);
    const matched = new Set<string>();

    for (const local of locals) {
      this.reconcileList(
        local,
        remoteByExternalId,
        remoteBySourceId,
        matched,
        plan,
      );
    }
    for (const remote of remotes) {
      if (!matched.has(remote.externalId)) {
        plan.createLocal.lists.push(remote);
      }
    }
    return plan;
  }

  private reconcileList(
    local: TodoList,
    byExternalId: Map<string, RemoteTodoList>,
    bySourceId: Map<string, RemoteTodoList>,
    matched: Set<string>,
    plan: SyncPlan,
  ): void {
    if (local.deletedAt !== null) {
      const remote =
        local.externalId !== null
          ? byExternalId.get(local.externalId)
          : undefined;
      if (remote) {
        matched.add(remote.externalId);
        plan.deleteRemote.lists.push(local);
      } else {
        plan.removeLocal.lists.push(local);
      }
      return;
    }

    if (local.externalId !== null) {
      const remote = byExternalId.get(local.externalId);
      if (!remote) {
        plan.removeLocal.lists.push(local);
        return;
      }
      matched.add(remote.externalId);
      this.reconcileListContent(local, remote, plan);
      this.reconcileItems(local, remote, plan);
      return;
    }

    const adopted = bySourceId.get(String(local.id));
    if (adopted) {
      matched.add(adopted.externalId);
      plan.adopt.lists.push({ local, remote: adopted });
    } else {
      plan.createRemote.lists.push(local);
    }
  }

  private reconcileListContent(
    local: TodoList,
    remote: RemoteTodoList,
    plan: SyncPlan,
  ): void {
    if (local.name !== remote.name) {
      if (localWins(local.updatedAt, remote.updatedAt)) {
        plan.updateRemote.lists.push(local);
      } else {
        plan.updateLocal.lists.push({ local, remote });
      }
    } else if (local.syncStatus !== SyncStatus.Synced) {
      plan.markSynced.lists.push(local);
    }
  }

  private reconcileItems(
    local: TodoList,
    remote: RemoteTodoList,
    plan: SyncPlan,
  ): void {
    const byExternalId = new Map(remote.items.map((i) => [i.externalId, i]));
    const bySourceId = indexItemsBySourceId(remote.items);
    const matched = new Set<string>();

    for (const item of local.items) {
      this.reconcileItem(
        item,
        remote.externalId,
        byExternalId,
        bySourceId,
        matched,
        plan,
      );
    }
    for (const remoteItem of remote.items) {
      if (!matched.has(remoteItem.externalId)) {
        plan.createLocal.items.push({ list: local, remote: remoteItem });
      }
    }
  }

  private reconcileItem(
    item: TodoItem,
    listExternalId: string,
    byExternalId: Map<string, RemoteTodoItem>,
    bySourceId: Map<string, RemoteTodoItem>,
    matched: Set<string>,
    plan: SyncPlan,
  ): void {
    if (item.deletedAt !== null) {
      const remote =
        item.externalId !== null
          ? byExternalId.get(item.externalId)
          : undefined;
      if (remote) {
        matched.add(remote.externalId);
        plan.deleteRemote.items.push({ listExternalId, item });
      } else {
        plan.removeLocal.items.push(item);
      }
      return;
    }

    if (item.externalId !== null) {
      const remote = byExternalId.get(item.externalId);
      if (!remote) {
        plan.removeLocal.items.push(item);
        return;
      }
      matched.add(remote.externalId);
      this.reconcileItemContent(item, remote, listExternalId, plan);
      return;
    }

    const adopted = bySourceId.get(String(item.id));
    if (adopted) {
      matched.add(adopted.externalId);
      plan.adopt.items.push({ item, remote: adopted });
    } else {
      plan.createRemote.items.push({ listExternalId, item });
    }
  }

  private reconcileItemContent(
    item: TodoItem,
    remote: RemoteTodoItem,
    listExternalId: string,
    plan: SyncPlan,
  ): void {
    if (item.title !== remote.title || item.completed !== remote.completed) {
      if (localWins(item.updatedAt, remote.updatedAt)) {
        plan.updateRemote.items.push({ listExternalId, item });
      } else {
        plan.updateLocal.items.push({ item, remote });
      }
    } else if (item.syncStatus !== SyncStatus.Synced) {
      plan.markSynced.items.push(item);
    }
  }
}

function localWins(local: Date, remote: Date): boolean {
  return local.getTime() >= remote.getTime();
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

function indexItemsBySourceId(
  items: RemoteTodoItem[],
): Map<string, RemoteTodoItem> {
  const index = new Map<string, RemoteTodoItem>();
  for (const item of items) {
    if (item.sourceId !== null) {
      index.set(item.sourceId, item);
    }
  }
  return index;
}

function emptyPlan(): SyncPlan {
  return {
    createLocal: { lists: [], items: [] },
    createRemote: { lists: [], items: [] },
    adopt: { lists: [], items: [] },
    updateRemote: { lists: [], items: [] },
    updateLocal: { lists: [], items: [] },
    deleteRemote: { lists: [], items: [] },
    removeLocal: { lists: [], items: [] },
    markSynced: { lists: [], items: [] },
  };
}
