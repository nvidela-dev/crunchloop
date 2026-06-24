import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class UpdateTodoItemDto {
  @ApiProperty({ example: 'Review NestJS docs thoroughly' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Read the providers, modules and DI sections' })
  @IsString()
  description: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  completed: boolean;
}
