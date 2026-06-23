import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TodoItem } from './todo_item.entity';
import { CreateTodoItemDto } from './dtos/create-todo_item';
import { UpdateTodoItemDto } from './dtos/update-todo_item';

@Injectable()
export class TodoItemsService {
  constructor(
    @InjectRepository(TodoItem)
    private readonly todoItemRepository: Repository<TodoItem>,
  ) {}

  async all(todoListId: number): Promise<TodoItem[]> {
    return await this.todoItemRepository.find({ where: { todoListId } });
  }

  async get(todoListId: number, id: number): Promise<TodoItem | null> {
    return await this.todoItemRepository.findOneBy({ id, todoListId });
  }

  async create(todoListId: number, dto: CreateTodoItemDto): Promise<TodoItem> {
    const todoItem = this.todoItemRepository.create({
      title: dto.title,
      description: dto.description,
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
    } as TodoItem);
  }

  // Soft delete: sets the deletedAt tombstone instead of removing the row, so
  // the sync engine can propagate the deletion to the external API.
  async delete(todoListId: number, id: number): Promise<void> {
    await this.todoItemRepository.softDelete({ id, todoListId });
  }
}
