import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PatientExpiryService {
  private readonly logger = new Logger(PatientExpiryService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Primary mechanism: runs unconditionally every 5 minutes so a patient's
  // "active in clinic" tick reverts on its own even if nobody ever opens a
  // patient list again. The lazy check elsewhere is just a safety net for
  // the gap between cron ticks.
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron() {
    const count = await this.expireActiveInClinicPatients();
    if (count > 0) this.logger.log(`Auto-expired activeInClinic for ${count} patient(s)`);
  }

  async expireActiveInClinicPatients(): Promise<number> {
    const now = new Date();
    const expired = await this.prisma.patient.findMany({
      where: { activeInClinic: true, activeInClinicExpiresAt: { lte: now }, deletedAt: null },
      select: { id: true },
    });
    if (!expired.length) return 0;

    const ids = expired.map((p) => p.id);
    await this.prisma.patient.updateMany({
      where: { id: { in: ids } },
      data: { activeInClinic: false, activeInClinicSince: null, activeInClinicExpiresAt: null },
    });

    await this.prisma.auditLog.createMany({
      data: ids.map((id) => ({
        action: 'UPDATE' as const,
        entity: 'patient',
        entityId: id,
        oldData: { activeInClinic: true },
        newData: { activeInClinic: false, reason: 'auto-expired' },
      })),
    });

    return ids.length;
  }
}
