import { PartialType } from '@nestjs/swagger';
import { CreateSessionDto } from './create-session.dto';
import { IsOptional, IsEnum, IsDateString, IsString } from 'class-validator';
import { SessionStatus } from '@prisma/client';

export class UpdateSessionDto extends PartialType(CreateSessionDto) {
  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;

  @IsOptional()
  @IsDateString()
  completedAt?: string;

  // Allow explicit null to disconnect the plan relation
  @IsOptional()
  @IsString()
  treatmentPlanId?: string | null;
}
