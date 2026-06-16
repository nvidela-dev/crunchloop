import { ApiProperty } from '@nestjs/swagger';

export class CreateTodoListDto {
  @ApiProperty({ example: 'Interview prep' })
  name: string;
}
