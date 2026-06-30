import { IsInt, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpdateClinicSettingsDto {
  @ApiPropertyOptional({ example: 3, description: 'Pas sa orësh "Aktiv në klinikë" çaktivizohet automatikisht' })
  @IsOptional()
  @IsInt({ message: 'Duhet të jetë numër i plotë' })
  @Min(1, { message: 'Minimumi është 1 orë' })
  @Max(48, { message: 'Maksimumi është 48 orë' })
  @Type(() => Number)
  activeInClinicAutoExpireHours?: number;

  @ApiPropertyOptional({ example: 1, description: 'Bonusi (€) për çdo trajtim/seancë të kompletuar — konfigurohet vetëm te Raportet' })
  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Duhet të jetë 0 ose më shumë' })
  @Type(() => Number)
  bonusPerCompletedSession?: number;
}
