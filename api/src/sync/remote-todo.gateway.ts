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

export abstract class RemoteTodoGateway {
  abstract fetchAll(): Promise<RemoteTodoList[]>;

  abstract createList(draft: RemoteTodoListDraft): Promise<RemoteTodoList>;

  abstract updateList(
    externalId: string,
    patch: RemoteTodoListPatch,
  ): Promise<RemoteTodoList>;

  abstract deleteList(externalId: string): Promise<void>;

  abstract createItem(
    listExternalId: string,
    draft: RemoteTodoItemDraft,
  ): Promise<RemoteTodoItem>;

  abstract updateItem(
    listExternalId: string,
    itemExternalId: string,
    patch: RemoteTodoItemPatch,
  ): Promise<RemoteTodoItem>;

  abstract deleteItem(
    listExternalId: string,
    itemExternalId: string,
  ): Promise<void>;
}
