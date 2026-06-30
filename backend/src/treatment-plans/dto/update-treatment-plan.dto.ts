import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateTreatmentPlanDto } from './create-treatment-plan.dto';
import { IsOptional, IsEnum, IsNumber, IsBoolean } from 'class-validator';
import { PaymentStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class UpdateTreatmentPlanDto extends PartialType(CreateTreatmentPlanDto) {
  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  completedSessions?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  amountPaid?: number;

  @ApiPropertyOptional({ description: 'Çmim total manual i klinikës — nëse jepet, mbishkruan llogaritjen automatike' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  totalAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  endDate?: string;
}
