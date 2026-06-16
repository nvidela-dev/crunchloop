import { ApiProperty } from '@nestjs/swagger';

export class UpdateTodoListDto {
  @ApiProperty({ example: 'NestJS interview prep' })
  name: string;
}
