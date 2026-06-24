import { RemoteTodoItem, RemoteTodoItemDraft } from './remote-todo-item';

export interface RemoteTodoList {
  externalId: string;
  sourceId: string | null;
  name: string;
  updatedAt: Date;
  items: RemoteTodoItem[];
}

export interface RemoteTodoListDraft {
  sourceId: string;
  name: string;
  items: RemoteTodoItemDraft[];
}

export interface RemoteTodoListPatch {
  name: string;
}
