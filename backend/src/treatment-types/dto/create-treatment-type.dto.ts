import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTreatmentTypeDto {
  @ApiProperty({ example: 'Terapi Manuale' })
  @IsString()
  @IsNotEmpty({ message: 'Emri është i detyrueshëm' })
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
