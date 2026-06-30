import { IsString, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword: string;

  @ApiProperty()
  @IsString()
  @MinLength(8, { message: 'Fjalëkalimi i ri duhet të ketë të paktën 8 karaktere' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Fjalëkalimi duhet të përmbajë shkronja të mëdha, të vogla dhe numra',
  })
  newPassword: string;
}
