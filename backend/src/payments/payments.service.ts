import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaginationDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import { PaymentStatus, Role } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { computePlanFinancials, computeSessionDebt } from './plan-financials.util';
import * as dayjs from 'dayjs';
import { PushService } from '../push/push.service';

// FIFO allocation of `amount` to completed sessions of a plan, oldest first.
// Returns how much was allocated per session (for preview / validation).
function computeSessionFIFO(
  amount: number,
  sessions: { id: string; amount: number; paidAmount: number }[],
): { sessionId: string; amount: number }[] {
  const result: { sessionId: string; amount: number }[] = [];
  let remaining = amount;
  for (const s of sessions) {
    if (remaining < 0.005) break;
    const debt = Math.max(0, s.amount - s.paidAmount);
    if (debt < 0.005) continue;
    const allocated = Math.min(remaining, debt);
    result.push({ sessionId: s.id, amount: Math.round(allocated * 100) / 100 });
    remaining -= allocated;
  }
  return result;
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
              session: { select: { id: true, sessionNumber: true, amount: true, completedAt: true, treatmentPlanId: true } },
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
        treatmentPlan: {
          include: {
            sessions: {
              where: { deletedAt: null },
              include: { paymentAllocations: { select: { amount: true } } },
            },
          },
        },
        allocations: {
          include: {
            session: { select: { id: true, sessionNumber: true, amount: true, completedAt: true, treatmentPlanId: true, status: true } },
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

  // Returns financial info for a single standalone session (no plan).
  // Used by the payment form to pre-fill the remaining amount.
  async getSessionInfo(sessionId: string, user: any) {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, deletedAt: null },
      include: {
        paymentAllocations: { select: { amount: true } },
        patient: { select: { branchId: true } },
      },
    });
    if (!session) throw new NotFoundException('Seanca nuk u gjet');

    if (user.role === Role.MANAGER) {
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      if (!userBranchIds.includes(session.patient.branchId)) {
        throw new ForbiddenException('Nuk keni qasje në këtë seancë');
      }
    }

    const amount = Number(session.amount?.toString() ?? '0');
    const paidAmount = session.paymentAllocations.reduce(
      (sum, a) => sum + Number(a.amount.toString()), 0,
    );
    const remainingAmount = Math.max(0, Math.round((amount - paidAmount) * 100) / 100);
    return {
      id: session.id,
      amount,
      paidAmount: Math.round(paidAmount * 100) / 100,
      remainingAmount,
      isPaid: session.isPaid,
    };
  }

  // Returns sessions for a plan enriched with allocation amounts, plus plan credit.
  // Used by the payment form to show what's unpaid per session.
  async getPlanSessions(planId: string, user: any) {
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

    const sessions = await this.prisma.session.findMany({
      where: { treatmentPlanId: planId, deletedAt: null, status: 'COMPLETED' },
      orderBy: { completedAt: 'asc' },
      include: { paymentAllocations: { select: { amount: true } } },
    });

    const enrichedSessions = sessions.map((s) => {
      const price = Number(s.amount?.toString() ?? '0');
      const paidAmount = s.paymentAllocations.reduce((sum, a) => sum + Number(a.amount.toString()), 0);
      const remainingAmount = Math.max(0, price - paidAmount);
      return {
        id: s.id,
        sessionNumber: s.sessionNumber,
        completedAt: s.completedAt,
        amount: price,
        paidAmount: Math.round(paidAmount * 100) / 100,
        remainingAmount: Math.round(remainingAmount * 100) / 100,
        isPaid: s.isPaid,
      };
    });

    // Credit = total payments received for plan − total allocated to sessions
    const totalAllocations = enrichedSessions.reduce((s, sess) => s + sess.paidAmount, 0);
    const totalPaid = Number(plan.amountPaid.toString());
    const credit = Math.max(0, Math.round((totalPaid - totalAllocations) * 100) / 100);
    const currentDebt = enrichedSessions.reduce((s, sess) => s + sess.remainingAmount, 0);

    return {
      plan: {
        id: plan.id,
        totalSessions: plan.totalSessions,
        completedSessions: plan.completedSessions,
        sessionFee: Number(plan.sessionFee.toString()),
        totalAmount: Number(plan.totalAmount.toString()),
        amountPaid: totalPaid,
        paymentStatus: plan.paymentStatus,
        diagnosis: plan.diagnosis,
        treatmentTypes: plan.treatmentTypes,
      },
      sessions: enrichedSessions,
      credit,
      currentDebt: Math.round(currentDebt * 100) / 100,
    };
  }

  // Returns unpaid plans for a patient (for backward-compat + debts page).
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
      include: {
        sessions: {
          where: { deletedAt: null, status: 'COMPLETED' },
          include: { paymentAllocations: { select: { amount: true } } },
        },
      },
    });

    const withFinancials = plans.map((p) => {
      const totalAllocations = p.sessions.reduce((sum, s) =>
        sum + s.paymentAllocations.reduce((a, b) => a + Number(b.amount.toString()), 0), 0);
      const f = computePlanFinancials(p, totalAllocations);
      return {
        id: p.id,
        diagnosis: p.diagnosis,
        treatmentTypes: p.treatmentTypes,
        totalAmount: Number(p.totalAmount.toString()),
        amountPaid: Number(p.amountPaid.toString()),
        sessionFee: Number(p.sessionFee.toString()),
        completedSessions: p.completedSessions,
        totalSessions: p.totalSessions,
        paymentStatus: p.paymentStatus,
        createdAt: p.createdAt,
        ...f,
      };
    }).filter((p) => p.currentDebt > 0.005 || p.finalRemainingBalance > 0.005);

    return {
      plans: withFinancials,
      patientBalance: Number(patient.balance.toString()),
    };
  }

  async create(dto: CreatePaymentDto, user: any) {
    if (dto.idempotencyKey) {
      const existing = await this.prisma.payment.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true } },
          branch: { select: { id: true, name: true } },
          createdByUser: { select: { id: true, firstName: true, lastName: true } },
          allocations: {
            include: { session: { select: { id: true, sessionNumber: true, treatmentPlanId: true } } },
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
    const planId: string | null = dto.treatmentPlanId ?? null;

    if (planId) {
      const plan = await this.prisma.treatmentPlan.findFirst({
        where: { id: planId, deletedAt: null },
      });
      if (!plan) throw new NotFoundException('Plani i trajtimit nuk u gjet');
      if (plan.patientId !== dto.patientId) {
        throw new BadRequestException('Plani i trajtimit nuk i përket këtij pacienti');
      }
    }

    let payment: any;
    for (let attempt = 0; attempt < 5; attempt++) {
      const invoiceNumber = await this.generateInvoiceNumber();
      try {
        payment = await this.prisma.$transaction(async (tx) => {
          const newPayment = await tx.payment.create({
            data: {
              patientId: dto.patientId,
              branchId,
              treatmentPlanId: planId,
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

          if (planId) {
            // Determine which sessions to allocate to
            let sessionAllocationsToApply: { sessionId: string; amount: Decimal }[] = [];

            if (dto.sessionAllocations?.length) {
              // Manual override from frontend
              for (const alloc of dto.sessionAllocations) {
                if (alloc.amount < 0.005) continue;
                sessionAllocationsToApply.push({
                  sessionId: alloc.sessionId,
                  amount: new Decimal(alloc.amount.toString()),
                });
              }
            } else {
              // Auto-FIFO: all completed sessions for this plan, oldest first
              const sessions = await tx.session.findMany({
                where: { treatmentPlanId: planId, deletedAt: null, status: 'COMPLETED' },
                orderBy: { completedAt: 'asc' },
                include: { paymentAllocations: { select: { amount: true } } },
              });

              let remaining = paymentAmount;
              for (const s of sessions) {
                if (remaining.lte(0.005)) break;
                const sessionPrice = new Decimal(s.amount?.toString() ?? '0');
                const alreadyPaid = s.paymentAllocations.reduce(
                  (acc, a) => acc.plus(new Decimal(a.amount.toString())),
                  new Decimal('0'),
                );
                const sessionDebt = sessionPrice.minus(alreadyPaid);
                if (sessionDebt.lte(0.005)) continue;
                const toAllocate = remaining.lte(sessionDebt) ? remaining : sessionDebt;
                sessionAllocationsToApply.push({ sessionId: s.id, amount: toAllocate });
                remaining = remaining.minus(toAllocate);
              }
              // Remainder stays as plan credit (not patient balance)
            }

            // Create allocation rows and update session.isPaid
            for (const alloc of sessionAllocationsToApply) {
              // Fetch current allocations for this session to determine if fully paid
              const session = await tx.session.findUnique({
                where: { id: alloc.sessionId },
                include: { paymentAllocations: { select: { amount: true } } },
              });
              if (!session) continue;

              await tx.paymentAllocation.create({
                data: { paymentId: newPayment.id, sessionId: alloc.sessionId, amount: alloc.amount },
              });

              const sessionPrice = new Decimal(session.amount?.toString() ?? '0');
              const totalPaid = session.paymentAllocations.reduce(
                (acc, a) => acc.plus(new Decimal(a.amount.toString())),
                new Decimal('0'),
              ).plus(alloc.amount);

              if (totalPaid.gte(sessionPrice.minus(0.005))) {
                await tx.session.update({ where: { id: alloc.sessionId }, data: { isPaid: true } });
              }
            }

            // Update plan.amountPaid (total payments received for this plan)
            await this.adjustPlanAmountPaid(planId, paymentAmount, tx);
          } else if (dto.sessionAllocations?.length) {
            // No plan but specific session allocations → standalone session payment.
            // Allocate directly to the session(s) and mark as paid when fully covered.
            for (const alloc of dto.sessionAllocations) {
              if (alloc.amount < 0.005) continue;
              const sess = await tx.session.findUnique({
                where: { id: alloc.sessionId },
                include: { paymentAllocations: { select: { amount: true } } },
              });
              if (!sess) continue;
              await tx.paymentAllocation.create({
                data: { paymentId: newPayment.id, sessionId: alloc.sessionId, amount: alloc.amount },
              });
              const sessPrice = new Decimal(sess.amount?.toString() ?? '0');
              const totalPaid = sess.paymentAllocations
                .reduce((acc, a) => acc.plus(new Decimal(a.amount.toString())), new Decimal('0'))
                .plus(new Decimal(alloc.amount.toString()));
              if (totalPaid.gte(sessPrice.minus(0.005))) {
                await tx.session.update({ where: { id: alloc.sessionId }, data: { isPaid: true } });
              }
            }
          } else {
            // No plan, no session allocations → patient.balance (general credit)
            await tx.patient.update({
              where: { id: dto.patientId },
              data: { balance: { increment: paymentAmount } },
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

    // Amount change: adjust plan.amountPaid proportionally
    const oldAmount = new Decimal(existing.amount.toString());
    const newAmount = dto.amount !== undefined ? new Decimal(dto.amount.toString()) : oldAmount;
    const amountDelta = newAmount.minus(oldAmount);

    if (!amountDelta.isZero() && existing.treatmentPlanId) {
      await this.adjustPlanAmountPaid(existing.treatmentPlanId, amountDelta);
    } else if (!amountDelta.isZero() && !existing.treatmentPlanId) {
      // Adjust patient balance for plan-less payments
      const pat = await this.prisma.patient.findUnique({
        where: { id: existing.patientId },
        select: { balance: true },
      });
      if (pat) {
        const newBal = new Decimal(pat.balance.toString()).plus(amountDelta);
        await this.prisma.patient.update({
          where: { id: existing.patientId },
          data: { balance: newBal.lt(0) ? new Decimal(0) : newBal },
        });
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
          include: { session: { select: { id: true, sessionNumber: true, treatmentPlanId: true } } },
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
      // Get session allocations before cascade-delete
      const allocations = await tx.paymentAllocation.findMany({
        where: { paymentId: id },
        select: { sessionId: true, amount: true },
      });

      // Recompute isPaid for each affected session after removing this payment's allocation
      for (const alloc of allocations) {
        const session = await tx.session.findUnique({
          where: { id: alloc.sessionId },
          include: {
            paymentAllocations: {
              where: { paymentId: { not: id } },
              select: { amount: true },
            },
          },
        });
        if (!session) continue;
        const remainingPaid = session.paymentAllocations.reduce((s, a) => s + Number(a.amount.toString()), 0);
        const sessionPrice = Number(session.amount?.toString() ?? '0');
        await tx.session.update({
          where: { id: alloc.sessionId },
          data: { isPaid: remainingPaid >= sessionPrice - 0.005 && sessionPrice > 0.005 },
        });
      }

      // Reverse plan.amountPaid or patient balance
      if (existing.treatmentPlanId) {
        await this.adjustPlanAmountPaid(
          existing.treatmentPlanId,
          new Decimal(existing.amount.toString()).negated(),
          tx,
        );
      } else if (!allocations.length) {
        // Plan-less payment with no session allocations → was a patient balance credit, reverse it
        const pat = await tx.patient.findUnique({
          where: { id: existing.patientId },
          select: { balance: true },
        });
        if (pat) {
          const newBal = new Decimal(pat.balance.toString()).minus(new Decimal(existing.amount.toString()));
          await tx.patient.update({
            where: { id: existing.patientId },
            data: { balance: newBal.lt(0) ? new Decimal(0) : newBal },
          });
        }
      }
      // Standalone session payment (no plan, has session allocations): only session.isPaid was
      // updated above — no patient balance to reverse.

      // PaymentAllocation rows cascade-deleted with Payment
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

  async getPlanFinancials(planId: string, user: any) {
    const plan = await this.prisma.treatmentPlan.findFirst({
      where: { id: planId, deletedAt: null },
      include: {
        patient: { select: { branchId: true } },
        sessions: {
          where: { deletedAt: null, status: 'COMPLETED' },
          include: { paymentAllocations: { select: { amount: true } } },
        },
      },
    });
    if (!plan) throw new NotFoundException('Plani i trajtimit nuk u gjet');

    if (user.role === Role.MANAGER) {
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      if (!userBranchIds.includes(plan.patient.branchId)) {
        throw new ForbiddenException('Nuk keni qasje në këtë plan trajtimi');
      }
    }

    const totalAllocations = (plan as any).sessions.reduce((sum: number, s: any) =>
      sum + s.paymentAllocations.reduce((a: number, b: any) => a + Number(b.amount.toString()), 0), 0);

    return computePlanFinancials(plan, totalAllocations || undefined);
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
        sessions: {
          where: { deletedAt: null, status: 'COMPLETED' },
          include: { paymentAllocations: { select: { amount: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const planDebts = plans
      .map((p) => {
        const totalAllocations = (p as any).sessions.reduce((sum: number, s: any) =>
          sum + s.paymentAllocations.reduce((a: number, b: any) => a + Number(b.amount.toString()), 0), 0);
        // Pass undefined when totalAllocations is 0 so computePlanFinancials falls
        // back to amountPaid — avoids inflated debt figures during the transition
        // period when the allocation table was cleared by the schema migration.
        const f = computePlanFinancials(p, totalAllocations || undefined);
        return {
          planId: p.id as string | null,
          sessionId: null as string | null,
          patient: { id: p.patient.id, firstName: p.patient.firstName, lastName: p.patient.lastName, phone: p.patient.phone },
          branch: p.patient.branch,
          lastPaymentAt: (p as any).payments[0]?.paidAt || null,
          ...f,
        };
      })
      .filter((d) => d.currentDebt > 0.005);

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
        availableCredit: 0,
        financiallyCoveredSessions: 0,
        paymentStatus: 'UNPAID' as string,
      };
    });

    const allDebts = [...planDebts, ...sessionDebts].sort((a, b) => b.currentDebt - a.currentDebt);
    const total = allDebts.length;
    const skip = (page - 1) * limit;
    return { data: allDebts.slice(skip, skip + limit), meta: buildPaginationMeta(total, page, limit) };
  }

  // Applies a signed delta to plan.amountPaid and recomputes paymentStatus.
  // Clamped at 0 to prevent negative amountPaid from reversals on sparse data.
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
