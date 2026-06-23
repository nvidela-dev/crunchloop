import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SyncService } from './sync.service';
import { SyncReconciler } from './sync.reconciler';
import { RemoteTodoGateway } from './remote-todo.gateway';
import { TodoList } from '../todo_lists/todo_list.entity';
import { TodoItem } from '../todo_items/todo_item.entity';
import { SyncStatus } from './sync-status.enum';
import { RemoteTodoList, RemoteTodoListDraft } from './domain/remote-todo-list';
import { RemoteTodoItem, RemoteTodoItemDraft } from './domain/remote-todo-item';
import { UnsupportedRemoteOperationError } from './external/unsupported-remote-operation.error';

class FakeRemoteTodoGateway extends RemoteTodoGateway {
  remotes: RemoteTodoList[] = [];
  createdLists: RemoteTodoListDraft[] = [];

  fetchAll(): Promise<RemoteTodoList[]> {
    return Promise.resolve(this.remotes);
  }

  createList(draft: RemoteTodoListDraft): Promise<RemoteTodoList> {
    this.createdLists.push(draft);
    return Promise.resolve({
      externalId: `ext-${draft.sourceId}`,
      sourceId: draft.sourceId,
      name: draft.name,
      updatedAt: new Date(),
      items: draft.items.map((item) => ({
        externalId: `ext-${item.sourceId}`,
        sourceId: item.sourceId,
        title: item.title,
        completed: item.completed,
        updatedAt: new Date(),
      })),
    });
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
}

function makeList(partial: Partial<TodoList>): TodoList {
  return Object.assign(new TodoList(), {
    items: [],
    externalId: null,
    syncStatus: SyncStatus.Pending,
    ...partial,
  });
}

function makeItem(partial: Partial<TodoItem>): TodoItem {
  return Object.assign(new TodoItem(), {
    externalId: null,
    syncStatus: SyncStatus.Pending,
    ...partial,
  });
}

function repositoryMock(
  find: jest.Mock,
): Record<string, jest.Mock> {
  return {
    find,
    create: jest.fn((input: unknown) => input),
    save: jest.fn((input: unknown) => Promise.resolve(input)),
  };
}

async function buildService(
  gateway: FakeRemoteTodoGateway,
  locals: TodoList[],
): Promise<SyncService> {
  const listRepository = repositoryMock(jest.fn().mockResolvedValue(locals));
  const itemRepository = repositoryMock(jest.fn().mockResolvedValue([]));

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      SyncService,
      SyncReconciler,
      { provide: RemoteTodoGateway, useValue: gateway },
      { provide: getRepositoryToken(TodoList), useValue: listRepository },
      { provide: getRepositoryToken(TodoItem), useValue: itemRepository },
    ],
  }).compile();

  return module.get<SyncService>(SyncService);
}

describe('SyncService', () => {
  it('pushes a local-only list through the gateway and marks it synced', async () => {
    const gateway = new FakeRemoteTodoGateway();
    const item = makeItem({ id: 2, title: 'Buy milk', completed: false });
    const list = makeList({ id: 1, name: 'Groceries', items: [item] });

    const service = await buildService(gateway, [list]);
    const summary = await service.run();

    expect(summary.pushed).toBe(1);
    expect(gateway.createdLists).toHaveLength(1);
    expect(gateway.createdLists[0].sourceId).toBe('1');
    expect(list.externalId).toBe('ext-1');
    expect(list.syncStatus).toBe(SyncStatus.Synced);
    expect(item.externalId).toBe('ext-2');
    expect(item.syncStatus).toBe(SyncStatus.Synced);
  });

  it('flags a local item as unsynced when the connector cannot create it', async () => {
    const gateway = new FakeRemoteTodoGateway();
    gateway.remotes = [
      {
        externalId: 'R1',
        sourceId: null,
        name: 'Groceries',
        updatedAt: new Date(),
        items: [],
      },
    ];
    const newItem = makeItem({ id: 5, title: 'Added locally' });
    const list = makeList({ id: 1, externalId: 'R1', items: [newItem] });

    const service = await buildService(gateway, [list]);
    const summary = await service.run();

    expect(summary.unsynced).toBe(1);
    expect(summary.failed).toEqual([]);
    expect(newItem.syncStatus).toBe(SyncStatus.Unsynced);
  });
});
