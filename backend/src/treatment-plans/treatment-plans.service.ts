import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTreatmentPlanDto } from './dto/create-treatment-plan.dto';
import { UpdateTreatmentPlanDto } from './dto/update-treatment-plan.dto';
import { PaginationDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import { Decimal } from '@prisma/client/runtime/library';
import { Role } from '@prisma/client';
import { computePlanFinancials } from '../payments/plan-financials.util';
import { recalculatePatientStatus } from '../patients/patient-status.util';
import { generateTreatmentPlanNotes } from './notes-generator.util';
import { PushService } from '../push/push.service';
import { GeminiService } from '../ai/gemini.service';

@Injectable()
export class TreatmentPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
    private readonly geminiService: GeminiService,
  ) {}

  async generateNotes(diagnosis?: string, treatmentTypes?: string[], totalSessions?: number, existingNotes?: string, complaints?: string[], selectedDiagnoses?: string[]): Promise<{ text: string; source: 'gemini' | 'fallback' }> {
    if (!diagnosis?.trim()) throw new BadRequestException('Diagnoza është e detyrueshme për gjenerim');
    const aiText = await this.geminiService.generateTreatmentPlan({ diagnosis, treatmentTypes: treatmentTypes || [], totalSessions, existingNotes, complaints, selectedDiagnoses });
    if (aiText) return { text: aiText, source: 'gemini' };
    const fallback = generateTreatmentPlanNotes(diagnosis, treatmentTypes || [], totalSessions, existingNotes, complaints, selectedDiagnoses);
    return { text: fallback, source: 'fallback' };
  }

  async findAll(dto: PaginationDto & { patientId?: string; branchId?: string; dateFrom?: string; dateTo?: string }, user: any) {
    const page = Number(dto.page) || 1;
    const limit = Number(dto.limit) || 24;
    const { search, patientId, branchId, dateFrom, dateTo } = dto;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };
    const and: any[] = [];
    if (patientId) where.patientId = patientId;
    if (dateFrom || dateTo) {
      const createdAtFilter: any = {};
      if (dateFrom) createdAtFilter.gte = new Date(dateFrom);
      if (dateTo) createdAtFilter.lte = new Date(`${dateTo}T23:59:59`);
      where.createdAt = createdAtFilter;
    }
    if (search) {
      and.push({
        OR: [
          { diagnosis: { contains: search, mode: 'insensitive' } },
          { patient: { firstName: { contains: search, mode: 'insensitive' } } },
          { patient: { lastName: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }
    if (branchId) {
      where.patient = { branchId };
    }

    if (user.role === Role.MANAGER) {
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      where.patient = { ...where.patient, branchId: { in: userBranchIds } };
    } else if (user.role === Role.PHYSIOTHERAPIST) {
      // A physiotherapist must see every plan they could plausibly act on —
      // not just ones already explicitly assigned to them, since a plan can
      // be created with no assigned physio and the physio is only chosen
      // session-by-session. Branch membership is the baseline; explicit
      // assignment or having logged a session on it always grants access too.
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      and.push({
        OR: [
          { assignedPhysiotherapistId: user.id },
          { sessions: { some: { physiotherapistId: user.id } } },
          { patient: { branchId: { in: userBranchIds } } },
        ],
      });
    }
    if (and.length) where.AND = and;

    const [plans, total] = await Promise.all([
      this.prisma.treatmentPlan.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          patient: {
            include: { branch: { select: { id: true, name: true } } },
          },
          branch: { select: { id: true, name: true } },
          assignedPhysiotherapist: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { sessions: true, treatments: true, payments: true } },
        },
      }),
      this.prisma.treatmentPlan.count({ where }),
    ]);

    return { data: plans, meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(id: string, user: any) {
    const plan = await this.prisma.treatmentPlan.findFirst({
      where: { id, deletedAt: null },
      include: {
        patient: { include: { branch: true } },
        branch: { select: { id: true, name: true } },
        assignedPhysiotherapist: { select: { id: true, firstName: true, lastName: true } },
        sessions: {
          where: { deletedAt: null },
          orderBy: { scheduledAt: 'desc' },
          include: {
            physiotherapist: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        treatments: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
        },
        payments: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!plan) throw new NotFoundException('Plani i trajtimit nuk u gjet');

    if (user.role === Role.MANAGER) {
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      if (!userBranchIds.includes(plan.patient.branchId)) {
        throw new ForbiddenException('Nuk keni qasje në këtë plan trajtimi');
      }
    } else if (user.role === Role.PHYSIOTHERAPIST) {
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      const isInvolved =
        plan.assignedPhysiotherapistId === user.id ||
        plan.sessions.some((s: any) => s.physiotherapistId === user.id) ||
        userBranchIds.includes(plan.patient.branchId);
      if (!isInvolved) {
        throw new ForbiddenException('Nuk keni qasje në këtë plan trajtimi');
      }
    }

    return plan;
  }

  async create(dto: CreateTreatmentPlanDto, user: any) {
    const { totalSessions, sessionFee, totalAmount: manualTotalAmount, assignedPhysiotherapistId, branchId: _ignoredBranchId, startDate, ...rest } = dto;

    // Only ADMIN may create a Kontrollë (TreatmentPlan) — Manager and
    // Physiotherapist are read-only on this resource by design.
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Vetëm administratori mund të krijojë një kontrollë');
    }

    // Never rely on the frontend alone to fill this in — a plan must always
    // have a start date, defaulting to right now if none was sent.
    const resolvedStartDate = startDate ? new Date(startDate) : new Date();

    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, deletedAt: null },
      include: { branch: { select: { sessionPrice: true } } },
    });
    if (!patient) throw new NotFoundException('Pacienti nuk u gjet');

    // Branch is never a client-trusted value — it always comes from the
    // patient's own branch, for every role. A client-sent branchId is
    // ignored entirely (see _ignoredBranchId above).
    const branchId = patient.branchId;

    // Pricing default comes from the patient's own branch's single
    // sessionPrice — never a hardcoded global. The clinic can still
    // override it per-plan for a special case.
    const resolvedSessionFee = sessionFee ?? Number(patient.branch.sessionPrice);
    let finalAssignedPhysiotherapistId: string | undefined = assignedPhysiotherapistId;

    if (finalAssignedPhysiotherapistId) {
      const physio = await this.prisma.user.findFirst({
        where: { id: finalAssignedPhysiotherapistId, deletedAt: null },
      });
      if (!physio) throw new NotFoundException('Fizioterapeuti nuk u gjet');
      if (physio.role !== Role.PHYSIOTHERAPIST) {
        throw new BadRequestException('Përdoruesi i caktuar nuk është fizioterapeut');
      }
    }

    // Single price drives the whole plan now: totalValue = totalSessions * sessionFee.
    const totalAmount = manualTotalAmount !== undefined
      ? new Decimal(manualTotalAmount)
      : new Decimal(resolvedSessionFee).times(totalSessions);

    const plan = await this.prisma.treatmentPlan.create({
      data: {
        ...rest,
        totalSessions,
        sessionFee: resolvedSessionFee,
        totalAmount,
        startDate: resolvedStartDate,
        branchId,
        assignedPhysiotherapistId: finalAssignedPhysiotherapistId,
        createdByUserId: user.id,
      },
      include: {
        patient: { include: { branch: { select: { id: true, name: true } } } },
        branch: { select: { id: true, name: true } },
        assignedPhysiotherapist: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // A brand-new plan is never already complete, so this always lands on
    // IN_TREATMENT — but routing through the shared recalculation keeps the
    // "derived from all plans" rule in one place instead of two.
    await recalculatePatientStatus(this.prisma, plan.patientId);

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'CREATE',
        entity: 'treatment_plan',
        entityId: plan.id,
        newData: { createdByUserId: user.id, role: user.role, patientId: plan.patientId, branchId: plan.branchId },
      },
    });

    await this.notifyPlanCreated(plan, user);

    return plan;
  }

  async update(id: string, dto: UpdateTreatmentPlanDto, user: any) {
    // Only ADMIN may modify a Kontrollë — Manager and Physiotherapist are
    // read-only on this resource by design.
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Vetëm administratori mund të modifikojë një kontrollë');
    }

    const existing = await this.findOne(id, user);
    const data: any = { ...dto };

    // Branch is never a client-trusted value on update either — it only
    // ever changes as a side effect of changing the patient, below.
    delete data.branchId;

    if (data.patientId && data.patientId !== existing.patientId) {
      const newPatient = await this.prisma.patient.findFirst({
        where: { id: data.patientId, deletedAt: null },
      });
      if (!newPatient) throw new NotFoundException('Pacienti nuk u gjet');
      data.branchId = newPatient.branchId;
    }

    if (data.assignedPhysiotherapistId) {
      const physio = await this.prisma.user.findFirst({
        where: { id: data.assignedPhysiotherapistId, deletedAt: null },
      });
      if (!physio) throw new NotFoundException('Fizioterapeuti nuk u gjet');
      if (physio.role !== Role.PHYSIOTHERAPIST) {
        throw new BadRequestException('Përdoruesi i caktuar nuk është fizioterapeut');
      }
    }

    // Pricing: if the caller explicitly sends totalAmount, that's a manual
    // clinic-special-price override — trust it as-is. Otherwise, if any of
    // the pricing inputs (totalSessions/sessionFee) changed, recompute
    // totalAmount from the merged (existing + incoming) values so it never
    // goes stale relative to what's actually being charged.
    if (data.totalAmount === undefined) {
      const touchesPricing = ['totalSessions', 'sessionFee'].some((k) => data[k] !== undefined);
      if (touchesPricing) {
        const totalSessions = data.totalSessions ?? existing.totalSessions;
        const sessionFee = data.sessionFee ?? Number(existing.sessionFee.toString());
        data.totalAmount = new Decimal(sessionFee).times(totalSessions);
      }
    }

    const updated = await this.prisma.treatmentPlan.update({
      where: { id },
      data,
      include: {
        patient: { include: { branch: { select: { id: true, name: true } } } },
        branch: { select: { id: true, name: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE',
        entity: 'treatment_plan',
        entityId: id,
        oldData: {
          totalSessions: existing.totalSessions,
          sessionFee: existing.sessionFee.toString(), totalAmount: existing.totalAmount.toString(),
        },
        newData: {
          totalSessions: updated.totalSessions,
          sessionFee: updated.sessionFee.toString(), totalAmount: updated.totalAmount.toString(),
        },
      },
    });

    if ('assignedPhysiotherapistId' in data && data.assignedPhysiotherapistId !== existing.assignedPhysiotherapistId) {
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'UPDATE',
          entity: 'treatment_plan',
          entityId: id,
          oldData: { assignedPhysiotherapistId: existing.assignedPhysiotherapistId },
          newData: { assignedPhysiotherapistId: data.assignedPhysiotherapistId },
        },
      });

      if (data.assignedPhysiotherapistId) {
        const newPhysioId = data.assignedPhysiotherapistId as string;
        const patientName = `${(updated as any).patient.firstName} ${(updated as any).patient.lastName}`;
        try {
          await this.prisma.notification.create({
            data: {
              userId: newPhysioId,
              senderId: user.id,
              type: 'PLAN_CREATED' as any,
              title: 'Kontrollë e caktuar',
              message: `Jeni caktuar në kontrollën e pacientit ${patientName}`,
              data: { treatmentPlanId: id, patientId: (updated as any).patientId },
            },
          });
          this.pushService.sendToUsers([newPhysioId], {
            title: 'Kontrollë e caktuar',
            body: `Jeni caktuar në kontrollën e pacientit ${patientName}`,
            url: `/pacientet/${(updated as any).patientId}`,
            tag: `plan-assigned-${id}`,
          }).catch(() => {});
        } catch {}
      }
    }

    // totalSessions may have changed in a way that flips this plan between
    // "still going" and "done" — re-derive the patient's overall status
    // from every one of their plans, not just this one.
    await recalculatePatientStatus(this.prisma, updated.patientId);

    return updated;
  }

  async remove(id: string, user: any) {
    // Only ADMIN may delete a Kontrollë.
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Vetëm administratori mund të fshijë një kontrollë');
    }

    const existing = await this.findOne(id, user);
    // Soft delete only — sessions/payments keep referencing this plan by id
    // for historical/invoice purposes, they just stop showing it as active.
    await this.prisma.treatmentPlan.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'DELETE',
        entity: 'treatment_plan',
        entityId: id,
        oldData: { patientId: existing.patientId, totalAmount: existing.totalAmount.toString(), sessionsCount: existing.sessions.length, paymentsCount: existing.payments.length },
      },
    });

    // Deleting a plan can remove the only thing keeping a patient
    // IN_TREATMENT, or can remove a completed plan leaving others active —
    // recompute rather than assume.
    await recalculatePatientStatus(this.prisma, existing.patientId);

    return { message: 'Plani i trajtimit u fshi me sukses' };
  }

  private async notifyPlanCreated(plan: any, creator: any) {
    try {
      const branchId = plan.patient.branchId;
      const recipientIds = new Set<string>();

      if (creator.role === Role.MANAGER) {
        // Manager created it -> notify all admins
        const admins = await this.prisma.user.findMany({
          where: { role: Role.ADMIN, deletedAt: null },
          select: { id: true },
        });
        admins.forEach((a) => recipientIds.add(a.id));
      } else {
        // Admin created it -> notify the branch's manager(s)
        const managerLinks = await this.prisma.userBranch.findMany({
          where: { branchId },
          include: { user: { select: { id: true, role: true } } },
        });
        managerLinks
          .filter((ub) => ub.user.role === Role.MANAGER)
          .forEach((ub) => recipientIds.add(ub.user.id));
      }

      // Only notify a physiotherapist if one was actually assigned
      if (plan.assignedPhysiotherapistId) recipientIds.add(plan.assignedPhysiotherapistId);

      recipientIds.delete(creator.id);

      if (recipientIds.size) {
        const ids = Array.from(recipientIds);
        await this.prisma.notification.createMany({
          data: ids.map((userId) => ({
            userId,
            senderId: creator.id,
            type: 'PLAN_CREATED' as any,
            title: 'Kontrollë e re',
            message: `Kontrollë e re u krijua për ${plan.patient.firstName} ${plan.patient.lastName}`,
            data: { treatmentPlanId: plan.id, patientId: plan.patientId },
          })),
        });
        this.pushService.sendToUsers(ids, {
          title: 'Kontrollë e re',
          body: `${plan.patient.firstName} ${plan.patient.lastName}`,
          url: `/pacientet/${plan.patientId}`,
          tag: `plan-created-${plan.id}`,
        }).catch(() => {});
      }
    } catch {}
  }

  async getSummary(id: string, user: any) {
    const plan = await this.findOne(id, user);
    return {
      totalSessions: plan.totalSessions,
      completedSessions: plan.completedSessions,
      remainingSessions: plan.totalSessions - plan.completedSessions,
      totalAmount: plan.totalAmount,
      amountPaid: plan.amountPaid,
      remainingBalance: new Decimal(plan.totalAmount.toString()).minus(plan.amountPaid.toString()),
      paymentStatus: plan.paymentStatus,
      ...computePlanFinancials(plan),
    };
  }
}
