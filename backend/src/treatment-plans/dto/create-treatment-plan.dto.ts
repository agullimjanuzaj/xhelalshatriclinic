import { IsString, IsOptional, IsNumber, IsNotEmpty, Min, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateTreatmentPlanDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Pacienti është i detyrueshëm' })
  patientId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  diagnosis?: string;

  @ApiProperty({ example: 6, description: 'Numri i seancave (6, 8, ose numër i personalizuar)' })
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  totalSessions: number;

  @ApiPropertyOptional({ description: 'Çmimi për trajtim/seancë (€) — nëse mungon, merret nga çmimi i degës së pacientit' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  sessionFee?: number;

  @ApiPropertyOptional({ description: 'Ankesat kryesore të zgjedhura (emra nga /complaints)', isArray: true, type: String })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  complaints?: string[];

  @ApiPropertyOptional({ description: 'Diagnozat e sugjeruara që u shenjuan (checked)', isArray: true, type: String })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedDiagnoses?: string[];

  @ApiPropertyOptional({ description: 'Çmim total manual i klinikës — nëse jepet, mbishkruan llogaritjen automatike' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  totalAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Fizioterapeuti i caktuar për planin (opsionale — mund të caktohet më vonë te seanca)' })
  @IsOptional()
  @IsString()
  assignedPhysiotherapistId?: string;

  @ApiPropertyOptional({ description: 'Emrat e llojeve të trajtimit (nga /treatment-types, dinamike)', isArray: true, type: String })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  treatmentTypes?: string[];

  @ApiPropertyOptional({ description: 'E injoruar gjithmonë — dega merret nga patient.branchId, jo nga klienti' })
  @IsOptional()
  @IsString()
  branchId?: string;
}
