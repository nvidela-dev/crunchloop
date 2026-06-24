import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateTodoListDto {
  @ApiProperty({ example: 'NestJS interview prep' })
  @IsString()
  @IsNotEmpty()
  name: string;
}
