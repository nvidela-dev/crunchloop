import { ApiProperty } from '@nestjs/swagger';

export class UpdateTodoItemDto {
  @ApiProperty({ example: 'Review NestJS docs thoroughly' })
  title: string;

  @ApiProperty({ example: 'Read the providers, modules and DI sections' })
  description: string;

  @ApiProperty({ example: true })
  completed: boolean;
}
