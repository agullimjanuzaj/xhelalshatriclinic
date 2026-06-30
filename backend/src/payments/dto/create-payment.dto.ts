import { IsNumber, IsOptional, IsEnum, IsString, IsNotEmpty, Min, IsDateString, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, PaymentType } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreatePaymentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Pacienti është i detyrueshëm' })
  patientId: string;

  @ApiPropertyOptional({ description: 'Opsionale — nëse mungon, merret nga dega e pacientit' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  treatmentPlanId?: string;

  @ApiPropertyOptional({ description: 'Pagesë për një ose disa seanca specifike', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sessionIds?: string[];

  @ApiProperty({ example: 35 })
  @IsNumber()
  @Min(0.01, { message: 'Shuma duhet të jetë më e madhe se 0' })
  @Type(() => Number)
  amount: number;

  @ApiPropertyOptional({ enum: PaymentMethod, default: PaymentMethod.CASH })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ enum: PaymentType, description: 'Informacion mbi llojin e pagesës — statusi llogaritet gjithmonë automatikisht nga backend' })
  @IsOptional()
  @IsEnum(PaymentType)
  paymentType?: PaymentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Opsionale — default tani' })
  @IsOptional()
  @IsDateString()
  paidAt?: string;
}
