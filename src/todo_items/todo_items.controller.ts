import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CreateTodoItemDto } from './dtos/create-todo_item';
import { UpdateTodoItemDto } from './dtos/update-todo_item';
import { TodoItem } from '../interfaces/todo_item.interface';
import { TodoItemsService } from './todo_items.service';
import { TodoItem as TodoItemEntity } from './todo_item.entity';

@ApiTags('todo items')
@ApiParam({ name: 'todoListId', type: Number })
@Controller('api/todolists/:todoListId/items')
export class TodoItemsController {
  constructor(private todoItemsService: TodoItemsService) {}

  @ApiOperation({ summary: 'List items in a todo list' })
  @ApiOkResponse({ type: TodoItemEntity, isArray: true })
  @Get()
  index(
    @Param('todoListId', ParseIntPipe) todoListId: number,
  ): Promise<TodoItem[]> {
    return this.todoItemsService.all(todoListId);
  }

  @ApiOperation({ summary: 'Get one item' })
  @ApiParam({ name: 'itemId', type: Number })
  @ApiOkResponse({ type: TodoItemEntity })
  @Get('/:itemId')
  show(
    @Param('todoListId', ParseIntPipe) todoListId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
  ): Promise<TodoItem | null> {
    return this.todoItemsService.get(todoListId, itemId);
  }

  @ApiOperation({ summary: 'Create an item in a todo list' })
  @ApiCreatedResponse({ type: TodoItemEntity })
  @Post()
  create(
    @Param('todoListId', ParseIntPipe) todoListId: number,
    @Body() dto: CreateTodoItemDto,
  ): Promise<TodoItem> {
    return this.todoItemsService.create(todoListId, dto);
  }

  @ApiOperation({ summary: 'Update an item (including completed)' })
  @ApiParam({ name: 'itemId', type: Number })
  @ApiOkResponse({ type: TodoItemEntity })
  @Put('/:itemId')
  update(
    @Param('todoListId', ParseIntPipe) todoListId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: UpdateTodoItemDto,
  ): Promise<TodoItem> {
    return this.todoItemsService.update(todoListId, itemId, dto);
  }

  @ApiOperation({ summary: 'Delete an item' })
  @ApiParam({ name: 'itemId', type: Number })
  @ApiOkResponse({ description: 'Item deleted' })
  @Delete('/:itemId')
  delete(
    @Param('todoListId', ParseIntPipe) todoListId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
  ): Promise<void> {
    return this.todoItemsService.delete(todoListId, itemId);
  }
}
