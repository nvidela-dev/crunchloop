import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SyncService } from './sync.service';
import { SyncReconciler } from './sync.reconciler';
import { RemoteTodoGateway } from './remote-todo.gateway';
import { TodoList } from '../todo_lists/todo_list.entity';
import { TodoItem } from '../todo_items/todo_item.entity';
import { SyncStatus } from './sync-status.enum';
import {
  RemoteTodoList,
  RemoteTodoListDraft,
  RemoteTodoListPatch,
} from './domain/remote-todo-list';
import {
  RemoteTodoItem,
  RemoteTodoItemDraft,
  RemoteTodoItemPatch,
} from './domain/remote-todo-item';
import { UnsupportedRemoteOperationError } from './external/unsupported-remote-operation.error';

const OLD = new Date(1000);
const NEW = new Date(2000);

class FakeRemoteTodoGateway extends RemoteTodoGateway {
  remotes: RemoteTodoList[] = [];
  createdLists: RemoteTodoListDraft[] = [];
  updatedLists: { externalId: string; patch: RemoteTodoListPatch }[] = [];
  deletedLists: string[] = [];
  updatedItems: {
    listExternalId: string;
    itemExternalId: string;
    patch: RemoteTodoItemPatch;
  }[] = [];
  deletedItems: { listExternalId: string; itemExternalId: string }[] = [];

  fetchAll(): Promise<RemoteTodoList[]> {
    return Promise.resolve(this.remotes);
  }

  createList(draft: RemoteTodoListDraft): Promise<RemoteTodoList> {
    this.createdLists.push(draft);
    return Promise.resolve({
      externalId: `ext-${draft.sourceId}`,
      sourceId: draft.sourceId,
      name: draft.name,
      updatedAt: NEW,
      items: draft.items.map((item) => ({
        externalId: `ext-${item.sourceId}`,
        sourceId: item.sourceId,
        title: item.title,
        completed: item.completed,
        updatedAt: NEW,
      })),
    });
  }

  updateList(
    externalId: string,
    patch: RemoteTodoListPatch,
  ): Promise<RemoteTodoList> {
    this.updatedLists.push({ externalId, patch });
    return Promise.resolve({
      externalId,
      sourceId: null,
      name: patch.name,
      updatedAt: NEW,
      items: [],
    });
  }

  deleteList(externalId: string): Promise<void> {
    this.deletedLists.push(externalId);
    return Promise.resolve();
  }

  createItem(
    listExternalId: string,
    draft: RemoteTodoItemDraft,
  ): Promise<RemoteTodoItem> {
    return Promise.reject(
      new UnsupportedRemoteOperationError(
        `createItem(${listExternalId}, ${draft.sourceId})`,
      ),
    );
  }

  updateItem(
    listExternalId: string,
    itemExternalId: string,
    patch: RemoteTodoItemPatch,
  ): Promise<RemoteTodoItem> {
    this.updatedItems.push({ listExternalId, itemExternalId, patch });
    return Promise.resolve({
      externalId: itemExternalId,
      sourceId: null,
      title: patch.title,
      completed: patch.completed,
      updatedAt: NEW,
    });
  }

  deleteItem(listExternalId: string, itemExternalId: string): Promise<void> {
    this.deletedItems.push({ listExternalId, itemExternalId });
    return Promise.resolve();
  }
}

function makeList(partial: Partial<TodoList>): TodoList {
  return Object.assign(new TodoList(), {
    items: [],
    externalId: null,
    name: 'list',
    syncStatus: SyncStatus.Synced,
    updatedAt: OLD,
    deletedAt: null,
    ...partial,
  });
}

function makeItem(partial: Partial<TodoItem>): TodoItem {
  return Object.assign(new TodoItem(), {
    externalId: null,
    title: 'item',
    completed: false,
    syncStatus: SyncStatus.Synced,
    updatedAt: OLD,
    deletedAt: null,
    ...partial,
  });
}

function remoteList(
  partial: Partial<RemoteTodoList> & Pick<RemoteTodoList, 'externalId'>,
): RemoteTodoList {
  return {
    sourceId: null,
    name: 'list',
    updatedAt: OLD,
    items: [],
    ...partial,
  };
}

function remoteItem(
  partial: Partial<RemoteTodoItem> & Pick<RemoteTodoItem, 'externalId'>,
): RemoteTodoItem {
  return {
    sourceId: null,
    title: 'item',
    completed: false,
    updatedAt: OLD,
    ...partial,
  };
}

function repositoryMock(find: jest.Mock): Record<string, jest.Mock> {
  return {
    find,
    create: jest.fn((input: unknown) => input),
    save: jest.fn((input: unknown) => Promise.resolve(input)),
    delete: jest.fn(() => Promise.resolve({ affected: 1 })),
  };
}

async function buildService(
  gateway: FakeRemoteTodoGateway,
  locals: TodoList[],
): Promise<{
  service: SyncService;
  listRepo: Record<string, jest.Mock>;
  itemRepo: Record<string, jest.Mock>;
}> {
  const listRepo = repositoryMock(jest.fn().mockResolvedValue(locals));
  const itemRepo = repositoryMock(jest.fn().mockResolvedValue([]));

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      SyncService,
      SyncReconciler,
      { provide: RemoteTodoGateway, useValue: gateway },
      { provide: getRepositoryToken(TodoList), useValue: listRepo },
      { provide: getRepositoryToken(TodoItem), useValue: itemRepo },
    ],
  }).compile();

  return { service: module.get<SyncService>(SyncService), listRepo, itemRepo };
}

describe('SyncService', () => {
  it('pushes a local-only list through the gateway and marks it synced', async () => {
    const gateway = new FakeRemoteTodoGateway();
    const item = makeItem({
      id: 2,
      title: 'Buy milk',
      syncStatus: SyncStatus.Pending,
    });
    const list = makeList({
      id: 1,
      name: 'Groceries',
      items: [item],
      syncStatus: SyncStatus.Pending,
    });

    const { service } = await buildService(gateway, [list]);
    const summary = await service.run();

    expect(summary.pushed).toBe(1);
    expect(gateway.createdLists[0].sourceId).toBe('1');
    expect(list.externalId).toBe('ext-1');
    expect(list.syncStatus).toBe(SyncStatus.Synced);
    expect(item.externalId).toBe('ext-2');
    expect(item.syncStatus).toBe(SyncStatus.Synced);
  });

  it('flags a local item as pending remote create when the connector cannot create it', async () => {
    const gateway = new FakeRemoteTodoGateway();
    gateway.remotes = [remoteList({ externalId: 'R1', name: 'Groceries' })];
    const newItem = makeItem({
      id: 5,
      externalId: null,
      syncStatus: SyncStatus.Pending,
    });
    const list = makeList({
      id: 1,
      externalId: 'R1',
      name: 'Groceries',
      items: [newItem],
    });

    const { service } = await buildService(gateway, [list]);
    const summary = await service.run();

    expect(summary.unsynced).toBe(1);
    expect(summary.pendingRemoteCreates).toBe(1);
    expect(summary.failed).toEqual([]);
    expect(newItem.syncStatus).toBe(SyncStatus.PendingRemoteCreate);
  });

  it('adopts a source-id match by backfilling external ids', async () => {
    const gateway = new FakeRemoteTodoGateway();
    gateway.remotes = [
      remoteList({
        externalId: 'R7',
        sourceId: '1',
        name: 'Groceries',
        items: [remoteItem({ externalId: 'RI7', sourceId: '2' })],
      }),
    ];
    const item = makeItem({ id: 2 });
    const list = makeList({
      id: 1,
      externalId: null,
      name: 'Groceries',
      items: [item],
    });

    const { service } = await buildService(gateway, [list]);
    const summary = await service.run();

    expect(summary.adopted).toBe(1);
    expect(list.externalId).toBe('R7');
    expect(item.externalId).toBe('RI7');
    expect(item.syncStatus).toBe(SyncStatus.Synced);
  });

  it('pushes a newer local item edit to the remote', async () => {
    const gateway = new FakeRemoteTodoGateway();
    gateway.remotes = [
      remoteList({
        externalId: 'R1',
        name: 'Groceries',
        items: [
          remoteItem({
            externalId: 'RI1',
            title: 'old',
            completed: false,
            updatedAt: OLD,
          }),
        ],
      }),
    ];
    const item = makeItem({
      id: 5,
      externalId: 'RI1',
      title: 'new title',
      completed: true,
      updatedAt: NEW,
      syncStatus: SyncStatus.Pending,
    });
    const list = makeList({
      id: 1,
      externalId: 'R1',
      name: 'Groceries',
      items: [item],
    });

    const { service } = await buildService(gateway, [list]);
    const summary = await service.run();

    expect(gateway.updatedItems).toHaveLength(1);
    expect(gateway.updatedItems[0].patch).toEqual({
      title: 'new title',
      completed: true,
    });
    expect(item.syncStatus).toBe(SyncStatus.Synced);
    expect(summary.updated).toBe(1);
  });

  it('pulls a newer remote item edit into the local row', async () => {
    const gateway = new FakeRemoteTodoGateway();
    gateway.remotes = [
      remoteList({
        externalId: 'R1',
        name: 'Groceries',
        items: [
          remoteItem({
            externalId: 'RI1',
            title: 'remote new',
            completed: true,
            updatedAt: NEW,
          }),
        ],
      }),
    ];
    const item = makeItem({
      id: 5,
      externalId: 'RI1',
      title: 'local old',
      completed: false,
      updatedAt: OLD,
    });
    const list = makeList({
      id: 1,
      externalId: 'R1',
      name: 'Groceries',
      items: [item],
    });

    const { service } = await buildService(gateway, [list]);
    const summary = await service.run();

    expect(gateway.updatedItems).toHaveLength(0);
    expect(item.title).toBe('remote new');
    expect(item.completed).toBe(true);
    expect(item.syncStatus).toBe(SyncStatus.Synced);
    expect(summary.updated).toBe(1);
  });

  it('propagates a local soft-delete to the remote and purges locally', async () => {
    const gateway = new FakeRemoteTodoGateway();
    gateway.remotes = [remoteList({ externalId: 'R1', name: 'Groceries' })];
    const list = makeList({
      id: 1,
      externalId: 'R1',
      name: 'Groceries',
      deletedAt: new Date(),
    });

    const { service, listRepo } = await buildService(gateway, [list]);
    const summary = await service.run();

    expect(gateway.deletedLists).toEqual(['R1']);
    expect(listRepo.delete).toHaveBeenCalledWith(1);
    expect(summary.deleted).toBe(1);
  });

  it('creates a local copy of a remote-only item on a matched list', async () => {
    const gateway = new FakeRemoteTodoGateway();
    gateway.remotes = [
      remoteList({
        externalId: 'R1',
        name: 'Groceries',
        items: [remoteItem({ externalId: 'RI9', title: 'from remote' })],
      }),
    ];
    const list = makeList({
      id: 1,
      externalId: 'R1',
      name: 'Groceries',
      items: [],
    });

    const { service, itemRepo } = await buildService(gateway, [list]);
    const summary = await service.run();

    expect(itemRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'from remote',
        externalId: 'RI9',
        todoListId: 1,
        syncStatus: SyncStatus.Synced,
      }),
    );
    expect(summary.pulled).toBe(1);
  });

  describe('scheduled sync timing', () => {
    const originalCronEnabled = process.env.SYNC_CRON_ENABLED;
    const originalInterval = process.env.SYNC_INTERVAL_MS;

    afterEach(() => {
      restoreEnv('SYNC_CRON_ENABLED', originalCronEnabled);
      restoreEnv('SYNC_INTERVAL_MS', originalInterval);
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    it('uses a one-minute interval by default', async () => {
      delete process.env.SYNC_CRON_ENABLED;
      delete process.env.SYNC_INTERVAL_MS;
      jest.useFakeTimers();
      const setIntervalSpy = jest.spyOn(globalThis, 'setInterval');
      const gateway = new FakeRemoteTodoGateway();
      const { service } = await buildService(gateway, []);

      service.onModuleInit();

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);
      service.onModuleDestroy();
    });

    it('uses the configured sync interval', async () => {
      delete process.env.SYNC_CRON_ENABLED;
      process.env.SYNC_INTERVAL_MS = '12345';
      jest.useFakeTimers();
      const setIntervalSpy = jest.spyOn(globalThis, 'setInterval');
      const gateway = new FakeRemoteTodoGateway();
      const { service } = await buildService(gateway, []);

      service.onModuleInit();

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 12_345);
      service.onModuleDestroy();
    });

    it('does not schedule when cron is disabled', async () => {
      process.env.SYNC_CRON_ENABLED = 'false';
      process.env.SYNC_INTERVAL_MS = '12345';
      jest.useFakeTimers();
      const setIntervalSpy = jest.spyOn(globalThis, 'setInterval');
      const gateway = new FakeRemoteTodoGateway();
      const { service } = await buildService(gateway, []);

      service.onModuleInit();

      expect(setIntervalSpy).not.toHaveBeenCalled();
    });
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
