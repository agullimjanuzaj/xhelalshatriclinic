import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';
import { CreateSuggestedConditionDto } from './create-suggested-condition.dto';

export class UpdateSuggestedConditionDto extends PartialType(CreateSuggestedConditionDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
