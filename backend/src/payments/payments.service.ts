import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaginationDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import { PaymentStatus, Role } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { computePlanFinancials } from './plan-financials.util';
import * as dayjs from 'dayjs';
import { PushService } from '../push/push.service';

// ---------------------------------------------------------------------------
// FIFO allocation helper
// Distributes `amount` across `plans` ordered by createdAt ASC.
// Returns allocations (treatmentPlanId + amount) and the unallocated surplus
// that should become patient credit (balance).
// ---------------------------------------------------------------------------
function computeFIFO(
  amount: Decimal,
  plans: any[],
): { allocations: { treatmentPlanId: string; amount: Decimal }[]; unallocated: Decimal } {
  const sorted = [...plans].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const allocations: { treatmentPlanId: string; amount: Decimal }[] = [];
  let remaining = amount;

  for (const plan of sorted) {
    if (remaining.lte(0)) break;
    const { finalRemainingBalance } = computePlanFinancials(plan);
    if (finalRemainingBalance <= 0) continue;
    const debt = new Decimal(finalRemainingBalance.toString());
    const allocated = remaining.lte(debt) ? remaining : debt;
    allocations.push({ treatmentPlanId: plan.id, amount: allocated });
    remaining = remaining.minus(allocated);
  }

  return { allocations, unallocated: remaining };
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
  ) {}

  async findAll(
    dto: PaginationDto & { branchId?: string; patientId?: string; status?: PaymentStatus; dateFrom?: string; dateTo?: string },
    user: any,
  ) {
    const page = Number(dto.page) || 1;
    const limit = Number(dto.limit) || 24;
    const { search, branchId, patientId, status, dateFrom, dateTo } = dto;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };
    if (branchId) where.branchId = branchId;
    if (patientId) where.patientId = patientId;
    if (status) where.status = status;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    if (user.role === 'MANAGER') {
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      if (branchId && !userBranchIds.includes(branchId)) {
        where.branchId = { in: userBranchIds };
      } else if (!branchId) {
        where.branchId = { in: userBranchIds };
      }
    }

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
          branch: { select: { id: true, name: true } },
          treatmentPlan: { select: { id: true, totalSessions: true, completedSessions: true, totalAmount: true, amountPaid: true, sessionFee: true } },
          allocations: {
            include: {
              treatmentPlan: { select: { id: true, diagnosis: true, totalAmount: true, amountPaid: true, sessionFee: true, completedSessions: true, totalSessions: true } },
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { data: payments, meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(id: string, user?: any) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, deletedAt: null },
      include: {
        patient: { include: { branch: true } },
        branch: true,
        treatmentPlan: { include: { sessions: { where: { deletedAt: null } } } },
        sessions: true,
        allocations: {
          include: {
            treatmentPlan: { select: { id: true, diagnosis: true, totalAmount: true, amountPaid: true, sessionFee: true, completedSessions: true, totalSessions: true } },
          },
        },
      },
    });
    if (!payment) throw new NotFoundException('Pagesa nuk u gjet');

    if (user?.role === Role.MANAGER) {
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      if (!userBranchIds.includes(payment.branchId)) {
        throw new ForbiddenException('Nuk keni qasje në këtë pagesë');
      }
    }

    return payment;
  }

  // Returns all treatment plans for a patient that still have remaining balance,
  // ordered oldest-first (FIFO order). Used by the payment form UI.
  async getUnpaidPlans(patientId: string, user: any) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, deletedAt: null },
      select: { id: true, branchId: true, balance: true },
    });
    if (!patient) throw new NotFoundException('Pacienti nuk u gjet');

    if (user.role === Role.MANAGER) {
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      if (!userBranchIds.includes(patient.branchId)) {
        throw new ForbiddenException('Nuk keni qasje në këtë pacient');
      }
    }

    const plans = await this.prisma.treatmentPlan.findMany({
      where: { patientId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        diagnosis: true,
        totalAmount: true,
        amountPaid: true,
        sessionFee: true,
        completedSessions: true,
        totalSessions: true,
        paymentStatus: true,
        createdAt: true,
        treatmentTypes: true,
      },
    });

    const withFinancials = plans
      .map((p) => {
        const f = computePlanFinancials(p);
        return { ...p, ...f };
      })
      .filter((p) => p.finalRemainingBalance > 0);

    return {
      plans: withFinancials,
      patientBalance: Number(patient.balance.toString()),
    };
  }

  async create(dto: CreatePaymentDto, user: any) {
    // Idempotency fast-path — if same key is resent, return existing payment
    if (dto.idempotencyKey) {
      const existing = await this.prisma.payment.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true } },
          branch: { select: { id: true, name: true } },
          createdByUser: { select: { id: true, firstName: true, lastName: true } },
          allocations: {
            include: { treatmentPlan: { select: { id: true, diagnosis: true } } },
          },
        },
      });
      if (existing) {
        console.warn(`[PaymentsService] Idempotent duplicate key=${dto.idempotencyKey} — returning existing ${existing.id}`);
        return existing;
      }
    }

    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, deletedAt: null },
    });
    if (!patient) throw new NotFoundException('Pacienti nuk u gjet');

    const branchId = dto.branchId || patient.branchId;

    if (user.role === Role.MANAGER) {
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      if (!userBranchIds.includes(branchId)) {
        throw new ForbiddenException('Nuk mund të regjistroni pagesë për një degë tjetër');
      }
    }

    const paymentAmount = new Decimal(dto.amount.toString());

    // Fetch all treatment plans for this patient (needed for FIFO + validation)
    const allPlans = await this.prisma.treatmentPlan.findMany({
      where: { patientId: dto.patientId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    // ---- Determine allocations ----
    // Priority: (1) explicit allocations from frontend, (2) legacy single treatmentPlanId, (3) FIFO auto
    let rawAllocations: { treatmentPlanId: string; amount: Decimal }[];

    if (dto.allocations?.length) {
      rawAllocations = dto.allocations.map((a) => ({
        treatmentPlanId: a.treatmentPlanId,
        amount: new Decimal(a.amount.toString()),
      }));
    } else if (dto.treatmentPlanId) {
      // Legacy: single-plan payment — allocate up to plan's remaining balance
      const plan = allPlans.find((p) => p.id === dto.treatmentPlanId);
      if (!plan) throw new NotFoundException('Plani i trajtimit nuk u gjet');
      if (plan.patientId !== dto.patientId) throw new BadRequestException('Plani nuk i përket këtij pacienti');
      const { finalRemainingBalance } = computePlanFinancials(plan);
      const maxAlloc = finalRemainingBalance > 0
        ? (paymentAmount.lte(new Decimal(finalRemainingBalance.toString())) ? paymentAmount : new Decimal(finalRemainingBalance.toString()))
        : new Decimal(0);
      rawAllocations = maxAlloc.gt(0) ? [{ treatmentPlanId: dto.treatmentPlanId, amount: maxAlloc }] : [];
    } else {
      // Auto-FIFO across all unpaid plans
      const { allocations } = computeFIFO(paymentAmount, allPlans);
      rawAllocations = allocations;
    }

    // ---- Validate allocations ----
    const totalAllocated = rawAllocations.reduce((sum, a) => sum.plus(a.amount), new Decimal(0));
    if (totalAllocated.gt(paymentAmount.plus(new Decimal('0.01')))) {
      throw new BadRequestException(
        `Totali i alokimeve (${totalAllocated.toFixed(2)}€) e kalon shumën e pagesës (${paymentAmount.toFixed(2)}€)`,
      );
    }

    for (const alloc of rawAllocations) {
      const plan = allPlans.find((p) => p.id === alloc.treatmentPlanId);
      if (!plan) throw new NotFoundException(`Plani ${alloc.treatmentPlanId} nuk u gjet`);
      if (plan.patientId !== dto.patientId) {
        throw new BadRequestException('Plani i trajtimit nuk i përket këtij pacienti');
      }
      const { finalRemainingBalance } = computePlanFinancials(plan);
      if (alloc.amount.gt(new Decimal(finalRemainingBalance.toString()).plus(new Decimal('0.01')))) {
        throw new BadRequestException(
          `Alokimi ${alloc.amount.toFixed(2)}€ e kalon borxhin e planit ${finalRemainingBalance.toFixed(2)}€`,
        );
      }
    }

    const unallocated = paymentAmount.minus(totalAllocated);

    // ---- Validate sessions (legacy) ----
    let targetSessions: { id: string; amount: any }[] = [];
    if (dto.sessionIds?.length) {
      targetSessions = await this.prisma.session.findMany({
        where: { id: { in: dto.sessionIds }, patientId: dto.patientId, deletedAt: null },
      });
      if (targetSessions.length !== dto.sessionIds.length) {
        throw new NotFoundException('Një ose disa nga seancat e zgjedhura nuk u gjetën');
      }
      const alreadyPaid = targetSessions.filter((s: any) => s.isPaid);
      if (alreadyPaid.length) {
        throw new BadRequestException('Disa nga seancat e zgjedhura janë tashmë të paguara');
      }
    }

    // ---- Transaction with invoice number retry ----
    let payment: any;
    for (let attempt = 0; attempt < 5; attempt++) {
      const invoiceNumber = await this.generateInvoiceNumber();
      try {
        payment = await this.prisma.$transaction(async (tx) => {
          // Re-check sessions inside transaction (concurrent safety)
          if (dto.sessionIds?.length) {
            const fresh = await tx.session.findMany({
              where: { id: { in: dto.sessionIds }, patientId: dto.patientId, deletedAt: null },
              select: { id: true, isPaid: true },
            });
            if (fresh.filter((s: any) => s.isPaid).length) {
              throw new BadRequestException('Disa nga seancat e zgjedhura janë tashmë të paguara');
            }
          }

          // Determine a primary treatmentPlanId for backward-compat display
          const primaryPlanId = rawAllocations.length === 1
            ? rawAllocations[0].treatmentPlanId
            : (dto.treatmentPlanId ?? null);

          const newPayment = await tx.payment.create({
            data: {
              patientId: dto.patientId,
              branchId,
              treatmentPlanId: primaryPlanId,
              invoiceNumber,
              idempotencyKey: dto.idempotencyKey,
              amount: dto.amount,
              paymentMethod: dto.paymentMethod,
              paymentType: dto.paymentType,
              notes: dto.notes,
              status: PaymentStatus.PAID,
              paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
              createdByUserId: user.id,
            },
            include: {
              patient: { select: { id: true, firstName: true, lastName: true } },
              branch: { select: { id: true, name: true } },
              createdByUser: { select: { id: true, firstName: true, lastName: true } },
            },
          });

          // Create PaymentAllocation rows + update plan financials
          for (const alloc of rawAllocations) {
            await tx.paymentAllocation.create({
              data: {
                paymentId: newPayment.id,
                treatmentPlanId: alloc.treatmentPlanId,
                amount: alloc.amount,
              },
            });
            await this.adjustPlanAmountPaid(alloc.treatmentPlanId, alloc.amount, tx);
          }

          // Mark sessions paid (legacy session-level payment)
          if (targetSessions.length) {
            await tx.session.updateMany({
              where: { id: { in: targetSessions.map((s) => s.id) } },
              data: { paymentId: newPayment.id, isPaid: true },
            });
          }

          // Credit unallocated surplus to patient balance
          if (unallocated.gt(new Decimal('0.005'))) {
            await tx.patient.update({
              where: { id: dto.patientId },
              data: { balance: { increment: unallocated } },
            });
          }

          return newPayment;
        });
        break;
      } catch (e: any) {
        if (e?.code === 'P2002' && attempt < 4) continue;
        throw e;
      }
    }

    await this.notifyPayment(payment, user);
    return payment;
  }

  async update(id: string, dto: Partial<CreatePaymentDto>, user: any) {
    const existing = await this.findOne(id, user);

    if (dto.branchId && user.role === Role.MANAGER) {
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      if (!userBranchIds.includes(dto.branchId)) {
        throw new ForbiddenException('Nuk mund ta transferoni pagesën në një degë tjetër');
      }
    }

    if (dto.treatmentPlanId) {
      const plan = await this.prisma.treatmentPlan.findFirst({
        where: { id: dto.treatmentPlanId, deletedAt: null },
      });
      if (!plan) throw new NotFoundException('Plani i trajtimit nuk u gjet');
      if (plan.patientId !== (dto.patientId || existing.patientId)) {
        throw new BadRequestException('Plani i trajtimit nuk i përket këtij pacienti');
      }
    }

    // For updates: reverse existing allocations, then re-apply
    // (simplified: only handles metadata changes + single-plan amount changes)
    const oldAmount = new Decimal(existing.amount.toString());
    const newAmount = dto.amount !== undefined ? new Decimal(dto.amount.toString()) : oldAmount;
    const amountDelta = newAmount.minus(oldAmount);

    if (!amountDelta.isZero()) {
      const existingAllocs = (existing as any).allocations ?? [];
      if (existingAllocs.length > 0) {
        // New-style: scale existing allocations proportionally (simplified)
        // For correctness, user should delete and recreate for amount changes
        // that span multiple plans — we only adjust the single-plan case here.
        if (existingAllocs.length === 1) {
          await this.adjustPlanAmountPaid(existingAllocs[0].treatmentPlanId, amountDelta);
        }
      } else if (existing.treatmentPlanId) {
        // Legacy: adjust the single linked plan
        await this.adjustPlanAmountPaid(existing.treatmentPlanId, amountDelta);
      }
    }

    if (dto.sessionIds !== undefined) {
      await this.prisma.session.updateMany({ where: { paymentId: id }, data: { paymentId: null, isPaid: false } });
      if (dto.sessionIds.length) {
        const targetSessions = await this.prisma.session.findMany({
          where: { id: { in: dto.sessionIds }, deletedAt: null },
        });
        if (targetSessions.length !== dto.sessionIds.length) {
          throw new NotFoundException('Një ose disa nga seancat e zgjedhura nuk u gjetën');
        }
        const totalSessionsAmount = targetSessions.reduce(
          (sum, s) => sum.plus(s.amount ? new Decimal(s.amount.toString()) : new Decimal(0)),
          new Decimal(0),
        );
        if (newAmount.gte(totalSessionsAmount)) {
          await this.prisma.session.updateMany({
            where: { id: { in: targetSessions.map((s) => s.id) } },
            data: { paymentId: id, isPaid: true },
          });
        }
      }
    }

    const updated = await this.prisma.payment.update({
      where: { id },
      data: {
        patientId: dto.patientId,
        branchId: dto.branchId,
        treatmentPlanId: dto.treatmentPlanId,
        amount: dto.amount,
        paymentMethod: dto.paymentMethod,
        paymentType: dto.paymentType,
        notes: dto.notes,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : undefined,
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        branch: { select: { id: true, name: true } },
        treatmentPlan: { select: { id: true, totalSessions: true, completedSessions: true, totalAmount: true, amountPaid: true, paymentStatus: true } },
        allocations: {
          include: { treatmentPlan: { select: { id: true, diagnosis: true } } },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE',
        entity: 'payment',
        entityId: id,
        oldData: { amount: existing.amount.toString(), treatmentPlanId: existing.treatmentPlanId },
        newData: { amount: updated.amount.toString(), treatmentPlanId: updated.treatmentPlanId },
      },
    });

    return updated;
  }

  async remove(id: string, user: any) {
    const existing = await this.findOne(id, user);

    await this.prisma.$transaction(async (tx) => {
      const allocations = await tx.paymentAllocation.findMany({ where: { paymentId: id } });

      if (allocations.length > 0) {
        // New-style: reverse each allocation from its plan
        for (const alloc of allocations) {
          await this.adjustPlanAmountPaid(
            alloc.treatmentPlanId,
            new Decimal(alloc.amount.toString()).negated(),
            tx,
          );
        }
        // Restore unallocated credit from patient balance
        const totalAllocated = allocations.reduce(
          (sum, a) => sum.plus(a.amount.toString()),
          new Decimal(0),
        );
        const unallocated = new Decimal(existing.amount.toString()).minus(totalAllocated);
        if (unallocated.gt(new Decimal('0.005'))) {
          const pat = await tx.patient.findUnique({
            where: { id: existing.patientId },
            select: { balance: true },
          });
          const newBal = new Decimal((pat?.balance ?? 0).toString()).minus(unallocated);
          await tx.patient.update({
            where: { id: existing.patientId },
            data: { balance: newBal.lt(0) ? new Decimal(0) : newBal },
          });
        }
        // PaymentAllocation rows are cascade-deleted with Payment
      } else if (existing.treatmentPlanId) {
        // Legacy single-plan payment
        await this.adjustPlanAmountPaid(
          existing.treatmentPlanId,
          new Decimal(existing.amount.toString()).negated(),
          tx,
        );
      }

      await tx.session.updateMany({ where: { paymentId: id }, data: { paymentId: null, isPaid: false } });
      await tx.payment.delete({ where: { id } });
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'DELETE',
        entity: 'payment',
        entityId: id,
        oldData: {
          amount: existing.amount.toString(),
          treatmentPlanId: existing.treatmentPlanId,
          patientId: existing.patientId,
        },
      },
    });

    return { message: 'Pagesa u fshi dhe bilanci u azhurnua' };
  }

  async getStats(branchId?: string, user?: any) {
    if (user?.role === Role.MANAGER) {
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      branchId = branchId && userBranchIds.includes(branchId) ? branchId : userBranchIds[0];
    }
    const where: any = { deletedAt: null };
    if (branchId) where.branchId = branchId;

    const [totalRevenue, paidCount, unpaidCount, partialCount] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { ...where, status: PaymentStatus.PAID },
        _sum: { amount: true },
      }),
      this.prisma.payment.count({ where: { ...where, status: PaymentStatus.PAID } }),
      this.prisma.payment.count({ where: { ...where, status: PaymentStatus.UNPAID } }),
      this.prisma.payment.count({ where: { ...where, status: PaymentStatus.PARTIALLY_PAID } }),
    ]);

    return { totalRevenue: totalRevenue._sum.amount || 0, paidCount, unpaidCount, partialCount };
  }

  // Applies a signed delta to a plan's amountPaid and recomputes paymentStatus.
  // Clamped at 0 so corrections can never push paid-amount negative.
  private async adjustPlanAmountPaid(planId: string, delta: Decimal, tx?: any) {
    const client = tx ?? this.prisma;
    const plan = await client.treatmentPlan.findUnique({ where: { id: planId } });
    if (!plan) return;

    let newAmountPaid = new Decimal(plan.amountPaid.toString()).plus(delta);
    if (newAmountPaid.isNegative()) newAmountPaid = new Decimal(0);
    const { paymentStatus } = computePlanFinancials({ ...plan, amountPaid: newAmountPaid });

    await client.treatmentPlan.update({
      where: { id: planId },
      data: { amountPaid: newAmountPaid, paymentStatus },
    });
  }

  async getPlanFinancials(planId: string, user: any) {
    const plan = await this.prisma.treatmentPlan.findFirst({
      where: { id: planId, deletedAt: null },
      include: { patient: { select: { branchId: true } } },
    });
    if (!plan) throw new NotFoundException('Plani i trajtimit nuk u gjet');

    if (user.role === Role.MANAGER) {
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      if (!userBranchIds.includes(plan.patient.branchId)) {
        throw new ForbiddenException('Nuk keni qasje në këtë plan trajtimi');
      }
    }

    return computePlanFinancials(plan);
  }

  async getDebts(branchId: string | undefined, page: number, limit: number, user: any) {
    if (user.role === Role.MANAGER) {
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      branchId = branchId && userBranchIds.includes(branchId) ? branchId : userBranchIds[0];
    }

    const planWhere: any = { deletedAt: null };
    if (branchId) planWhere.patient = { branchId };

    const plans = await this.prisma.treatmentPlan.findMany({
      where: planWhere,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, phone: true, branch: { select: { id: true, name: true } } } },
        payments: { where: { deletedAt: null }, orderBy: { paidAt: 'desc' }, take: 1, select: { paidAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const planDebts = plans
      .map((p) => ({
        planId: p.id as string | null,
        sessionId: null as string | null,
        patient: { id: p.patient.id, firstName: p.patient.firstName, lastName: p.patient.lastName, phone: p.patient.phone },
        branch: p.patient.branch,
        lastPaymentAt: p.payments[0]?.paidAt || null,
        ...computePlanFinancials(p),
      }))
      .filter((d) => d.finalRemainingBalance > 0);

    const sessionWhere: any = { deletedAt: null, treatmentPlanId: null, status: 'COMPLETED', isPaid: false };
    if (branchId) sessionWhere.patient = { branchId };

    const standaloneSessions = await this.prisma.session.findMany({
      where: sessionWhere,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, phone: true, branch: { select: { id: true, name: true } } } },
      },
    });

    const sessionDebts = standaloneSessions.map((s) => {
      const amount = Number(s.amount || 0);
      return {
        planId: null as string | null,
        sessionId: s.id,
        patient: { id: s.patient.id, firstName: s.patient.firstName, lastName: s.patient.lastName, phone: s.patient.phone },
        branch: s.patient.branch,
        lastPaymentAt: null as Date | null,
        totalTreatmentValue: amount,
        currentEarnedAmount: amount,
        totalPaidAmount: 0,
        currentDebt: amount,
        finalRemainingBalance: amount,
        prepaidAmount: 0,
        paymentStatus: 'UNPAID' as string,
      };
    });

    const allDebts = [...planDebts, ...sessionDebts].sort((a, b) => b.currentDebt - a.currentDebt);
    const total = allDebts.length;
    const skip = (page - 1) * limit;
    return { data: allDebts.slice(skip, skip + limit), meta: buildPaginationMeta(total, page, limit) };
  }

  private async generateInvoiceNumber(): Promise<string> {
    const year = dayjs().year();
    const last = await this.prisma.payment.findFirst({
      where: { invoiceNumber: { startsWith: `FAT-${year}-` } },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });
    const next = last ? parseInt(last.invoiceNumber.split('-')[2], 10) + 1 : 1;
    return `FAT-${year}-${String(next).padStart(4, '0')}`;
  }

  private async notifyPayment(payment: any, user: any) {
    try {
      const admins = await this.prisma.user.findMany({
        where: { role: 'ADMIN', deletedAt: null },
        select: { id: true },
      });
      const adminIds = admins.map((a) => a.id);
      await this.prisma.notification.createMany({
        data: adminIds.map((userId) => ({
          userId,
          senderId: user.id,
          type: 'PAYMENT_RECEIVED' as any,
          title: 'Pagesë e re e marrë',
          message: `Pagesa ${payment.invoiceNumber} — ${payment.amount}€ u regjistrua`,
          data: { paymentId: payment.id },
        })),
      });
      this.pushService.sendToUsers(adminIds, {
        title: 'Pagesë e re',
        body: `${payment.invoiceNumber} — ${Number(payment.amount).toFixed(2)}€`,
        url: '/pagesat',
        tag: `payment-${payment.id}`,
      }).catch(() => {});
    } catch {}
  }
}
