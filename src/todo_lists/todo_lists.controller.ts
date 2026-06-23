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
import { CreateTodoListDto } from './dtos/create-todo_list';
import { UpdateTodoListDto } from './dtos/update-todo_list';
import { TodoList } from '../interfaces/todo_list.interface';
import { TodoListsService } from './todo_lists.service';
import { TodoList as TodoListEntity } from './todo_list.entity';

@ApiTags('todo lists')
@Controller('api/todolists')
export class TodoListsController {
  constructor(private todoListsService: TodoListsService) {}

  @ApiOperation({ summary: 'List todo lists' })
  @ApiOkResponse({ type: TodoListEntity, isArray: true })
  @Get()
  index(): Promise<TodoList[]> {
    return this.todoListsService.all();
  }

  @ApiOperation({ summary: 'Get one todo list' })
  @ApiParam({ name: 'todoListId', type: Number })
  @ApiOkResponse({ type: TodoListEntity })
  @Get('/:todoListId')
  show(
    @Param('todoListId', ParseIntPipe) todoListId: number,
  ): Promise<TodoList | null> {
    return this.todoListsService.get(todoListId);
  }

  @ApiOperation({ summary: 'Create a todo list' })
  @ApiCreatedResponse({ type: TodoListEntity })
  @Post()
  create(@Body() dto: CreateTodoListDto): Promise<TodoList> {
    return this.todoListsService.create(dto);
  }

  @ApiOperation({ summary: 'Update a todo list' })
  @ApiParam({ name: 'todoListId', type: Number })
  @ApiOkResponse({ type: TodoListEntity })
  @Put('/:todoListId')
  update(
    @Param('todoListId', ParseIntPipe) todoListId: number,
    @Body() dto: UpdateTodoListDto,
  ): Promise<TodoList> {
    return this.todoListsService.update(todoListId, dto);
  }

  @ApiOperation({ summary: 'Delete a todo list' })
  @ApiParam({ name: 'todoListId', type: Number })
  @ApiOkResponse({ description: 'Todo list deleted' })
  @Delete('/:todoListId')
  delete(@Param('todoListId', ParseIntPipe) todoListId: number): Promise<void> {
    return this.todoListsService.delete(todoListId);
  }
}
