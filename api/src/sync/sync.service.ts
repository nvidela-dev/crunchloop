import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TodoList } from '../todo_lists/todo_list.entity';
import { TodoItem } from '../todo_items/todo_item.entity';
import { RemoteTodoGateway } from './remote-todo.gateway';
import {
  SyncReconciler,
  SyncPlan,
  ListPullUpdate,
  ItemPullUpdate,
  ItemPullCreate,
  RemoteItemTarget,
} from './sync.reconciler';
import { SyncStatus } from './sync-status.enum';
import { RemoteTodoList } from './domain/remote-todo-list';
import { RemoteTodoItem } from './domain/remote-todo-item';
import { UnsupportedRemoteOperationError } from './external/unsupported-remote-operation.error';

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

type SyncSummaryWithoutDuration = Omit<SyncSummary, 'durationMs'>;

function emptySummary(failed: string[]): SyncSummaryWithoutDuration {
  return {
    pulled: 0,
    pushed: 0,
    adopted: 0,
    updated: 0,
    deleted: 0,
    unsynced: 0,
    pendingRemoteCreates: 0,
    failed,
  };
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private readonly scheduleEnabled = process.env.SYNC_CRON_ENABLED !== 'false';
  private running = false;

  constructor(
    private readonly remote: RemoteTodoGateway,
    private readonly reconciler: SyncReconciler,
    @InjectRepository(TodoList)
    private readonly todoListRepository: Repository<TodoList>,
    @InjectRepository(TodoItem)
    private readonly todoItemRepository: Repository<TodoItem>,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async scheduledSync(): Promise<void> {
    if (!this.scheduleEnabled) {
      return;
    }
    const s = await this.run();
    this.logger.log(
      `sync: pulled=${s.pulled} pushed=${s.pushed} adopted=${s.adopted} ` +
        `updated=${s.updated} deleted=${s.deleted} unsynced=${s.unsynced} ` +
        `pendingRemoteCreates=${s.pendingRemoteCreates} ` +
        `failed=${s.failed.length} durationMs=${s.durationMs}`,
    );
  }

  async run(): Promise<SyncSummary> {
    const startedAt = Date.now();
    if (this.running) {
      return withDuration(emptySummary(['already running']), startedAt);
    }
    this.running = true;
    try {
      return await this.reconcileOnce(startedAt);
    } finally {
      this.running = false;
    }
  }

  private async reconcileOnce(startedAt: number): Promise<SyncSummary> {
    const locals = await this.todoListRepository.find({
      relations: { items: true },
      withDeleted: true,
    });

    let remotes: RemoteTodoList[];
    try {
      remotes = await this.remote.fetchAll();
    } catch (error) {
      return withDuration(emptySummary([describe(error)]), startedAt);
    }

    const plan = this.reconciler.reconcile(locals, remotes);
    const failed: string[] = [];

    const pulled = await this.applyCreateLocal(plan);
    const pushed = await this.applyPushLists(plan.createRemote.lists, failed);
    const pendingItems = await this.applyPushItems(
      plan.createRemote.items,
      failed,
    );
    const adopted = await this.applyAdopt(plan, failed);
    const updated = await this.applyUpdates(plan, failed);
    const deleted = await this.applyDeletes(plan, failed);
    await this.applyMarkSynced(plan);

    return withDuration(
      {
        pulled,
        pushed,
        adopted,
        updated,
        deleted,
        unsynced: pendingItems.unsynced,
        pendingRemoteCreates: pendingItems.pendingRemoteCreates,
        failed,
      },
      startedAt,
    );
  }

  private async applyCreateLocal(plan: SyncPlan): Promise<number> {
    for (const remote of plan.createLocal.lists) {
      const list = await this.todoListRepository.save(
        this.todoListRepository.create({
          name: remote.name,
          externalId: remote.externalId,
          syncStatus: SyncStatus.Synced,
        }),
      );
      await this.createLocalItems(
        remote.items.map((remoteItem) => ({ list, remote: remoteItem })),
      );
    }
    await this.createLocalItems(plan.createLocal.items);
    return plan.createLocal.lists.length + plan.createLocal.items.length;
  }

  private async createLocalItems(targets: ItemPullCreate[]): Promise<void> {
    const items = targets.map(({ list, remote }) =>
      this.todoItemRepository.create({
        title: remote.title,
        completed: remote.completed,
        todoListId: list.id,
        externalId: remote.externalId,
        syncStatus: SyncStatus.Synced,
      }),
    );
    await this.todoItemRepository.save(items);
  }

  private async applyPushLists(
    lists: TodoList[],
    failed: string[],
  ): Promise<number> {
    let pushed = 0;
    for (const local of lists) {
      try {
        const remote = await this.remote.createList({
          sourceId: String(local.id),
          name: local.name,
          items: local.items.map((item) => ({
            sourceId: String(item.id),
            title: item.title,
            completed: item.completed,
          })),
        });
        await this.adoptRemoteList(local, remote);
        pushed += 1;
      } catch (error) {
        failed.push(`push list ${local.id}: ${describe(error)}`);
      }
    }
    return pushed;
  }

  private async applyPushItems(
    targets: RemoteItemTarget[],
    failed: string[],
  ): Promise<{ unsynced: number; pendingRemoteCreates: number }> {
    let unsynced = 0;
    let pendingRemoteCreates = 0;
    const touched: TodoItem[] = [];
    for (const { listExternalId, item } of targets) {
      const previousStatus = item.syncStatus;
      try {
        const remote = await this.remote.createItem(listExternalId, {
          sourceId: String(item.id),
          title: item.title,
          completed: item.completed,
        });
        item.externalId = remote.externalId;
        item.syncStatus = SyncStatus.Synced;
      } catch (error) {
        item.syncStatus =
          error instanceof UnsupportedRemoteOperationError
            ? SyncStatus.PendingRemoteCreate
            : SyncStatus.Unsynced;
        unsynced += 1;
        if (error instanceof UnsupportedRemoteOperationError) {
          pendingRemoteCreates += 1;
        }
        if (!(error instanceof UnsupportedRemoteOperationError)) {
          failed.push(`push item ${item.id}: ${describe(error)}`);
        }
      }
      if (item.syncStatus !== previousStatus) {
        touched.push(item);
      }
    }
    await this.todoItemRepository.save(touched);
    return { unsynced, pendingRemoteCreates };
  }

  private async applyAdopt(plan: SyncPlan, failed: string[]): Promise<number> {
    let adopted = 0;
    for (const { local, remote } of plan.adopt.lists) {
      try {
        await this.adoptRemoteList(local, remote);
        adopted += 1;
      } catch (error) {
        failed.push(`adopt list ${local.id}: ${describe(error)}`);
      }
    }
    const items = plan.adopt.items.map(({ item, remote }) => {
      item.externalId = remote.externalId;
      item.syncStatus = SyncStatus.Synced;
      return item;
    });
    await this.todoItemRepository.save(items);
    return adopted + items.length;
  }
  private async applyUpdates(
    plan: SyncPlan,
    failed: string[],
  ): Promise<number> {
    let updated = 0;
    updated += await this.pushListUpdates(plan.updateRemote.lists, failed);
    updated += await this.pushItemUpdates(plan.updateRemote.items, failed);
    updated += await this.pullListUpdates(plan.updateLocal.lists);
    updated += await this.pullItemUpdates(plan.updateLocal.items);
    return updated;
  }

  private async pushListUpdates(
    lists: TodoList[],
    failed: string[],
  ): Promise<number> {
    let count = 0;
    for (const local of lists) {
      if (local.externalId === null) {
        continue;
      }
      try {
        await this.remote.updateList(local.externalId, { name: local.name });
        local.syncStatus = SyncStatus.Synced;
        await this.todoListRepository.save(local);
        count += 1;
      } catch (error) {
        failed.push(`update list ${local.id}: ${describe(error)}`);
      }
    }
    return count;
  }

  private async pushItemUpdates(
    targets: RemoteItemTarget[],
    failed: string[],
  ): Promise<number> {
    let count = 0;
    for (const { listExternalId, item } of targets) {
      if (item.externalId === null) {
        continue;
      }
      try {
        await this.remote.updateItem(listExternalId, item.externalId, {
          title: item.title,
          completed: item.completed,
        });
        item.syncStatus = SyncStatus.Synced;
        await this.todoItemRepository.save(item);
        count += 1;
      } catch (error) {
        failed.push(`update item ${item.id}: ${describe(error)}`);
      }
    }
    return count;
  }

  private async pullListUpdates(updates: ListPullUpdate[]): Promise<number> {
    const lists = updates.map(({ local, remote }) => {
      local.name = remote.name;
      local.syncStatus = SyncStatus.Synced;
      return local;
    });
    await this.todoListRepository.save(lists);
    return lists.length;
  }

  private async pullItemUpdates(updates: ItemPullUpdate[]): Promise<number> {
    const items = updates.map(({ item, remote }) => {
      item.title = remote.title;
      item.completed = remote.completed;
      item.syncStatus = SyncStatus.Synced;
      return item;
    });
    await this.todoItemRepository.save(items);
    return items.length;
  }

  private async applyDeletes(
    plan: SyncPlan,
    failed: string[],
  ): Promise<number> {
    let deleted = 0;
    deleted += await this.deleteRemoteItems(plan.deleteRemote.items, failed);
    deleted += await this.deleteRemoteLists(plan.deleteRemote.lists, failed);
    deleted += await this.removeLocalItems(plan.removeLocal.items);
    deleted += await this.removeLocalLists(plan.removeLocal.lists);
    return deleted;
  }

  private async deleteRemoteLists(
    lists: TodoList[],
    failed: string[],
  ): Promise<number> {
    let count = 0;
    for (const local of lists) {
      if (local.externalId === null) {
        continue;
      }
      try {
        await this.remote.deleteList(local.externalId);
        await this.todoListRepository.delete(local.id);
        count += 1;
      } catch (error) {
        failed.push(`delete list ${local.id}: ${describe(error)}`);
      }
    }
    return count;
  }

  private async deleteRemoteItems(
    targets: RemoteItemTarget[],
    failed: string[],
  ): Promise<number> {
    let count = 0;
    for (const { listExternalId, item } of targets) {
      if (item.externalId === null) {
        continue;
      }
      try {
        await this.remote.deleteItem(listExternalId, item.externalId);
        await this.todoItemRepository.delete(item.id);
        count += 1;
      } catch (error) {
        failed.push(`delete item ${item.id}: ${describe(error)}`);
      }
    }
    return count;
  }

  private async removeLocalLists(lists: TodoList[]): Promise<number> {
    for (const local of lists) {
      await this.todoListRepository.delete(local.id);
    }
    return lists.length;
  }

  private async removeLocalItems(items: TodoItem[]): Promise<number> {
    for (const item of items) {
      await this.todoItemRepository.delete(item.id);
    }
    return items.length;
  }

  private async applyMarkSynced(plan: SyncPlan): Promise<void> {
    for (const list of plan.markSynced.lists) {
      list.syncStatus = SyncStatus.Synced;
    }
    await this.todoListRepository.save(plan.markSynced.lists);
    for (const item of plan.markSynced.items) {
      item.syncStatus = SyncStatus.Synced;
    }
    await this.todoItemRepository.save(plan.markSynced.items);
  }

  private async adoptRemoteList(
    local: TodoList,
    remote: RemoteTodoList,
  ): Promise<void> {
    local.externalId = remote.externalId;
    local.syncStatus = SyncStatus.Synced;
    await this.todoListRepository.save(local);

    const remoteItemsBySourceId = indexRemoteItemsBySourceId(remote.items);
    for (const item of local.items) {
      const match = remoteItemsBySourceId.get(String(item.id));
      if (match) {
        item.externalId = match.externalId;
        item.syncStatus = SyncStatus.Synced;
      } else {
        item.syncStatus = SyncStatus.PendingRemoteCreate;
      }
    }
    await this.todoItemRepository.save(local.items);
  }
}

function indexRemoteItemsBySourceId(
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

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withDuration(
  summary: SyncSummaryWithoutDuration,
  startedAt: number,
): SyncSummary {
  return { ...summary, durationMs: Date.now() - startedAt };
}
