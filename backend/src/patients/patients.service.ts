import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PaginationDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import { Role } from '@prisma/client';
import { computePlanFinancials } from '../payments/plan-financials.util';
import { ClinicSettingsService } from '../clinic-settings/clinic-settings.service';
import { PushService } from '../push/push.service';

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clinicSettingsService: ClinicSettingsService,
    private readonly pushService: PushService,
  ) {}

  async findAll(
    dto: PaginationDto & { branchId?: string; gender?: string; activeInClinic?: boolean | string; status?: string },
    user: any,
  ) {
    const page = Number(dto.page) || 1;
    const limit = Number(dto.limit) || 24;
    const { search, branchId, gender, activeInClinic, status } = dto;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };
    const and: any[] = [];

    // Explicit opt-in filter — the session-creation patient picker passes
    // this so a physiotherapist can only ever choose a patient who is
    // physically checked in right now. Other patient list views leave it
    // off so full branch history stays browsable.
    if (activeInClinic !== undefined) {
      const wantActive = activeInClinic === true || activeInClinic === 'true';
      where.activeInClinic = wantActive;
      // Guard against the gap between cron ticks — a patient whose window
      // has technically lapsed must never show up as "active" just because
      // the background job hasn't caught up yet.
      if (wantActive) where.activeInClinicExpiresAt = { gt: new Date() };
    }
    if (status) where.status = status;

    if (user.role === Role.MANAGER) {
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      if (branchId && !userBranchIds.includes(branchId)) {
        throw new ForbiddenException('Nuk keni qasje në këtë degë');
      }
      where.branchId = branchId || { in: userBranchIds };
    } else if (user.role === Role.PHYSIOTHERAPIST) {
      // Same reasoning as treatment-plans: a physio must be able to find any
      // patient in their own branch(es) to register a session for them, not
      // just patients they already have a session/assignment history with.
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      and.push({
        OR: [
          { sessions: { some: { physiotherapistId: user.id } } },
          { treatmentPlans: { some: { assignedPhysiotherapistId: user.id } } },
          { branchId: { in: userBranchIds } },
        ],
      });
    } else if (branchId) {
      where.branchId = branchId;
    }

    if (gender) where.gender = gender;
    if (search) {
      and.push({
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
        ],
      });
    }
    if (and.length) where.AND = and;

    const [patients, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          branch: { select: { id: true, name: true, city: true } },
          _count: { select: { treatmentPlans: true, sessions: true } },
        },
      }),
      this.prisma.patient.count({ where }),
    ]);

    return { data: patients, meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(id: string, user: any) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, deletedAt: null },
      include: {
        branch: true,
        treatmentPlans: {
          where: { deletedAt: null },
          include: {
            _count: { select: { sessions: true } },
            assignedPhysiotherapist: { select: { id: true, firstName: true, lastName: true } },
            createdByUser: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        sessions: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 200,
          include: {
            physiotherapist: { select: { id: true, firstName: true, lastName: true } },
            completedByUser: { select: { id: true, firstName: true, lastName: true } },
            treatmentPlan: { select: { id: true, diagnosis: true } },
            payment: { select: { id: true, invoiceNumber: true } },
          },
        },
        payments: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 200,
          include: {
            treatmentPlan: { select: { id: true, diagnosis: true } },
            createdByUser: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!patient) throw new NotFoundException('Pacienti nuk u gjet');

    if (user.role === Role.MANAGER) {
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      if (!userBranchIds.includes(patient.branchId)) {
        throw new ForbiddenException('Nuk keni qasje në këtë pacient');
      }
    } else if (user.role === Role.PHYSIOTHERAPIST) {
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      const isAssigned =
        patient.sessions.some((s: any) => s.physiotherapistId === user.id) ||
        patient.treatmentPlans.some((p: any) => p.assignedPhysiotherapistId === user.id) ||
        userBranchIds.includes(patient.branchId);
      if (!isAssigned) {
        throw new ForbiddenException('Nuk keni qasje në këtë pacient');
      }
    }

    // Aggregate financials across every plan, plus per-plan figures so the
    // patient page can show both an overall picture and a treatment-by-
    // treatment breakdown without the frontend re-deriving the math.
    const plansWithFinancials = patient.treatmentPlans.map((p: any) => ({
      ...p,
      financials: computePlanFinancials(p),
    }));
    const financials = plansWithFinancials.reduce(
      (acc: any, p: any) => ({
        totalTreatmentValue: acc.totalTreatmentValue + p.financials.totalTreatmentValue,
        currentEarnedAmount: acc.currentEarnedAmount + p.financials.currentEarnedAmount,
        totalPaidAmount: acc.totalPaidAmount + p.financials.totalPaidAmount,
        currentDebt: acc.currentDebt + p.financials.currentDebt,
        finalRemainingBalance: acc.finalRemainingBalance + p.financials.finalRemainingBalance,
        prepaidAmount: acc.prepaidAmount + p.financials.prepaidAmount,
      }),
      { totalTreatmentValue: 0, currentEarnedAmount: 0, totalPaidAmount: 0, currentDebt: 0, finalRemainingBalance: 0, prepaidAmount: 0 },
    );
    let paymentStatus: string = 'UNPAID';
    if (financials.totalPaidAmount > 0 && financials.totalPaidAmount >= financials.totalTreatmentValue) paymentStatus = 'PAID';
    else if (financials.totalPaidAmount > 0) paymentStatus = 'PARTIALLY_PAID';

    return { ...patient, treatmentPlans: plansWithFinancials, financials: { ...financials, paymentStatus } };
  }

  async create(dto: CreatePatientDto, user: any) {
    // Manager can only create for their branch
    if (user.role === Role.MANAGER) {
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      if (!userBranchIds.includes(dto.branchId)) {
        throw new ForbiddenException('Nuk mund të regjistroni pacient në këtë degë');
      }
    }

    // A manager registers a patient because they're physically at the front
    // desk right now — default that tick on. Admin can register a patient
    // who isn't present yet (e.g. pre-registration over the phone).
    const activeInClinic = dto.activeInClinic ?? (user.role === Role.MANAGER ? true : false);
    const since = activeInClinic ? new Date() : null;
    const expiresAt = activeInClinic ? await this.computeExpiresAt(since as Date) : null;

    const patient = await this.prisma.patient.create({
      data: { ...dto, activeInClinic, status: null, activeInClinicSince: since, activeInClinicExpiresAt: expiresAt },
      include: { branch: { select: { id: true, name: true } } },
    });

    if (activeInClinic) {
      await this.prisma.notification.createMany({
        data: await this.getAdminUserIds().then((ids) =>
          ids.map((userId) => ({
            userId,
            senderId: user.id,
            type: 'NEW_PATIENT' as any,
            title: 'Pacient i ri i regjistruar',
            message: `${patient.firstName} ${patient.lastName} u regjistrua në degën ${patient.branch?.name}`,
            data: { patientId: patient.id },
          })),
        ),
      });
      // A brand-new patient registered as already-active is the same event
      // branch physiotherapists need to know about as the toggle below.
      await this.notifyPatientActive(patient, user);
    }

    return patient;
  }

  async setActiveInClinic(id: string, activeInClinic: boolean, user: any) {
    const existing = await this.findOne(id, user);

    const since = activeInClinic ? new Date() : null;
    const expiresAt = activeInClinic ? await this.computeExpiresAt(since as Date) : null;

    const updated = await this.prisma.patient.update({
      where: { id },
      data: { activeInClinic, activeInClinicSince: since, activeInClinicExpiresAt: expiresAt },
      include: { branch: { select: { id: true, name: true } } },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE',
        entity: 'patient',
        entityId: id,
        oldData: { activeInClinic: existing.activeInClinic },
        newData: { activeInClinic, activeInClinicExpiresAt: expiresAt },
      },
    });

    // Only the false -> true transition is news to anyone — re-toggling an
    // already-active patient (e.g. a stale UI re-sending the same value, or
    // a refetch) must never re-notify.
    if (activeInClinic && !existing.activeInClinic) {
      await this.notifyPatientActive(updated, user);
    }

    return updated;
  }

  private async notifyPatientActive(patient: { id: string; firstName: string; lastName: string; branchId: string; branch?: { name: string } | null }, user: any) {
    try {
      const [physioIds, adminIds] = await Promise.all([
        this.prisma.userBranch.findMany({
          where: { branchId: patient.branchId, user: { role: 'PHYSIOTHERAPIST', deletedAt: null } },
          select: { userId: true },
        }),
        this.getAdminUserIds(),
      ]);
      const recipientIds = new Set([...physioIds.map((p) => p.userId), ...adminIds]);
      recipientIds.delete(user.id); // don't notify the person who just did it

      if (!recipientIds.size) return;

      const ids = Array.from(recipientIds);
      await this.prisma.notification.createMany({
        data: ids.map((userId) => ({
          userId,
          senderId: user.id,
          type: 'PATIENT_ACTIVE' as any,
          title: 'Pacienti është aktiv në klinikë',
          message: `${patient.firstName} ${patient.lastName} është aktiv në klinikë (Dega: ${patient.branch?.name || '—'}).`,
          data: { patientId: patient.id },
        })),
      });
      this.pushService.sendToUsers(ids, {
        title: 'Pacienti është aktiv',
        body: `${patient.firstName} ${patient.lastName} — ${patient.branch?.name || ''}`,
        url: `/pacientet/${patient.id}`,
        tag: `patient-active-${patient.id}`,
      }).catch(() => {});
    } catch {
      // Notifications are best-effort — never let a failure here block the
      // actual activeInClinic toggle from succeeding.
    }
  }

  private async computeExpiresAt(since: Date): Promise<Date> {
    const hours = await this.clinicSettingsService.getAutoExpireHours();
    return new Date(since.getTime() + hours * 60 * 60 * 1000);
  }

  async update(id: string, dto: UpdatePatientDto, user: any) {
    const existing = await this.findOne(id, user);

    // Strip fields that are managed via dedicated endpoints or are
    // auto-computed — passing them through a general update corrupts state.
    const { activeInClinic, activeInClinicSince, activeInClinicExpiresAt, status, ...safeDto } = dto as any;
    const data: any = { ...safeDto };

    if (user.role === Role.MANAGER) {
      // Manager can never move a patient to a branch outside their own.
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      if (data.branchId && !userBranchIds.includes(data.branchId)) {
        throw new ForbiddenException('Nuk mund ta transferoni pacientin në një degë tjetër');
      }
    }

    const updated = await this.prisma.patient.update({
      where: { id },
      data,
      include: { branch: { select: { id: true, name: true } } },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE',
        entity: 'patient',
        entityId: id,
        oldData: { firstName: existing.firstName, lastName: existing.lastName, phone: existing.phone, branchId: existing.branchId, status: existing.status },
        newData: { firstName: updated.firstName, lastName: updated.lastName, phone: updated.phone, branchId: updated.branchId, status: updated.status },
      },
    });

    return updated;
  }

  async remove(id: string, user: any) {
    const existing = await this.findOne(id, user);
    await this.prisma.patient.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'DELETE',
        entity: 'patient',
        entityId: id,
        oldData: { firstName: existing.firstName, lastName: existing.lastName, branchId: existing.branchId },
      },
    });
    return { message: 'Pacienti u fshi me sukses' };
  }

  private async getAdminUserIds(): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', deletedAt: null },
      select: { id: true },
    });
    return admins.map((a) => a.id);
  }
}
