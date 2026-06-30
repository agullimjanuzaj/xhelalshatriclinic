import { IsString, IsEnum, IsOptional, MinLength, IsArray, Matches, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';

function trimOrUndefined({ value }: { value: any }) {
  if (value === null || value === undefined || value === '') return undefined;
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateUserDto {
  @ApiProperty({ example: 'fizio_arta' })
  @IsString({ message: 'Emri i përdoruesit duhet të jetë tekst' })
  @IsNotEmpty({ message: 'Emri i përdoruesit është i detyrueshëm' })
  @MinLength(3, { message: 'Emri i përdoruesit duhet të ketë të paktën 3 karaktere' })
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message: 'Emri i përdoruesit mund të përmbajë vetëm shkronja, numra, _, . dhe -',
  })
  username: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Fjalëkalimi është i detyrueshëm' })
  @MinLength(8, { message: 'Fjalëkalimi duhet të ketë të paktën 8 karaktere' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Fjalëkalimi duhet të përmbajë shkronja të mëdha, të vogla dhe numra',
  })
  password: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Emri është i detyrueshëm' })
  firstName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Mbiemri është i detyrueshëm' })
  lastName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString()
  phone?: string;

  @ApiProperty({ enum: Role })
  @IsEnum(Role, { message: 'Roli i zgjedhur nuk është i vlefshëm' })
  role: Role;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  branchIds?: string[];
}
