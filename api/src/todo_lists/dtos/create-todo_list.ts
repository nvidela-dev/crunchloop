import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateTodoListDto {
  @ApiProperty({ example: 'Interview prep' })
  @IsString()
  @IsNotEmpty()
  name: string;
}
