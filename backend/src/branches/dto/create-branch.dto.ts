import { IsString, IsOptional, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateBranchDto {
  @ApiProperty()
  @IsString({ message: 'Emri i degës është i detyrueshëm' })
  name: string;

  @ApiProperty()
  @IsString({ message: 'Qyteti është i detyrueshëm' })
  city: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  managerId?: string;

  @ApiPropertyOptional({ default: 20, description: 'Çmimi i seancës/trajtimit për këtë degë (€)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  sessionPrice?: number;
}
