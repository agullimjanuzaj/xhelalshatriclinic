import { Module } from '@nestjs/common';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { PatientExpiryService } from './patient-expiry.service';
import { ClinicSettingsModule } from '../clinic-settings/clinic-settings.module';

@Module({
  imports: [ClinicSettingsModule],
  controllers: [PatientsController],
  providers: [PatientsService, PatientExpiryService],
  exports: [PatientsService, PatientExpiryService],
})
export class PatientsModule {}
