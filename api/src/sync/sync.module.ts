import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TodoList } from '../todo_lists/todo_list.entity';
import { TodoItem } from '../todo_items/todo_item.entity';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { SyncReconciler } from './sync.reconciler';
import { RemoteTodoGateway } from './remote-todo.gateway';
import { ExternalTodoGateway } from './external/external-todo.gateway';

@Module({
  imports: [TypeOrmModule.forFeature([TodoList, TodoItem])],
  controllers: [SyncController],
  providers: [
    SyncService,
    SyncReconciler,
    { provide: RemoteTodoGateway, useClass: ExternalTodoGateway },
  ],
})
export class SyncModule {}
