import { IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CompleteSessionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ isArray: true, type: String })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  treatmentTypes?: string[];

  @ApiPropertyOptional({ description: 'Niveli i dhimbjes (1-10)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  painLevel?: number;

  @ApiPropertyOptional({ description: 'Kohëzgjatja në minuta' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  duration?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recommendations?: string;

  @ApiPropertyOptional({ description: 'Vetëm për ADMIN — fizioterapeuti që e kreu seancën, nëse ndryshon nga vetë admini' })
  @IsOptional()
  @IsString()
  physiotherapistId?: string;
}
