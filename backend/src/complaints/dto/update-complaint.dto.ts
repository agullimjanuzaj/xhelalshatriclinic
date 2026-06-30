import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';
import { CreateComplaintDto } from './create-complaint.dto';

export class UpdateComplaintDto extends PartialType(CreateComplaintDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
