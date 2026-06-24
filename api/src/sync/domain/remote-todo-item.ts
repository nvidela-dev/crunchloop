export interface RemoteTodoItem {
  externalId: string;
  sourceId: string | null;
  title: string;
  completed: boolean;
  updatedAt: Date;
}

export interface RemoteTodoItemDraft {
  sourceId: string;
  title: string;
  completed: boolean;
}

export interface RemoteTodoItemPatch {
  title: string;
  completed: boolean;
}
