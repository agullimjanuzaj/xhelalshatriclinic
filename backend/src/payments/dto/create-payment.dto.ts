import { IsNumber, IsOptional, IsEnum, IsString, IsNotEmpty, Min, IsDateString, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, PaymentType } from '@prisma/client';
import { Type } from 'class-transformer';

export class PaymentAllocationDto {
  @ApiProperty({ description: 'ID e planit të trajtimit' })
  @IsString()
  @IsNotEmpty()
  treatmentPlanId: string;

  @ApiProperty({ example: 25, description: 'Shuma e alokuar për këtë plan' })
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  treatmentPlanId?: string;

  @ApiPropertyOptional({ description: 'Pagesë për seanca specifike standalone', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sessionIds?: string[];

  @ApiPropertyOptional({
    description: 'Alokimet FIFO — çdo plan me shumën e tij. Nëse mungojnë, backend llogarit FIFO automatikisht.',
    type: [PaymentAllocationDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  allocations?: PaymentAllocationDto[];

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

  @ApiPropertyOptional({ description: 'UUID unik i gjeneruar nga frontend — backend kthen pagesën ekzistuese nëse e njëjta çelës dërgohet sërisht (mbrojtje nga dyfishimi)' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
