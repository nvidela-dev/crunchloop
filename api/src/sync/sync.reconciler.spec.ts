import { SyncReconciler } from './sync.reconciler';
import { TodoList } from '../todo_lists/todo_list.entity';
import { TodoItem } from '../todo_items/todo_item.entity';
import { SyncStatus } from './sync-status.enum';
import { RemoteTodoList } from './domain/remote-todo-list';
import { RemoteTodoItem } from './domain/remote-todo-item';

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

function makeRemoteList(
  partial: Partial<RemoteTodoList> & Pick<RemoteTodoList, 'externalId'>,
): RemoteTodoList {
  return {
    sourceId: null,
    name: 'remote list',
    updatedAt: new Date(),
    items: [],
    ...partial,
  };
}

function makeRemoteItem(
  partial: Partial<RemoteTodoItem> & Pick<RemoteTodoItem, 'externalId'>,
): RemoteTodoItem {
  return {
    sourceId: null,
    title: 'remote item',
    completed: false,
    updatedAt: new Date(),
    ...partial,
  };
}

describe('SyncReconciler', () => {
  const reconciler = new SyncReconciler();

  it('pulls remote-only lists', () => {
    const remote = makeRemoteList({ externalId: 'R1' });

    const plan = reconciler.reconcile([], [remote]);

    expect(plan.pullLists).toEqual([remote]);
    expect(plan.pushLists).toEqual([]);
  });

  it('pushes local-only lists', () => {
    const local = makeList({ id: 1, name: 'Local', externalId: null });

    const plan = reconciler.reconcile([local], []);

    expect(plan.pushLists).toEqual([local]);
    expect(plan.pullLists).toEqual([]);
    expect(plan.adoptLists).toEqual([]);
  });

  it('only pushes brand-new items on a matched list, leaving linked ones alone', () => {
    const linkedItem = makeItem({ id: 10, externalId: 'RI1' });
    const newItem = makeItem({ id: 11, externalId: null });
    const local = makeList({
      id: 1,
      externalId: 'R1',
      items: [linkedItem, newItem],
    });
    const remote = makeRemoteList({
      externalId: 'R1',
      items: [makeRemoteItem({ externalId: 'RI1' })],
    });

    const plan = reconciler.reconcile([local], [remote]);

    expect(plan.pushItems).toEqual([{ listExternalId: 'R1', item: newItem }]);
    expect(plan.pushLists).toEqual([]);
    expect(plan.pullLists).toEqual([]);
    expect(plan.adoptLists).toEqual([]);
  });

  it('adopts a local list matched only by source id', () => {
    const local = makeList({ id: 7, externalId: null });
    const remote = makeRemoteList({ externalId: 'R9', sourceId: '7' });

    const plan = reconciler.reconcile([local], [remote]);

    expect(plan.adoptLists).toEqual([{ local, remote }]);
    expect(plan.pushLists).toEqual([]);
    expect(plan.pullLists).toEqual([]);
  });
});
