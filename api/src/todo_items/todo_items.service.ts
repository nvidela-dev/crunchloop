import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TodoItem } from './todo_item.entity';
import { CreateTodoItemDto } from './dtos/create-todo_item';
import { UpdateTodoItemDto } from './dtos/update-todo_item';
import { SyncStatus } from '../sync/sync-status.enum';
import { TodoList } from '../todo_lists/todo_list.entity';

@Injectable()
export class TodoItemsService {
  constructor(
    @InjectRepository(TodoItem)
    private readonly todoItemRepository: Repository<TodoItem>,
    @InjectRepository(TodoList)
    private readonly todoListRepository: Repository<TodoList>,
  ) {}

  async all(todoListId: number): Promise<TodoItem[]> {
    return await this.todoItemRepository.find({ where: { todoListId } });
  }

  async get(todoListId: number, id: number): Promise<TodoItem | null> {
    return await this.todoItemRepository.findOneBy({ id, todoListId });
  }

  async create(todoListId: number, dto: CreateTodoItemDto): Promise<TodoItem> {
    const todoList = await this.todoListRepository.findOneBy({
      id: todoListId,
    });
    if (todoList === null) {
      throw new NotFoundException(`TodoList ${todoListId} not found`);
    }

    const todoItem = this.todoItemRepository.create({
      title: dto.title,
      todoListId,
    });
    return await this.todoItemRepository.save(todoItem);
  }

  async update(
    todoListId: number,
    id: number,
    dto: UpdateTodoItemDto,
  ): Promise<TodoItem> {
    return await this.todoItemRepository.save({
      id,
      todoListId,
      ...dto,
      syncStatus: SyncStatus.Pending,
    });
  }

  // Soft delete: sets the deletedAt tombstone instead of removing the row, so
  // the sync engine can propagate the deletion to the external API.
  async delete(todoListId: number, id: number): Promise<void> {
    await this.todoItemRepository.softDelete({ id, todoListId });
  }
}
