import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ClinicSettingsService } from './clinic-settings.service';
import { UpdateClinicSettingsDto } from './dto/update-clinic-settings.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Konfigurimi i klinikës')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('clinic-settings')
export class ClinicSettingsController {
  constructor(private readonly clinicSettingsService: ClinicSettingsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Shiko konfigurimin e klinikës (orari i activeInClinic)' })
  getSettings() {
    return this.clinicSettingsService.getSettings();
  }

  @Patch()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Ndrysho orarin e pranisë në klinikë dhe/ose bonusin për trajtim të kompletuar — vetëm ADMIN' })
  update(@Body() dto: UpdateClinicSettingsDto, @CurrentUser() user: any) {
    return this.clinicSettingsService.update(dto, user.id);
  }
}
