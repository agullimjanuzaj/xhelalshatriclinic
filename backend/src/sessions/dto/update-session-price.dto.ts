import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpdateSessionPriceDto {
  @ApiProperty({ example: 25 })
  @IsNumber()
  @Min(0, { message: 'Çmimi nuk mund të jetë negativ' })
  @Type(() => Number)
  amount: number;

  @ApiPropertyOptional({ description: 'Arsyeja e ndryshimit të çmimit' })
  @IsOptional()
  @IsString()
  reason?: string;
}
