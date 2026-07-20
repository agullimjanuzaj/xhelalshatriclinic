import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { CompleteSessionDto } from './dto/complete-session.dto';
import { UpdateSessionPriceDto } from './dto/update-session-price.dto';
import { PaginationDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import { SessionStatus, Role } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { recalculatePatientStatus } from '../patients/patient-status.util';
import { generateSessionRecommendation } from './recommendation-generator.util';
import { PushService } from '../push/push.service';
import { GeminiService, GenerateSessionNoteInput } from '../ai/gemini.service';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
    private readonly geminiService: GeminiService,
  ) {}

  async generateRecommendation(notes?: string, treatmentTypes?: string[]): Promise<{ text: string; source: 'gemini' | 'fallback' }> {
    const aiText = await this.geminiService.generateRecommendation({ notes, treatmentTypes });
    if (aiText) return { text: aiText, source: 'gemini' };
    const fallback = generateSessionRecommendation(notes, treatmentTypes);
    return { text: fallback, source: 'fallback' };
  }

  async generateSessionNote(input: GenerateSessionNoteInput): Promise<{ text: string; source: 'gemini' | 'fallback' }> {
    if (!input.treatmentTypes?.length) throw new BadRequestException('Zgjidhni të paktën një lloj trajtimi');
    const aiText = await this.geminiService.generateSessionNote(input);
    if (aiText) {
      this.logger.log('GEMINI USED - Session Note');
      return { text: aiText, source: 'gemini' };
    }
    this.logger.warn('FALLBACK USED - Session Note');
    const fallback = `Seanca u realizua sipas planit të trajtimit. U aplikuan: ${input.treatmentTypes.join(', ')}.`;
    return { text: fallback, source: 'fallback' };
  }

  async findAll(
    dto: PaginationDto & { branchId?: string; patientId?: string; treatmentPlanId?: string; physiotherapistId?: string; status?: SessionStatus; isPaid?: boolean | string; dateFrom?: string; dateTo?: string },
    user: any,
  ) {
    const page = Number(dto.page) || 1;
    const limit = Number(dto.limit) || 24;
    let { branchId } = dto;
    const { search, patientId, treatmentPlanId, physiotherapistId, status, isPaid, dateFrom, dateTo } = dto;
    const skip = (page - 1) * limit;

    // Manager can only ever see their own branch, regardless of what's requested
    if (user.role === 'MANAGER') {
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      branchId = userBranchIds[0];
    }

    const where: any = { deletedAt: null };
    const and: any[] = [];
    if (branchId) where.branchId = branchId;
    if (patientId) where.patientId = patientId;
    if (treatmentPlanId) where.treatmentPlanId = treatmentPlanId;
    if (status) where.status = status;
    if (isPaid !== undefined) where.isPaid = isPaid === true || isPaid === 'true';

    // Filtering "by physiotherapist" matches either the assigned
    // physiotherapist or whoever actually completed/recorded the session
    // (e.g. an Admin standing in) — picking one person in the filter should
    // surface everything they're associated with, not just plan assignment.
    if (physiotherapistId) {
      and.push({ OR: [{ physiotherapistId }, { completedByUserId: physiotherapistId }] });
    }

    if (search) {
      and.push({
        OR: [
          { patient: { firstName: { contains: search, mode: 'insensitive' } } },
          { patient: { lastName: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }

    if (dateFrom || dateTo) {
      // Sessions are normally created already-COMPLETED with no explicit
      // scheduledAt, so filtering on scheduledAt alone silently excludes
      // almost every session ("Seancat sot" reading 0 despite a session
      // existing). completedAt is the real "when did this happen" — and for
      // the rare not-yet-completed session, fall back to createdAt.
      const range: any = {};
      if (dateFrom) range.gte = new Date(dateFrom);
      if (dateTo) range.lte = new Date(dateTo);
      and.push({ OR: [{ completedAt: range }, { completedAt: null, createdAt: range }] });
    }

    // Restrict physiotherapist to sessions they're assigned to OR actually
    // completed (assignment can be blank while completedByUserId is always
    // the person who did the work).
    if (user.role === 'PHYSIOTHERAPIST') {
      and.push({ OR: [{ physiotherapistId: user.id }, { completedByUserId: user.id }] });
    }

    if (and.length) where.AND = and;

    const [sessions, total] = await Promise.all([
      this.prisma.session.findMany({
        where,
        skip,
        take: limit,
        // scheduledAt is frequently null (sessions are usually created
        // already-completed, with no explicit scheduled time) and Postgres
        // sorts nulls first on DESC — meaning most sessions would float to
        // the top regardless of how recent they actually are. createdAt is
        // never null and reflects real recency for every session.
        orderBy: { createdAt: 'desc' },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
          branch: { select: { id: true, name: true } },
          physiotherapist: { select: { id: true, firstName: true, lastName: true } },
          completedByUser: { select: { id: true, firstName: true, lastName: true } },
          treatmentPlan: { select: { id: true, totalSessions: true, completedSessions: true, paymentStatus: true, amountPaid: true } },
        },
      }),
      this.prisma.session.count({ where }),
    ]);

    return { data: sessions, meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(id: string, user: any) {
    const session = await this.prisma.session.findFirst({
      where: { id, deletedAt: null },
      include: {
        patient: { include: { branch: true } },
        branch: true,
        physiotherapist: { select: { id: true, firstName: true, lastName: true, username: true } },
        completedByUser: { select: { id: true, firstName: true, lastName: true, username: true } },
        treatmentPlan: true,
        treatments: { where: { deletedAt: null } },
      },
    });
    if (!session) throw new NotFoundException('Seanca nuk u gjet');

    if (user.role === Role.MANAGER) {
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      if (!userBranchIds.includes(session.branchId)) {
        throw new ForbiddenException('Nuk keni qasje në këtë seancë');
      }
    } else if (user.role === Role.PHYSIOTHERAPIST) {
      if (session.physiotherapistId !== user.id && session.completedByUserId !== user.id) {
        throw new ForbiddenException('Nuk keni qasje në këtë seancë');
      }
    }

    return session;
  }

  async create(dto: CreateSessionDto, user: any) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, deletedAt: null },
    });
    if (!patient) throw new NotFoundException('Pacienti nuk u gjet');

    // A physiotherapist can only register a session for a patient who is
    // physically checked in at the clinic right now — enforced here too,
    // not just hidden from the picker, so a stale/forged request can't
    // bypass the front-desk check. Check the expiry timestamp directly
    // rather than trusting the boolean alone — the cron that flips it back
    // to false runs every 5 minutes, so the flag can be briefly stale.
    if (user.role === Role.PHYSIOTHERAPIST) {
      const isActiveNow = patient.activeInClinic && patient.activeInClinicExpiresAt && patient.activeInClinicExpiresAt > new Date();
      if (!isActiveNow) {
        throw new ForbiddenException('Pacienti nuk është aktiv në klinikë ose koha e aktivizimit ka skaduar.');
      }

      // Enforce one session per active-in-clinic period. If the previous session
      // for this period was deleted, a new one is allowed (no living session found).
      if (patient.activeInClinicSince) {
        const existing = await this.prisma.session.findFirst({
          where: {
            patientId: patient.id,
            deletedAt: null,
            createdAt: {
              gte: patient.activeInClinicSince,
              ...(patient.activeInClinicExpiresAt ? { lte: patient.activeInClinicExpiresAt } : {}),
            },
          },
        });
        if (existing) {
          throw new BadRequestException('Ky pacient tashmë ka një trajtim të regjistruar gjatë kësaj periudhe aktive. Fshijeni nëse dëshironi të shtoni trajtim të ri.');
        }
      }
    }

    const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];

    // A physiotherapist may only ever record sessions for who they actually
    // performed them on — never pick a different physiotherapist — and only
    // for patients in their own branch (or a plan explicitly assigned to them).
    if (user.role === Role.PHYSIOTHERAPIST && dto.physiotherapistId && dto.physiotherapistId !== user.id) {
      throw new ForbiddenException('Fizioterapeuti mund të regjistrojë seanca vetëm në emrin e vet');
    }

    if (dto.physiotherapistId) {
      const physio = await this.prisma.user.findFirst({
        where: { id: dto.physiotherapistId, deletedAt: null },
      });
      if (!physio) throw new NotFoundException('Fizioterapeuti nuk u gjet');
      if (physio.role !== Role.PHYSIOTHERAPIST) {
        throw new BadRequestException('Përdoruesi i caktuar nuk është fizioterapeut');
      }
    }

    // Every session created through this normal flow is, by definition,
    // already performed — there is no "scheduled for later" concept here.
    const completedAt = dto.completedAt ? new Date(dto.completedAt) : new Date();
    const completedByUserId = user.role === Role.PHYSIOTHERAPIST ? user.id : (dto.physiotherapistId || user.id);

    // No treatment plan: a standalone session, e.g. a one-off visit not tied
    // to a billed plan. None of the plan-counter bookkeeping below applies.
    if (!dto.treatmentPlanId) {
      if (user.role === Role.PHYSIOTHERAPIST && !userBranchIds.includes(patient.branchId)) {
        throw new ForbiddenException('Mund të regjistroni seanca vetëm për pacientë të degës tuaj');
      }

      const sessionBranchId = dto.branchId || patient.branchId;

      // A standalone session (no plan) always bills at the branch's single
      // session price — never a hardcoded global number. An explicit
      // dto.amount (e.g. an admin override) still wins if provided.
      let amount = dto.amount;
      if (amount === undefined) {
        const branch = await this.prisma.branch.findFirst({ where: { id: sessionBranchId, deletedAt: null } });
        if (!branch) throw new NotFoundException('Dega e seancës nuk u gjet');
        if (branch.sessionPrice === null || branch.sessionPrice === undefined) {
          throw new BadRequestException(`Dega ${branch.name} nuk ka të vendosur çmimin e seancës`);
        }
        amount = Number(branch.sessionPrice);
      }

      const session = await this.prisma.$transaction(async (tx) => {
        const newSession = await tx.session.create({
          data: {
            patientId: dto.patientId,
            branchId: sessionBranchId,
            physiotherapistId: user.role === Role.PHYSIOTHERAPIST ? user.id : (dto.physiotherapistId || undefined),
            scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
            painLevel: dto.painLevel,
            duration: dto.duration,
            notes: dto.notes,
            recommendations: dto.recommendations,
            treatmentTypes: dto.treatmentTypes || [],
            amount,
            isPaid: Number(amount) === 0,
            status: SessionStatus.COMPLETED,
            completedAt,
            completedByUserId,
          },
          include: {
            patient: { select: { id: true, firstName: true, lastName: true } },
            branch: { select: { id: true, name: true } },
            physiotherapist: { select: { id: true, firstName: true, lastName: true } },
          },
        });

        // Auto-apply existing patient balance credit (unallocated plan-less payments) to new session
        if (Number(amount) > 0.005 && !newSession.isPaid) {
          await this.applyPatientBalanceToNewStandaloneSession(
            tx, newSession.id, dto.patientId, Number(amount),
          );
        }

        return newSession;
      });

      await this.notifySessionCompleted(session, session);
      return session;
    }

    const treatmentPlan = await this.prisma.treatmentPlan.findFirst({
      where: { id: dto.treatmentPlanId, deletedAt: null },
      include: { patient: { select: { branchId: true } } },
    });
    if (!treatmentPlan) throw new NotFoundException('Trajtimi nuk u gjet');
    if (treatmentPlan.patientId !== dto.patientId) {
      throw new BadRequestException('Trajtimi nuk i përket këtij pacienti');
    }

    if (user.role === Role.PHYSIOTHERAPIST) {
      const isAssignedToMe = treatmentPlan.assignedPhysiotherapistId === user.id;
      const isOwnBranch = userBranchIds.includes(treatmentPlan.patient.branchId);
      // A plan with no assigned physio yet is fair game for any physio in
      // that branch — assignment only matters when it's set to someone else.
      if (treatmentPlan.assignedPhysiotherapistId && !isAssignedToMe && !isOwnBranch) {
        throw new ForbiddenException('Ky trajtim është caktuar për një fizioterapeut tjetër');
      }
      if (!isAssignedToMe && !isOwnBranch) {
        throw new ForbiddenException('Mund të regjistroni seanca vetëm për trajtime të degës tuaj');
      }
    }

    if (treatmentPlan.completedSessions >= treatmentPlan.totalSessions) {
      throw new BadRequestException('Trajtimi është kompletuar, nuk lejohen seanca të reja');
    }

    const existingCount = await this.prisma.session.count({
      where: { treatmentPlanId: dto.treatmentPlanId, deletedAt: null },
    });
    const sessionNumber = dto.sessionNumber ?? existingCount + 1;

    if (sessionNumber > treatmentPlan.totalSessions) {
      throw new BadRequestException('Numri i seancës e tejkalon numrin total të seancave të trajtimit');
    }

    const duplicate = await this.prisma.session.findFirst({
      where: { treatmentPlanId: dto.treatmentPlanId, sessionNumber, deletedAt: null },
    });
    if (duplicate) throw new BadRequestException('Kjo seancë ekziston tashmë për këtë trajtim');

    // Single per-session price now — no more first-session distinction.
    const amount = treatmentPlan.sessionFee;

    const sessionData = {
      patientId: dto.patientId,
      branchId: dto.branchId || treatmentPlan.branchId || patient.branchId,
      treatmentPlanId: dto.treatmentPlanId,
      sessionNumber,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      painLevel: dto.painLevel,
      duration: dto.duration,
      notes: dto.notes,
      recommendations: dto.recommendations,
      treatmentTypes: dto.treatmentTypes || treatmentPlan.treatmentTypes || [],
      amount: dto.amount ?? amount,
      physiotherapistId: user.role === Role.PHYSIOTHERAPIST ? user.id : (dto.physiotherapistId || treatmentPlan.assignedPhysiotherapistId || undefined),
      status: SessionStatus.COMPLETED,
      completedAt,
      completedByUserId,
    };

    // Wrap session creation + plan counter + credit application in one transaction
    const session = await this.prisma.$transaction(async (tx) => {
      const newSession = await tx.session.create({
        data: sessionData,
        include: {
          patient: { select: { id: true, firstName: true, lastName: true } },
          branch: { select: { id: true, name: true } },
          physiotherapist: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      await tx.treatmentPlan.update({
        where: { id: dto.treatmentPlanId },
        data: { completedSessions: { increment: 1 } },
      });

      const sessionAmount = new Decimal(newSession.amount?.toString() ?? '0');
      if (sessionAmount.lte(0.005)) {
        // Fee is 0 — mark as paid immediately, no allocation needed.
        await tx.session.update({ where: { id: newSession.id }, data: { isPaid: true } });
      } else {
        // Auto-apply available plan credit to this session via FIFO over payments
        await this.applyPlanCreditToSession(tx, dto.treatmentPlanId!, newSession.id, sessionAmount);
      }

      return newSession;
    });

    await recalculatePatientStatus(this.prisma, dto.patientId);

    await this.notifySessionCompleted(session, session);

    return session;
  }

  async complete(id: string, dto: CompleteSessionDto, user: any) {
    const session = await this.findOne(id, user);
    if (session.status === SessionStatus.COMPLETED) {
      throw new BadRequestException('Seanca është tashmë e kompletuar');
    }

    const { physiotherapistId, ...rest } = dto;

    if (physiotherapistId) {
      const physio = await this.prisma.user.findFirst({
        where: { id: physiotherapistId, deletedAt: null },
      });
      if (!physio) throw new NotFoundException('Fizioterapeuti nuk u gjet');
      if (physio.role !== Role.PHYSIOTHERAPIST) {
        throw new BadRequestException('Përdoruesi i caktuar nuk është fizioterapeut');
      }
    }

    // The physiotherapist who is logged in is always recorded as the one who completed it.
    // An admin completing on someone's behalf can name who actually performed it.
    const completedByUserId = user.role === Role.PHYSIOTHERAPIST ? user.id : (physiotherapistId || user.id);

    const updated = await this.prisma.session.update({
      where: { id },
      data: {
        status: SessionStatus.COMPLETED,
        completedAt: new Date(),
        completedByUserId,
        ...(physiotherapistId ? { physiotherapistId } : {}),
        ...rest,
      },
    });

    // Update treatment plan completed count
    if (session.treatmentPlanId) {
      await this.prisma.treatmentPlan.update({
        where: { id: session.treatmentPlanId },
        data: { completedSessions: { increment: 1 } },
      });
      await recalculatePatientStatus(this.prisma, session.patientId);
    }

    // Notify managers of the branch
    await this.notifySessionCompleted(session, updated);

    return updated;
  }

  async update(id: string, dto: UpdateSessionDto, user: any) {
    // findOne already enforces that a physiotherapist can only touch their
    // own sessions, and that a manager stays within their own branch.
    const existing = await this.findOne(id, user);

    let data: any;
    if (user.role === Role.PHYSIOTHERAPIST) {
      // A physiotherapist can adjust the clinical record of their own
      // session, but never reassign it, re-link it to a different
      // patient/plan, or unilaterally change its billing-relevant status —
      // that stays an admin (or the dedicated /complete endpoint) action.
      const { notes, painLevel, duration, recommendations, treatmentTypes, scheduledAt } = dto;
      data = { notes, painLevel, duration, recommendations, treatmentTypes, scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined };
    } else {
      const { scheduledAt, completedAt, ...rest } = dto;
      data = {
        ...rest,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        completedAt: completedAt ? new Date(completedAt) : undefined,
      };

      if (data.physiotherapistId) {
        const physio = await this.prisma.user.findFirst({ where: { id: data.physiotherapistId, deletedAt: null } });
        if (!physio) throw new NotFoundException('Fizioterapeuti nuk u gjet');
        if (physio.role !== Role.PHYSIOTHERAPIST) throw new BadRequestException('Përdoruesi i caktuar nuk është fizioterapeut');
      }
    }

    const updated = await this.prisma.session.update({
      where: { id },
      data,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        branch: { select: { id: true, name: true } },
        physiotherapist: { select: { id: true, firstName: true, lastName: true } },
        completedByUser: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Status changed across the COMPLETED boundary — keep the plan's
    // counters (and therefore its earned/debt figures) in sync.
    if (existing.treatmentPlanId && data.status && data.status !== existing.status) {
      if (data.status === SessionStatus.COMPLETED && existing.status !== SessionStatus.COMPLETED) {
        await this.prisma.treatmentPlan.update({
          where: { id: existing.treatmentPlanId },
          data: { completedSessions: { increment: 1 } },
        });
      } else if (existing.status === SessionStatus.COMPLETED && data.status !== SessionStatus.COMPLETED) {
        const plan = await this.prisma.treatmentPlan.findUnique({ where: { id: existing.treatmentPlanId } });
        if (plan && plan.completedSessions > 0) {
          await this.prisma.treatmentPlan.update({
            where: { id: existing.treatmentPlanId },
            data: { completedSessions: { decrement: 1 } },
          });
        }
      }
      await recalculatePatientStatus(this.prisma, existing.patientId);
    }

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE',
        entity: 'session',
        entityId: id,
        oldData: { status: existing.status, notes: existing.notes },
        newData: { status: updated.status, notes: updated.notes },
      },
    });

    return updated;
  }

  // ADMIN-only: override the price of one specific session (e.g. a one-off
  // discount) without touching the treatment plan's sessionFee, which still
  // governs every other session of that plan.
  async updatePrice(id: string, dto: UpdateSessionPriceDto, user: any) {
    const existing = await this.findOne(id, user);
    const oldAmount = existing.amount ? new Decimal(existing.amount.toString()) : new Decimal(0);
    const newAmount = new Decimal(dto.amount);

    // If this session is already linked to a payment, re-check whether that
    // payment still covers the (possibly higher) new price.
    let isPaid = existing.isPaid;
    if (existing.paymentId) {
      const payment = await this.prisma.payment.findFirst({ where: { id: existing.paymentId } });
      if (payment) isPaid = new Decimal(payment.amount.toString()).gte(newAmount);
    }

    const updated = await this.prisma.session.update({
      where: { id },
      data: {
        amount: dto.amount,
        isPaid,
        priceOverrideReason: dto.reason,
        priceChangedByUserId: user.id,
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        branch: { select: { id: true, name: true } },
        physiotherapist: { select: { id: true, firstName: true, lastName: true } },
        completedByUser: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Reflect the price change in the plan's overall total so the financial
    // summary (totalTreatmentValue / finalRemainingBalance) stays accurate.
    if (existing.treatmentPlanId) {
      const delta = newAmount.minus(oldAmount);
      if (!delta.isZero()) {
        const plan = await this.prisma.treatmentPlan.findUnique({ where: { id: existing.treatmentPlanId } });
        if (plan) {
          const newTotal = new Decimal(plan.totalAmount.toString()).plus(delta);
          await this.prisma.treatmentPlan.update({
            where: { id: existing.treatmentPlanId },
            data: { totalAmount: newTotal.isNegative() ? 0 : newTotal },
          });
        }
      }
    }

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE',
        entity: 'session',
        entityId: id,
        oldData: { amount: oldAmount.toString() },
        newData: { amount: newAmount.toString(), reason: dto.reason },
      },
    });

    return updated;
  }

  async remove(id: string, user: any) {
    const existing = await this.findOne(id, user);

    if (user.role === Role.PHYSIOTHERAPIST) {
      if (existing.physiotherapistId !== user.id) {
        throw new ForbiddenException('Mund të fshini vetëm seancat tuaja');
      }
      if (existing.paymentId) {
        throw new ForbiddenException('Kjo seancë ka një pagesë të lidhur — kërkoni nga administratori ta fshijë');
      }
    }

    let totalAllocated = 0;
    let allocatedPaymentIds: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      // Must delete PaymentAllocations before session.delete() — the FK has no onDelete:Cascade
      const allocations = await tx.paymentAllocation.findMany({
        where: { sessionId: id },
        select: { amount: true, paymentId: true },
      });

      if (allocations.length > 0) {
        totalAllocated = allocations.reduce((sum, a) => sum + Number(a.amount.toString()), 0);
        allocatedPaymentIds = allocations.map((a) => a.paymentId);
        await tx.paymentAllocation.deleteMany({ where: { sessionId: id } });

        // For standalone sessions (no plan): freed allocation returns to patient.balance
        if (!existing.treatmentPlanId && totalAllocated > 0.005) {
          await tx.patient.update({
            where: { id: existing.patientId },
            data: { balance: { increment: new Decimal(totalAllocated.toString()) } },
          });
        }
        // For plan sessions: freed allocation becomes available plan credit automatically
        // (plan.amountPaid stays, but sum of allocations decreases → more credit)
      }

      await tx.treatment.deleteMany({ where: { sessionId: id } });
      await tx.session.delete({ where: { id } });
    });

    if (existing.treatmentPlanId && existing.status === SessionStatus.COMPLETED) {
      const plan = await this.prisma.treatmentPlan.findUnique({ where: { id: existing.treatmentPlanId } });
      if (plan && plan.completedSessions > 0) {
        await this.prisma.treatmentPlan.update({
          where: { id: existing.treatmentPlanId },
          data: { completedSessions: { decrement: 1 } },
        });
      }
      await recalculatePatientStatus(this.prisma, existing.patientId);
    }

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'DELETE',
        entity: 'session',
        entityId: id,
        oldData: {
          patientId: existing.patientId,
          treatmentPlanId: existing.treatmentPlanId,
          status: existing.status,
          amount: existing.amount?.toString(),
          totalAllocated: totalAllocated.toFixed(2),
          allocatedPaymentIds,
        },
      },
    });

    return { message: 'Seanca u fshi me sukses' };
  }

  // Checks if the plan has unallocated credit and allocates it (FIFO over
  // payments) to the newly created session. Called inside a $transaction.
  private async applyPlanCreditToSession(
    tx: any,
    planId: string,
    sessionId: string,
    sessionAmount: Decimal,
  ): Promise<void> {
    if (sessionAmount.lte(0.005)) return;

    const plan = await tx.treatmentPlan.findUnique({
      where: { id: planId },
      select: { amountPaid: true },
    });
    if (!plan) return;

    // Sum all existing allocations for sessions of this plan (excluding new session)
    const existingAllocs = await tx.paymentAllocation.aggregate({
      where: { session: { treatmentPlanId: planId } },
      _sum: { amount: true },
    });
    const totalAllocated = new Decimal(existingAllocs._sum?.amount?.toString() ?? '0');
    const totalPaid = new Decimal(plan.amountPaid.toString());
    const credit = totalPaid.minus(totalAllocated);

    if (credit.lte(0.005)) return;

    // FIFO over plan's payments (oldest first) — find which payment(s) have remaining capacity
    const payments = await tx.payment.findMany({
      where: { treatmentPlanId: planId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { allocations: { select: { amount: true } } },
    });

    const toAllocateTotal = credit.lte(sessionAmount) ? credit : sessionAmount;
    let remaining = toAllocateTotal;

    for (const payment of payments) {
      if (remaining.lte(0.005)) break;
      const paymentAllocated = payment.allocations.reduce(
        (acc: Decimal, a: any) => acc.plus(new Decimal(a.amount.toString())),
        new Decimal('0'),
      );
      const paymentAvailable = new Decimal(payment.amount.toString()).minus(paymentAllocated);
      if (paymentAvailable.lte(0.005)) continue;

      const toAllocate = remaining.lte(paymentAvailable) ? remaining : paymentAvailable;
      await tx.paymentAllocation.create({
        data: { paymentId: payment.id, sessionId, amount: toAllocate },
      });
      remaining = remaining.minus(toAllocate);
    }

    // If the full session amount is covered, mark as paid
    const allocated = toAllocateTotal.minus(remaining);
    if (allocated.gte(sessionAmount.minus(0.005))) {
      await tx.session.update({ where: { id: sessionId }, data: { isPaid: true } });
    }
  }

  // Applies existing unallocated patient balance credit (FIFO from oldest plan-less payments)
  // to a newly-created standalone session. Decreases patient.balance by the applied amount.
  private async applyPatientBalanceToNewStandaloneSession(
    tx: any,
    sessionId: string,
    patientId: string,
    sessionAmount: number,
  ): Promise<void> {
    const patient = await tx.patient.findUnique({
      where: { id: patientId },
      select: { balance: true },
    });
    if (!patient) return;

    const availableBalance = new Decimal(patient.balance.toString());
    if (availableBalance.lte(0.005)) return;

    // FIFO: oldest plan-less payments with unallocated credit
    const payments = await tx.payment.findMany({
      where: { patientId, treatmentPlanId: null, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { allocations: { select: { amount: true } } },
    });

    const sessionDec = new Decimal(sessionAmount.toString());
    let remaining = sessionDec;
    let totalApplied = new Decimal('0');

    for (const payment of payments) {
      if (remaining.lte(0.005)) break;
      const paymentAmt = new Decimal(payment.amount.toString());
      const allocated = (payment.allocations as any[]).reduce(
        (acc: Decimal, a: any) => acc.plus(new Decimal(a.amount.toString())),
        new Decimal('0'),
      );
      const available = paymentAmt.minus(allocated);
      if (available.lte(0.005)) continue;

      const toAllocate = remaining.lte(available) ? remaining : available;
      await tx.paymentAllocation.create({
        data: { paymentId: payment.id, sessionId, amount: toAllocate },
      });
      remaining = remaining.minus(toAllocate);
      totalApplied = totalApplied.plus(toAllocate);
    }

    if (totalApplied.lte(0.005)) return;

    await tx.patient.update({
      where: { id: patientId },
      data: { balance: { decrement: totalApplied } },
    });

    if (totalApplied.gte(sessionDec.minus(0.005))) {
      await tx.session.update({ where: { id: sessionId }, data: { isPaid: true } });
    }
  }

  private async notifySessionCompleted(session: any, updated: any) {
    try {
      const managers = await this.prisma.userBranch.findMany({
        where: { branchId: session.branchId },
        include: { user: { select: { id: true, role: true } } },
      });
      const managerIds = managers
        .filter((ub) => ub.user.role === 'MANAGER' || ub.user.role === 'ADMIN')
        .map((ub) => ub.user.id);

      if (managerIds.length) {
        await this.prisma.notification.createMany({
          data: managerIds.map((userId) => ({
            userId,
            senderId: session.physiotherapistId,
            type: 'SESSION_COMPLETED' as any,
            title: 'Seancë e kompletuar',
            message: `Seanca e pacientit ${session.patient?.firstName} ${session.patient?.lastName} u kompletua`,
            data: { sessionId: session.id, patientId: session.patientId },
          })),
        });
        this.pushService.sendToUsers(managerIds, {
          title: 'Trajtim i kompletuar',
          body: `${session.patient?.firstName ?? ''} ${session.patient?.lastName ?? ''}`,
          url: `/pacientet/${session.patientId}`,
          tag: `session-completed-${session.id}`,
        }).catch(() => {});
      }
    } catch {}
  }
}
