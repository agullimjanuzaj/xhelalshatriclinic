import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';
import { CreateTreatmentTypeDto } from './create-treatment-type.dto';

export class UpdateTreatmentTypeDto extends PartialType(CreateTreatmentTypeDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
