import { IsString, IsOptional, IsNotEmpty, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateComplaintDto {
  @ApiProperty({ example: 'Dhimbje shpine djathtas' })
  @IsString()
  @IsNotEmpty({ message: 'Emri është i detyrueshëm' })
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Rajoni anatomik (p.sh. GJURI, CERVIKALE...)' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Id-të e gjendjeve të sugjeruara që lidhen me këtë ankesë', isArray: true, type: String })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  suggestedConditionIds?: string[];
}
