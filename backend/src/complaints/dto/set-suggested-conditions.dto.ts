import { IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetSuggestedConditionsDto {
  @ApiProperty({ description: 'Id-të e gjendjeve të sugjeruara që lidhen me këtë ankesë (zëvendëson lidhjet ekzistuese)', isArray: true, type: String })
  @IsArray()
  @IsString({ each: true })
  suggestedConditionIds: string[];
}
