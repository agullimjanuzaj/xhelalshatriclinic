import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BranchesModule } from './branches/branches.module';
import { PatientsModule } from './patients/patients.module';
import { TreatmentPlansModule } from './treatment-plans/treatment-plans.module';
import { SessionsModule } from './sessions/sessions.module';
import { TreatmentsModule } from './treatments/treatments.module';
import { PaymentsModule } from './payments/payments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';
import { PdfModule } from './pdf/pdf.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { ClinicSettingsModule } from './clinic-settings/clinic-settings.module';
import { TreatmentTypesModule } from './treatment-types/treatment-types.module';
import { ComplaintsModule } from './complaints/complaints.module';
import { SuggestedConditionsModule } from './suggested-conditions/suggested-conditions.module';
import { SuggestionsModule } from './suggestions/suggestions.module';
import { PushModule } from './push/push.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.THROTTLE_TTL || '60000'),
        limit: parseInt(process.env.THROTTLE_LIMIT || '100'),
      },
    ]),
    PrismaModule,
    AiModule,
    PushModule,
    AuthModule,
    UsersModule,
    BranchesModule,
    ClinicSettingsModule,
    TreatmentTypesModule,
    ComplaintsModule,
    SuggestedConditionsModule,
    SuggestionsModule,
    PatientsModule,
    TreatmentPlansModule,
    SessionsModule,
    TreatmentsModule,
    PaymentsModule,
    NotificationsModule,
    ReportsModule,
    PdfModule,
    DashboardModule,
    AuditLogsModule,
  ],
})
export class AppModule {}
