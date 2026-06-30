import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';
import { IsOptional, IsBoolean } from 'class-validator';

export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, ['username'] as const)) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
