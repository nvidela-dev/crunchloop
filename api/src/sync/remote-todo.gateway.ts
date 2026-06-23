import {
  RemoteTodoList,
  RemoteTodoListDraft,
} from './domain/remote-todo-list';
import {
  RemoteTodoItem,
  RemoteTodoItemDraft,
} from './domain/remote-todo-item';

export abstract class RemoteTodoGateway {
  abstract fetchAll(): Promise<RemoteTodoList[]>;

  abstract createList(draft: RemoteTodoListDraft): Promise<RemoteTodoList>;

  abstract createItem(
    listExternalId: string,
    draft: RemoteTodoItemDraft,
  ): Promise<RemoteTodoItem>;
}
