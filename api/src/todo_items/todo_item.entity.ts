import { ApiProperty } from '@nestjs/swagger';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { TodoList } from '../todo_lists/todo_list.entity';
import { SyncStatus } from '../sync/sync-status.enum';

@Entity()
export class TodoItem {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ example: 'Review NestJS docs' })
  @Column()
  title: string;

  @ApiProperty({ example: 'Read the providers and modules sections' })
  @Column()
  description: string;

  @ApiProperty({ example: false })
  @Column({ default: false })
  completed: boolean;

  @ManyToOne(() => TodoList, (todoList) => todoList.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'todoListId' })
  todoList: TodoList;

  @ApiProperty({ example: 1 })
  @Column()
  todoListId: number;

  // --- Sync metadata ---

  // The external API's id for this item. Null until first pushed/pulled.
  @ApiProperty({ example: 'c2f1…', nullable: true })
  @Column({ type: 'varchar', nullable: true, unique: true })
  externalId: string | null;

  @ApiProperty({ enum: SyncStatus, example: SyncStatus.Pending })
  @Column({ type: 'enum', enum: SyncStatus, default: SyncStatus.Pending })
  syncStatus: SyncStatus;

  @ApiProperty()
  @CreateDateColumn()
  createdAt: Date;

  // Stamped on every save() — drives last-write-wins change detection.
  @ApiProperty()
  @UpdateDateColumn()
  updatedAt: Date;

  // Soft-delete tombstone: rows with a non-null deletedAt are excluded from
  // reads, but kept so the sync engine can propagate the delete.
  @DeleteDateColumn()
  deletedAt: Date | null;
}
