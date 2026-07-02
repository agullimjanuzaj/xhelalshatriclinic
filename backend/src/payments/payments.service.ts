import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaginationDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import { PaymentStatus, Role } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { computePlanFinancials } from './plan-financials.util';
import * as dayjs from 'dayjs';
import { PushService } from '../push/push.service';

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

    // Restrict by branch for managers
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

  async create(dto: CreatePaymentDto, user: any) {
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

    if (dto.treatmentPlanId) {
      const plan = await this.prisma.treatmentPlan.findFirst({
        where: { id: dto.treatmentPlanId, deletedAt: null },
      });
      if (!plan) throw new NotFoundException('Plani i trajtimit nuk u gjet');
      if (plan.patientId !== dto.patientId) {
        throw new BadRequestException('Plani i trajtimit nuk i përket këtij pacienti');
      }
    }

    // A multi-session payment must cover the full price of every selected
    // session — there's no sound way to apply a partial amount across
    // several sessions at once, so we either fully pay all of them or
    // reject the request outright (overpay is fine; it becomes prepaid
    // credit on the plan, same as any other overpayment).
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
      const totalSessionsAmount = targetSessions.reduce((sum, s) => sum.plus(s.amount ? new Decimal(s.amount.toString()) : new Decimal(0)), new Decimal(0));
      if (new Decimal(dto.amount).lt(totalSessionsAmount)) {
        throw new BadRequestException(
          `Shuma (${Number(dto.amount).toFixed(2)}€) duhet të jetë të paktën ${totalSessionsAmount.toFixed(2)}€ — totali i seancave të zgjedhura`,
        );
      }
    }

    const invoiceNumber = await this.generateInvoiceNumber();

    // A payment record always represents money actually received right now —
    // there is no "pending" payment. The PAID/PARTIALLY_PAID/UNPAID status the
    // user sees describes the treatment plan's overall balance, not this
    // transaction, and is computed automatically in updatePlanPaymentStatus.
    const payment = await this.prisma.payment.create({
      data: {
        patientId: dto.patientId,
        branchId,
        treatmentPlanId: dto.treatmentPlanId,
        invoiceNumber,
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
        treatmentPlan: { select: { id: true, totalSessions: true, completedSessions: true, totalAmount: true, amountPaid: true, paymentStatus: true } },
        createdByUser: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (targetSessions.length) {
      await this.prisma.session.updateMany({
        where: { id: { in: targetSessions.map((s) => s.id) } },
        data: { paymentId: payment.id, isPaid: true },
      });
    }

    if (dto.treatmentPlanId) {
      await this.adjustPlanAmountPaid(dto.treatmentPlanId, new Decimal(payment.amount.toString()));
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

    const oldPlanId = existing.treatmentPlanId;
    const newPlanId = dto.treatmentPlanId !== undefined ? dto.treatmentPlanId : oldPlanId;
    const oldAmount = new Decimal(existing.amount.toString());
    const newAmount = dto.amount !== undefined ? new Decimal(dto.amount) : oldAmount;

    // Reverse the old effect on whichever plan it was applied to, then apply
    // the new effect — handles amount changes, plan reassignment, or both.
    if (oldPlanId && oldPlanId !== newPlanId) {
      await this.adjustPlanAmountPaid(oldPlanId, oldAmount.negated());
    }
    if (newPlanId) {
      const delta = oldPlanId === newPlanId ? newAmount.minus(oldAmount) : newAmount;
      await this.adjustPlanAmountPaid(newPlanId, delta);
    }

    if (dto.sessionIds !== undefined) {
      // Always unlink whatever this payment used to cover first, then
      // re-validate and re-link the newly selected set — same all-or-nothing
      // rule as creation: the (possibly new) amount must cover their total.
      await this.prisma.session.updateMany({ where: { paymentId: id }, data: { paymentId: null, isPaid: false } });
      if (dto.sessionIds.length) {
        const targetSessions = await this.prisma.session.findMany({
          where: { id: { in: dto.sessionIds }, deletedAt: null },
        });
        if (targetSessions.length !== dto.sessionIds.length) {
          throw new NotFoundException('Një ose disa nga seancat e zgjedhura nuk u gjetën');
        }
        const totalSessionsAmount = targetSessions.reduce((sum, s) => sum.plus(s.amount ? new Decimal(s.amount.toString()) : new Decimal(0)), new Decimal(0));
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
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE',
        entity: 'payment',
        entityId: id,
        oldData: { amount: existing.amount.toString(), treatmentPlanId: oldPlanId },
        newData: { amount: updated.amount.toString(), treatmentPlanId: updated.treatmentPlanId },
      },
    });

    return updated;
  }

  async remove(id: string, user: any) {
    const existing = await this.findOne(id, user);
    await this.prisma.payment.update({ where: { id }, data: { deletedAt: new Date() } });

    // Voiding a payment must give back whatever debt it had cleared.
    if (existing.treatmentPlanId) {
      await this.adjustPlanAmountPaid(existing.treatmentPlanId, new Decimal(existing.amount.toString()).negated());
    }
    await this.prisma.session.updateMany({ where: { paymentId: id }, data: { paymentId: null, isPaid: false } });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'DELETE',
        entity: 'payment',
        entityId: id,
        oldData: { amount: existing.amount.toString(), treatmentPlanId: existing.treatmentPlanId, patientId: existing.patientId },
      },
    });

    return { message: 'Pagesa u fshi me sukses' };
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

    return {
      totalRevenue: totalRevenue._sum.amount || 0,
      paidCount,
      unpaidCount,
      partialCount,
    };
  }

  // Applies a signed delta to a plan's amountPaid (positive for a new/larger
  // payment, negative when reversing one on edit/void) and recomputes its
  // automatic payment status. Clamped at 0 so a data-entry correction can
  // never push paid-amount negative.
  private async adjustPlanAmountPaid(planId: string, delta: Decimal) {
    const plan = await this.prisma.treatmentPlan.findUnique({ where: { id: planId } });
    if (!plan) return;

    let newAmountPaid = new Decimal(plan.amountPaid.toString()).plus(delta);
    if (newAmountPaid.isNegative()) newAmountPaid = new Decimal(0);
    const { paymentStatus } = computePlanFinancials({ ...plan, amountPaid: newAmountPaid });

    await this.prisma.treatmentPlan.update({
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

  // Per-patient debt overview: every active (non-fully-paid) treatment plan,
  // with the earned-vs-paid breakdown, for the "Debt" section.
  //
  // Debt is a derived figure (completedSessions * sessionFee - paid), not a
  // stored column, so it can't be filtered/sorted with a plain SQL WHERE —
  // the candidate query is still bounded server-side (deletedAt/branchId),
  // computed once, then sliced to the requested page before returning. The
  // client never receives more than one page, so pagination is genuinely
  // enforced server-side even though the slice itself happens in Node.
  async getDebts(branchId: string | undefined, page: number, limit: number, user: any) {
    if (user.role === Role.MANAGER) {
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      branchId = branchId && userBranchIds.includes(branchId) ? branchId : userBranchIds[0];
    }

    const where: any = { deletedAt: null };
    if (branchId) where.patient = { branchId };

    const plans = await this.prisma.treatmentPlan.findMany({
      where,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, phone: true, branch: { select: { id: true, name: true } } } },
        payments: { where: { deletedAt: null }, orderBy: { paidAt: 'desc' }, take: 1, select: { paidAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const debts = plans
      .map((p) => ({
        planId: p.id,
        patient: { id: p.patient.id, firstName: p.patient.firstName, lastName: p.patient.lastName, phone: p.patient.phone },
        branch: p.patient.branch,
        lastPaymentAt: p.payments[0]?.paidAt || null,
        ...computePlanFinancials(p),
      }))
      .filter((d) => d.finalRemainingBalance > 0)
      .sort((a, b) => b.currentDebt - a.currentDebt);

    const total = debts.length;
    const skip = (page - 1) * limit;
    return { data: debts.slice(skip, skip + limit), meta: buildPaginationMeta(total, page, limit) };
  }

  private async generateInvoiceNumber(): Promise<string> {
    const year = dayjs().year();
    const count = await this.prisma.payment.count({
      where: { invoiceNumber: { startsWith: `FAT-${year}` } },
    });
    return `FAT-${year}-${String(count + 1).padStart(4, '0')}`;
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
