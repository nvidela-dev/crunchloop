import { TodoItem } from './todo_item.interface';

export interface TodoList {
  id: number;
  name: string;
  items?: TodoItem[];
}
