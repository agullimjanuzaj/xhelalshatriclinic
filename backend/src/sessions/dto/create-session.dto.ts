import { IsString, IsOptional, IsNotEmpty, IsNumber, Min, Max, IsDateString, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateSessionDto {
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
  physiotherapistId?: string;

  @ApiPropertyOptional({ description: 'Opsionale — seanca mund të regjistrohet pa plan trajtimi' })
  @IsOptional()
  @IsString()
  treatmentPlanId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  sessionNumber?: number;

  @ApiPropertyOptional({ description: 'Opsionale — data/ora e seancës' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ description: 'Opsionale — kur u krye seanca; default tani. Seanca regjistrohet gjithmonë si COMPLETED' })
  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @ApiPropertyOptional()
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

  @ApiPropertyOptional({ description: 'Shënim i shkurtër' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recommendations?: string;

  @ApiPropertyOptional({ description: 'Emrat e llojeve të trajtimit të kryera në këtë seancë', isArray: true, type: String })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  treatmentTypes?: string[];

  @ApiPropertyOptional({ description: 'Çmimi i seancës standalone (€). Vlera 0 lejohet (seancë falas), vlerat negative refuzohen.' })
  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Çmimi i seancës nuk mund të jetë negativ' })
  @Type(() => Number)
  amount?: number;
}
