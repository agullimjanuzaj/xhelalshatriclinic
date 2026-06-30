import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateClinicSettingsDto } from './dto/update-clinic-settings.dto';

@Injectable()
export class ClinicSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // The settings table is a singleton — exactly one row always exists.
  // Created lazily on first read so there's no separate seed step to forget.
  async getSettings() {
    const existing = await this.prisma.clinicSettings.findFirst();
    if (existing) return existing;
    return this.prisma.clinicSettings.create({ data: {} });
  }

  async getAutoExpireHours(): Promise<number> {
    const settings = await this.getSettings();
    return settings.activeInClinicAutoExpireHours;
  }

  async getBonusPerCompletedSession(): Promise<number> {
    const settings = await this.getSettings();
    return Number(settings.bonusPerCompletedSession);
  }

  // Single PATCH endpoint backs two independent admin-editable settings —
  // either field may be sent on its own. activeInClinicAutoExpireHours
  // triggers the check-in-countdown rebase side effect; bonusPerCompletedSession
  // (set only from Reports → "Bonuset") is a plain value swap.
  async update(dto: UpdateClinicSettingsDto, userId: string) {
    const settings = await this.getSettings();
    const data: any = { updatedByUserId: userId };
    const oldData: any = {};
    const newData: any = {};

    if (dto.bonusPerCompletedSession !== undefined) {
      data.bonusPerCompletedSession = dto.bonusPerCompletedSession;
      oldData.bonusPerCompletedSession = settings.bonusPerCompletedSession.toString();
      newData.bonusPerCompletedSession = dto.bonusPerCompletedSession;
    }

    if (dto.activeInClinicAutoExpireHours !== undefined) {
      data.activeInClinicAutoExpireHours = dto.activeInClinicAutoExpireHours;
      oldData.activeInClinicAutoExpireHours = settings.activeInClinicAutoExpireHours;
      newData.activeInClinicAutoExpireHours = dto.activeInClinicAutoExpireHours;
    }

    const updated = await this.prisma.clinicSettings.update({ where: { id: settings.id }, data });

    if (dto.activeInClinicAutoExpireHours !== undefined) {
      await this.rebaseActiveInClinicCountdowns(dto.activeInClinicAutoExpireHours);
    }

    await this.prisma.auditLog.create({
      data: { userId, action: 'UPDATE', entity: 'clinic_settings', entityId: settings.id, oldData, newData },
    });

    return updated;
  }

  // Every patient currently checked in needs their countdown rebased on the
  // new duration, measured from when they actually checked in — not reset to
  // "now", or extending the window would let an old check-in silently
  // outlive what the new policy intends.
  private async rebaseActiveInClinicCountdowns(hours: number) {
    const activePatients = await this.prisma.patient.findMany({
      where: { activeInClinic: true, deletedAt: null },
      select: { id: true, activeInClinicSince: true },
    });

    const now = new Date();
    for (const p of activePatients) {
      if (!p.activeInClinicSince) continue;
      const newExpiresAt = new Date(p.activeInClinicSince.getTime() + hours * 60 * 60 * 1000);
      if (newExpiresAt <= now) {
        await this.prisma.patient.update({
          where: { id: p.id },
          data: { activeInClinic: false, activeInClinicSince: null, activeInClinicExpiresAt: null },
        });
      } else {
        await this.prisma.patient.update({
          where: { id: p.id },
          data: { activeInClinicExpiresAt: newExpiresAt },
        });
      }
    }
  }
}
