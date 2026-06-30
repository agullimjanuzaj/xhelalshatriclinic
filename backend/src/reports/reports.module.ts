import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ClinicSettingsModule } from '../clinic-settings/clinic-settings.module';

@Module({
  imports: [ClinicSettingsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
