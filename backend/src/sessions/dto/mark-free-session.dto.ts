import { IsOptional, IsString } from 'class-validator';

export class MarkFreeSessionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
