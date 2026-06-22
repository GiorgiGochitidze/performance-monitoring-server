import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class CreateLogDTO {
  @IsString()
  @IsNotEmpty()
  @IsIn(['INFO', 'WARN', 'CRITICAL', { message: 'Invalid Log Types' }])
  level!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsString()
  @IsNotEmpty()
  serverId!: string;
}
