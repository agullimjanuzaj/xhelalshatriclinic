import { IsNumber, IsOptional, IsEnum, IsString, IsNotEmpty, Min, IsDateString, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, PaymentType } from '@prisma/client';
import { Type } from 'class-transformer';

export class SessionAllocationDto {
  @ApiProperty({ description: 'ID e seancës' })
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @ApiProperty({ example: 20, description: 'Shuma e alokuar për këtë seancë' })
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  amount: number;
}

export class CreatePaymentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Pacienti është i detyrueshëm' })
  patientId: string;

  @ApiPropertyOptional({ description: 'Opsionale — nëse mungon, merret nga dega e pacientit' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Kontrollë (plan trajtimi) e lidhur me pagesën' })
  @IsOptional()
  @IsString()
  treatmentPlanId?: string;

  @ApiPropertyOptional({
    description: 'Alokime manuale sipas seancës. Nëse mungojnë, backend bën FIFO automatikisht.',
    type: [SessionAllocationDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SessionAllocationDto)
  sessionAllocations?: SessionAllocationDto[];

  @ApiPropertyOptional({ description: 'Pagesë për seanca specifike standalone', type: [String] })
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

  @ApiPropertyOptional({ enum: PaymentType })
  @IsOptional()
  @IsEnum(PaymentType)
  paymentType?: PaymentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @ApiPropertyOptional({ description: 'UUID unik i gjeneruar nga frontend — mbrojtje nga dyfishimi' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
