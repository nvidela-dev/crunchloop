import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateTodoItemDto {
  @ApiProperty({ example: 'Review NestJS docs' })
  @IsString()
  @IsNotEmpty()
  title: string;
}
