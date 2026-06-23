import { ApiProperty } from '@nestjs/swagger';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TodoList } from '../todo_lists/todo_list.entity';

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
}
