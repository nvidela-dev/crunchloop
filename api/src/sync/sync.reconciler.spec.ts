import { SyncReconciler } from './sync.reconciler';
import { TodoList } from '../todo_lists/todo_list.entity';
import { TodoItem } from '../todo_items/todo_item.entity';
import { SyncStatus } from './sync-status.enum';
import { RemoteTodoList } from './domain/remote-todo-list';
import { RemoteTodoItem } from './domain/remote-todo-item';

const OLD = new Date(1000);
const NEW = new Date(2000);

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

describe('SyncReconciler', () => {
  const reconciler = new SyncReconciler();

  it('pulls remote-only lists', () => {
    const remote = remoteList({ externalId: 'R1' });
    const plan = reconciler.reconcile([], [remote]);
    expect(plan.createLocal.lists).toEqual([remote]);
  });

  it('pushes local-only lists', () => {
    const local = makeList({ id: 1, externalId: null });
    const plan = reconciler.reconcile([local], []);
    expect(plan.createRemote.lists).toEqual([local]);
  });

  it('adopts a local list matched only by source id', () => {
    const local = makeList({ id: 7, externalId: null });
    const remote = remoteList({ externalId: 'R9', sourceId: '7' });
    const plan = reconciler.reconcile([local], [remote]);
    expect(plan.adopt.lists).toEqual([{ local, remote }]);
  });

  it('pushes a brand-new item (placeholder) and pulls a remote-only item', () => {
    const newItem = makeItem({ id: 5, externalId: null });
    const local = makeList({ id: 1, externalId: 'R1', items: [newItem] });
    const remoteOnly = remoteItem({ externalId: 'RI9' });
    const remote = remoteList({ externalId: 'R1', items: [remoteOnly] });

    const plan = reconciler.reconcile([local], [remote]);

    expect(plan.createRemote.items).toEqual([
      { listExternalId: 'R1', item: newItem },
    ]);
    expect(plan.createLocal.items).toEqual([
      { list: local, remote: remoteOnly },
    ]);
  });

  describe('last-write-wins updates', () => {
    it('pushes when the local list is newer', () => {
      const local = makeList({
        id: 1,
        externalId: 'R1',
        name: 'B',
        updatedAt: NEW,
      });
      const remote = remoteList({
        externalId: 'R1',
        name: 'A',
        updatedAt: OLD,
      });
      const plan = reconciler.reconcile([local], [remote]);
      expect(plan.updateRemote.lists).toEqual([local]);
      expect(plan.updateLocal.lists).toEqual([]);
    });

    it('pulls when the remote list is newer', () => {
      const local = makeList({
        id: 1,
        externalId: 'R1',
        name: 'A',
        updatedAt: OLD,
      });
      const remote = remoteList({
        externalId: 'R1',
        name: 'C',
        updatedAt: NEW,
      });
      const plan = reconciler.reconcile([local], [remote]);
      expect(plan.updateLocal.lists).toEqual([{ local, remote }]);
      expect(plan.updateRemote.lists).toEqual([]);
    });

    it('pushes when a local item is newer', () => {
      const item = makeItem({
        id: 5,
        externalId: 'RI1',
        title: 'B',
        updatedAt: NEW,
      });
      const local = makeList({ id: 1, externalId: 'R1', items: [item] });
      const remote = remoteList({
        externalId: 'R1',
        items: [remoteItem({ externalId: 'RI1', title: 'A', updatedAt: OLD })],
      });
      const plan = reconciler.reconcile([local], [remote]);
      expect(plan.updateRemote.items).toEqual([{ listExternalId: 'R1', item }]);
    });

    it('pulls when a remote item is newer', () => {
      const item = makeItem({
        id: 5,
        externalId: 'RI1',
        title: 'A',
        updatedAt: OLD,
      });
      const local = makeList({ id: 1, externalId: 'R1', items: [item] });
      const incoming = remoteItem({
        externalId: 'RI1',
        title: 'C',
        updatedAt: NEW,
      });
      const remote = remoteList({ externalId: 'R1', items: [incoming] });
      const plan = reconciler.reconcile([local], [remote]);
      expect(plan.updateLocal.items).toEqual([{ item, remote: incoming }]);
    });

    it('marks a content-matching but pending row synced without any call', () => {
      const local = makeList({
        id: 1,
        externalId: 'R1',
        name: 'same',
        syncStatus: SyncStatus.Pending,
      });
      const remote = remoteList({ externalId: 'R1', name: 'same' });
      const plan = reconciler.reconcile([local], [remote]);
      expect(plan.markSynced.lists).toEqual([local]);
      expect(plan.updateRemote.lists).toEqual([]);
      expect(plan.updateLocal.lists).toEqual([]);
    });
  });

  describe('deletes', () => {
    it('propagates a local soft-delete with an externalId to the remote', () => {
      const local = makeList({
        id: 1,
        externalId: 'R1',
        deletedAt: new Date(),
      });
      const remote = remoteList({ externalId: 'R1' });
      const plan = reconciler.reconcile([local], [remote]);
      expect(plan.deleteRemote.lists).toEqual([local]);
    });

    it('purges a soft-deleted local list that was never synced', () => {
      const local = makeList({
        id: 1,
        externalId: null,
        deletedAt: new Date(),
      });
      const plan = reconciler.reconcile([local], []);
      expect(plan.removeLocal.lists).toEqual([local]);
    });

    it('removes a local list whose remote was deleted', () => {
      const local = makeList({ id: 1, externalId: 'R1' });
      const plan = reconciler.reconcile([local], []);
      expect(plan.removeLocal.lists).toEqual([local]);
    });

    it('removes a local item whose remote item was deleted', () => {
      const orphan = makeItem({ id: 5, externalId: 'RI1' });
      const local = makeList({ id: 1, externalId: 'R1', items: [orphan] });
      const remote = remoteList({ externalId: 'R1', items: [] });
      const plan = reconciler.reconcile([local], [remote]);
      expect(plan.removeLocal.items).toEqual([orphan]);
    });
  });
});
