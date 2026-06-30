import { IsString, IsOptional, IsNotEmpty, IsEnum, IsNumber, Min, Max, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SymptomType } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateTreatmentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Pacienti është i detyrueshëm' })
  patientId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  treatmentPlanId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  physiotherapistId?: string;

  @ApiProperty({ description: 'Emrat e llojeve të trajtimit (nga /treatment-types)', isArray: true, type: String })
  @IsArray()
  @IsString({ each: true })
  treatmentTypes: string[];

  @ApiPropertyOptional({ enum: SymptomType, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(SymptomType, { each: true })
  symptoms?: SymptomType[];

  @ApiPropertyOptional({ minimum: 1, maximum: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  @Type(() => Number)
  painLevel?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  duration?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recommendations?: string;
}
