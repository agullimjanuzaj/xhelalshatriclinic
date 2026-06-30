import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'xhelalshatri' })
  @IsString({ message: 'Emri i përdoruesit duhet të jetë tekst' })
  @MinLength(3, { message: 'Emri i përdoruesit duhet të ketë të paktën 3 karaktere' })
  username: string;

  @ApiProperty({ example: 'Admin123!' })
  @IsString()
  @MinLength(6, { message: 'Fjalëkalimi duhet të ketë të paktën 6 karaktere' })
  password: string;
}
