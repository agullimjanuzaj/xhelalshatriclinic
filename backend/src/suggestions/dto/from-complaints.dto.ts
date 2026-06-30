import { IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FromComplaintsDto {
  @ApiProperty({ description: 'Id-të e ankesave kryesore të zgjedhura', isArray: true, type: String })
  @IsArray()
  @IsString({ each: true })
  complaintIds: string[];
}
