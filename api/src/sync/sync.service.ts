import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TodoList } from '../todo_lists/todo_list.entity';
import { TodoItem } from '../todo_items/todo_item.entity';
import { RemoteTodoGateway } from './remote-todo.gateway';
import { SyncReconciler, RemoteItemTarget } from './sync.reconciler';
import { SyncStatus } from './sync-status.enum';
import { RemoteTodoList } from './domain/remote-todo-list';
import { RemoteTodoItem } from './domain/remote-todo-item';
import { UnsupportedRemoteOperationError } from './external/unsupported-remote-operation.error';

export interface SyncSummary {
  pulled: number;
  pushed: number;
  unsynced: number;
  failed: string[];
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
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
    const summary = await this.run();
    this.logger.log(
      `sync: pulled=${summary.pulled} pushed=${summary.pushed} ` +
        `unsynced=${summary.unsynced} failed=${summary.failed.length}`,
    );
  }

  async run(): Promise<SyncSummary> {
    if (this.running) {
      return { pulled: 0, pushed: 0, unsynced: 0, failed: ['already running'] };
    }
    this.running = true;
    try {
      return await this.reconcileOnce();
    } finally {
      this.running = false;
    }
  }

  private async reconcileOnce(): Promise<SyncSummary> {
    const locals = await this.todoListRepository.find({
      relations: { items: true },
    });

    let remotes: RemoteTodoList[];
    try {
      remotes = await this.remote.fetchAll();
    } catch (error) {
      return { pulled: 0, pushed: 0, unsynced: 0, failed: [describe(error)] };
    }

    const plan = this.reconciler.reconcile(locals, remotes);
    const failed: string[] = [];

    const pulled = await this.pullLists(plan.pullLists);
    const pushed = await this.pushLists(plan.pushLists, failed);
    const unsynced = await this.pushItems(plan.pushItems, failed);
    await this.markSynced(this.todoListRepository, plan.syncedLists);
    await this.markSynced(this.todoItemRepository, plan.syncedItems);

    return { pulled, pushed, unsynced, failed };
  }

  private async pullLists(lists: RemoteTodoList[]): Promise<number> {
    for (const remote of lists) {
      const list = await this.todoListRepository.save(
        this.todoListRepository.create({
          name: remote.name,
          externalId: remote.externalId,
          syncStatus: SyncStatus.Synced,
        }),
      );
      const items = remote.items.map((item) =>
        this.todoItemRepository.create({
          title: item.title,
          description: '',
          completed: item.completed,
          todoListId: list.id,
          externalId: item.externalId,
          syncStatus: SyncStatus.Synced,
        }),
      );
      await this.todoItemRepository.save(items);
    }
    return lists.length;
  }

  private async pushLists(lists: TodoList[], failed: string[]): Promise<number> {
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
        item.syncStatus = SyncStatus.Unsynced;
      }
    }
    await this.todoItemRepository.save(local.items);
  }

  private async pushItems(
    targets: RemoteItemTarget[],
    failed: string[],
  ): Promise<number> {
    let unsynced = 0;
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
        item.syncStatus = SyncStatus.Unsynced;
        unsynced += 1;
        if (!(error instanceof UnsupportedRemoteOperationError)) {
          failed.push(`push item ${item.id}: ${describe(error)}`);
        }
      }
      if (item.syncStatus !== previousStatus) {
        touched.push(item);
      }
    }
    await this.todoItemRepository.save(touched);
    return unsynced;
  }

  private async markSynced<T extends TodoList | TodoItem>(
    repository: Repository<T>,
    rows: T[],
  ): Promise<void> {
    const changed = rows.filter((row) => row.syncStatus !== SyncStatus.Synced);
    for (const row of changed) {
      row.syncStatus = SyncStatus.Synced;
    }
    await repository.save(changed);
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
