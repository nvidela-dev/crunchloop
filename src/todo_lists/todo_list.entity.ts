import { ApiProperty } from '@nestjs/swagger';
import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { TodoItem } from '../todo_items/todo_item.entity';

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
}
