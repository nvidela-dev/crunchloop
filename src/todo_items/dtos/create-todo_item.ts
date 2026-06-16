import { ApiProperty } from '@nestjs/swagger';

export class CreateTodoItemDto {
  @ApiProperty({ example: 'Review NestJS docs' })
  title: string;

  @ApiProperty({ example: 'Read the providers and modules sections' })
  description: string;
}
