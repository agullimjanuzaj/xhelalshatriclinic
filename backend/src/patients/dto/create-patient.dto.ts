import { IsString, IsOptional, IsEnum, IsDateString, IsNotEmpty, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender } from '@prisma/client';

// Converts empty strings / null to undefined so @IsOptional skips further validation
function trimOrUndefined({ value }: { value: any }) {
  if (value === null || value === undefined || value === '') return undefined;
  return typeof value === 'string' ? value.trim() : value;
}

export class CreatePatientDto {
  @ApiProperty({ example: 'Agron' })
  @IsString()
  @IsNotEmpty({ message: 'Emri është i detyrueshëm' })
  firstName: string;

  @ApiProperty({ example: 'Hasani' })
  @IsString()
  @IsNotEmpty({ message: 'Mbiemri është i detyrueshëm' })
  lastName: string;

  @ApiProperty({ example: '+383 44 123 456' })
  @IsString()
  @IsNotEmpty({ message: 'Numri i telefonit është i detyrueshëm' })
  phone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOrUndefined)
  @IsDateString({}, { message: 'Data e lindjes nuk është e vlefshme' })
  birthDate?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender, { message: 'Gjinia nuk është e vlefshme' })
  gender?: Gender;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString()
  notes?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Dega është e detyrueshme' })
  branchId: string;

  @ApiPropertyOptional({ description: 'A është pacienti fizikisht në klinikë tani (tick i recepsionit)' })
  @IsOptional()
  @IsBoolean()
  activeInClinic?: boolean;
}
