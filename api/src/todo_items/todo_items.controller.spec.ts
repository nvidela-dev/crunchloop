import { Test, TestingModule } from '@nestjs/testing';
import { TodoItemsController } from './todo_items.controller';
import { TodoItemsService } from './todo_items.service';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TodoItem } from './todo_item.entity';
import { SyncStatus } from '../sync/sync-status.enum';
import { TodoList } from '../todo_lists/todo_list.entity';

describe('TodoItemsController', () => {
  let app: INestApplication;
  let todoItemsController: TodoItemsController;
  let todoItemRepositoryMock: jest.Mocked<Record<string, jest.Mock>>;
  let todoListRepositoryMock: jest.Mocked<Record<string, jest.Mock>>;

  beforeEach(async () => {
    todoItemRepositoryMock = {
      find: jest.fn(),
      findOneBy: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      softDelete: jest.fn(),
      create: jest.fn(),
    };
    todoListRepositoryMock = {
      findOneBy: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TodoItemsController],
      providers: [
        TodoItemsService,
        {
          provide: getRepositoryToken(TodoItem),
          useValue: todoItemRepositoryMock,
        },
        {
          provide: getRepositoryToken(TodoList),
          useValue: todoListRepositoryMock,
        },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    todoItemsController = module.get<TodoItemsController>(TodoItemsController);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('index', () => {
    it('should return all items in a todo list', async () => {
      const mockItems = [
        {
          id: 1,
          title: 'First',
          completed: false,
          todoListId: 1,
        },
        {
          id: 2,
          title: 'Second',
          completed: true,
          todoListId: 1,
        },
      ];

      todoItemRepositoryMock.find.mockResolvedValue(mockItems);

      const result = await todoItemsController.index(1);

      expect(result).toEqual(mockItems);
      expect(todoItemRepositoryMock.find).toHaveBeenCalledWith({
        where: { todoListId: 1 },
      });
    });
  });

  describe('show', () => {
    it('should return a single item scoped to its list', async () => {
      const mockItem = {
        id: 1,
        title: 'First',
        completed: false,
        todoListId: 1,
      };
      todoItemRepositoryMock.findOneBy.mockResolvedValue(mockItem);

      const result = await todoItemsController.show(1, 1);

      expect(result).toEqual(mockItem);
      expect(todoItemRepositoryMock.findOneBy).toHaveBeenCalledWith({
        id: 1,
        todoListId: 1,
      });
    });
  });

  describe('create', () => {
    it('should create a new item in a todo list', async () => {
      const createDto = { title: 'New' };
      const createdItem = {
        id: 1,
        title: 'New',
        completed: false,
        todoListId: 1,
      };

      todoListRepositoryMock.findOneBy.mockResolvedValue({ id: 1 });
      todoItemRepositoryMock.create.mockReturnValue(createdItem);
      todoItemRepositoryMock.save.mockResolvedValue(createdItem);

      const result = await todoItemsController.create(1, createDto);

      expect(result).toEqual(createdItem);
      expect(todoItemRepositoryMock.create).toHaveBeenCalledWith({
        title: 'New',
        todoListId: 1,
      });
    });

    it('throws a not found error when creating an item for a missing list', async () => {
      todoListRepositoryMock.findOneBy.mockResolvedValue(null);

      await expect(
        todoItemsController.create(404, { title: 'New' }),
      ).rejects.toThrow('TodoList 404 not found');
      expect(todoItemRepositoryMock.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update an existing item (including completed)', async () => {
      const updateDto = { title: 'Done', completed: true };
      const updatedItem = {
        id: 1,
        title: 'Done',
        completed: true,
        todoListId: 1,
      };

      todoItemRepositoryMock.save.mockResolvedValue(updatedItem);

      const result = await todoItemsController.update(1, 1, updateDto);

      expect(result).toEqual(updatedItem);
      expect(todoItemRepositoryMock.save).toHaveBeenCalledWith({
        id: 1,
        todoListId: 1,
        ...updateDto,
        syncStatus: SyncStatus.Pending,
      });
    });
  });

  describe('delete', () => {
    it('should soft-delete an item scoped to its list', async () => {
      todoItemRepositoryMock.softDelete.mockResolvedValue({ affected: 1 });

      await todoItemsController.delete(1, 1);

      expect(todoItemRepositoryMock.softDelete).toHaveBeenCalledWith({
        id: 1,
        todoListId: 1,
      });
    });
  });
});
