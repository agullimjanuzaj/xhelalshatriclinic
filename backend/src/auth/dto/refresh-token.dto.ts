import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Token-i i rifreskimit është i detyrueshëm' })
  refreshToken: string;
}
