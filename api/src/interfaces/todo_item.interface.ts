export interface TodoItem {
  id: number;
  title: string;
  description: string;
  completed: boolean;
  todoListId: number;
  externalId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
