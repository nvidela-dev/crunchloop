export interface TodoItem {
  id: number;
  title: string;
  completed: boolean;
  todoListId: number;
  externalId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
