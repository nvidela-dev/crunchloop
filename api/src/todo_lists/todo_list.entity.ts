import { ApiProperty } from '@nestjs/swagger';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { TodoItem } from '../todo_items/todo_item.entity';
import { SyncStatus } from '../sync/sync-status.enum';

@Entity()
export class TodoList {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ example: 'Interview prep' })
  @Column()
  name: string;

  @OneToMany(() => TodoItem, (todoItem) => todoItem.todoList)
  items: TodoItem[];

  // --- Sync metadata ---

  // The external API's id for this list. Null until first pushed/pulled.
  @ApiProperty({ example: 'b1a0…', nullable: true })
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
