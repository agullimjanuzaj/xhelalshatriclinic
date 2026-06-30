import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { computePlanFinancials } from '../payments/plan-financials.util';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { ClinicSettingsService } from '../clinic-settings/clinic-settings.service';
import * as dayjs from 'dayjs';

export interface ReportsOverviewFilter {
  month?: string; // 'YYYY-MM'
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
  branchId?: string;
  patientId?: string;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clinicSettingsService: ClinicSettingsService,
  ) {}

  async getOverview(filter: ReportsOverviewFilter, user: any) {
    let { branchId, userId } = filter;
    const { patientId } = filter;
    const isPhysio = user.role === 'PHYSIOTHERAPIST';
    const isManager = user.role === 'MANAGER';

    if (isManager) {
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      branchId = branchId && userBranchIds.includes(branchId) ? branchId : userBranchIds[0];
    }
    // A physiotherapist can only ever see their own activity, never another
    // user's or clinic-wide financials.
    if (isPhysio) userId = user.id;

    let from: Date | undefined;
    let to: Date | undefined;
    if (filter.month) {
      const m = dayjs(filter.month + '-01');
      from = m.startOf('month').toDate();
      to = m.endOf('month').toDate();
    } else {
      if (filter.dateFrom) from = dayjs(filter.dateFrom).startOf('day').toDate();
      if (filter.dateTo) to = dayjs(filter.dateTo).endOf('day').toDate();
    }

    const dateRange = (from || to) ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;

    const patientWhere: any = { deletedAt: null };
    if (branchId) patientWhere.branchId = branchId;

    const sessionWhere: any = { deletedAt: null, status: 'COMPLETED' };
    if (branchId) sessionWhere.branchId = branchId;
    if (userId) sessionWhere.physiotherapistId = userId;
    if (patientId) sessionWhere.patientId = patientId;
    if (dateRange) sessionWhere.completedAt = dateRange;

    const planWhere: any = { deletedAt: null };
    if (branchId) planWhere.patient = { branchId };
    if (patientId) planWhere.patientId = patientId;
    if (userId) planWhere.OR = [{ createdByUserId: userId }, { assignedPhysiotherapistId: userId }];
    const planCreatedWhere = { ...planWhere, ...(dateRange ? { createdAt: dateRange } : {}) };

    const [totalPatients, activePatients, sessionsCompleted, treatmentsCreated] = await Promise.all([
      this.prisma.patient.count({ where: patientWhere }),
      this.prisma.patient.count({ where: { ...patientWhere, OR: [{ activeInClinic: true }, { status: 'IN_TREATMENT' }] } }),
      this.prisma.session.count({ where: sessionWhere }),
      this.prisma.treatmentPlan.count({ where: planCreatedWhere }),
    ]);

    const base: any = { totalPatients, activePatients, sessionsCompleted, treatmentsCreated };

    // Financial figures are clinic/branch-sensitive — never shown to a physiotherapist
    if (isPhysio) return base;

    const paymentWhere: any = { deletedAt: null, status: 'PAID' };
    if (branchId) paymentWhere.branchId = branchId;
    if (patientId) paymentWhere.patientId = patientId;
    if (dateRange) paymentWhere.paidAt = dateRange;

    const [paymentsReceived, plans, revenueByDateRaw] = await Promise.all([
      this.prisma.payment.aggregate({ where: paymentWhere, _sum: { amount: true } }),
      this.prisma.treatmentPlan.findMany({ where: planWhere }),
      this.prisma.payment.findMany({
        where: paymentWhere,
        select: { amount: true, paidAt: true },
        orderBy: { paidAt: 'asc' },
      }),
    ]);

    const financials = plans.map((p) => computePlanFinancials(p));
    const totalTreatmentValue = financials.reduce((s, f) => s + f.totalTreatmentValue, 0);
    const currentDebt = financials.reduce((s, f) => s + f.currentDebt, 0);
    const outstandingBalances = financials.reduce((s, f) => s + f.finalRemainingBalance, 0);

    const revenueByDateMap = new Map<string, number>();
    for (const p of revenueByDateRaw) {
      const key = dayjs(p.paidAt).format('YYYY-MM-DD');
      revenueByDateMap.set(key, (revenueByDateMap.get(key) || 0) + Number(p.amount));
    }
    const revenueByDate = Array.from(revenueByDateMap.entries()).map(([date, revenue]) => ({ date, revenue }));

    // Can't groupBy a COALESCE(physiotherapistId, completedByUserId) directly
    // in Prisma, so the candidate sessions are fetched (already bounded by
    // sessionWhere) and bucketed in JS — attributing a session with no
    // assigned physiotherapist to whoever actually completed/recorded it
    // (often an Admin) instead of collapsing them into "Pa fizioterapeut".
    const sessionsForUserBreakdown = await this.prisma.session.findMany({
      where: sessionWhere,
      select: { physiotherapistId: true, completedByUserId: true, amount: true },
    });
    const userIds = [
      ...new Set(
        sessionsForUserBreakdown
          .map((s) => s.physiotherapistId || s.completedByUserId)
          .filter((id): id is string => !!id),
      ),
    ];
    const users = userIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const userMap2 = Object.fromEntries(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

    const sessionsByUserMap = new Map<string, { userId: string | null; userName: string; sessions: number; revenue: number }>();
    for (const s of sessionsForUserBreakdown) {
      const key = s.physiotherapistId || s.completedByUserId || 'unassigned';
      const entry = sessionsByUserMap.get(key) || {
        userId: s.physiotherapistId || s.completedByUserId || null,
        userName: key === 'unassigned' ? 'Nuk është caktuar' : userMap2[key] || 'I panjohur',
        sessions: 0,
        revenue: 0,
      };
      entry.sessions += 1;
      entry.revenue += Number(s.amount || 0);
      sessionsByUserMap.set(key, entry);
    }
    const sessionsByUser = Array.from(sessionsByUserMap.values());

    return {
      ...base,
      paymentsReceived: paymentsReceived._sum.amount || 0,
      totalTreatmentValue,
      currentDebt,
      outstandingBalances,
      revenueByDate,
      sessionsByUser,
    };
  }

  async getSessionsReport(
    filter: { branchId?: string; physiotherapistId?: string; month?: string; dateFrom?: string; dateTo?: string; groupBy?: 'branch' | 'physiotherapist' | 'day' | 'month' },
    user?: any,
  ) {
    let { branchId } = filter;
    let { dateFrom, dateTo } = filter;
    const { groupBy = 'day' } = filter;
    const isPhysio = user?.role === 'PHYSIOTHERAPIST';
    if (user?.role === 'MANAGER') {
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      branchId = userBranchIds[0];
    }
    if (filter.month) {
      const m = dayjs(filter.month, 'YYYY-MM');
      dateFrom = m.startOf('month').toISOString();
      dateTo = m.endOf('month').toISOString();
    }
    const where: any = { deletedAt: null, status: 'COMPLETED' };
    if (branchId) where.branchId = branchId;
    // Physiotherapist can only ever see their own sessions, regardless of what's requested
    where.physiotherapistId = isPhysio ? user.id : filter.physiotherapistId || undefined;
    if (!where.physiotherapistId) delete where.physiotherapistId;
    if (dateFrom || dateTo) {
      where.completedAt = {};
      if (dateFrom) where.completedAt.gte = new Date(dateFrom);
      if (dateTo) where.completedAt.lte = new Date(dateTo);
    }

    if (groupBy === 'branch') {
      const data = await this.prisma.session.groupBy({
        by: ['branchId'],
        where,
        _count: { id: true },
        _sum: { amount: true },
      });
      const branches = await this.prisma.branch.findMany({ where: { deletedAt: null } });
      const branchMap = Object.fromEntries(branches.map((b) => [b.id, b.name]));
      return data.map((d) => ({
        branchId: d.branchId,
        branchName: branchMap[d.branchId] || 'E panjohur',
        sessions: d._count.id,
        ...(isPhysio ? {} : { revenue: d._sum.amount || 0 }),
      }));
    }

    if (groupBy === 'physiotherapist') {
      // Same COALESCE-by-hand situation as ReportsService.getOverview: a
      // session with no assigned physiotherapist is attributed to whoever
      // completed/recorded it (often an Admin) rather than collapsing into
      // an unhelpful "I panjohur" bucket.
      const sessionsForBreakdown = await this.prisma.session.findMany({
        where,
        select: { physiotherapistId: true, completedByUserId: true, amount: true },
      });
      const userIds = [
        ...new Set(
          sessionsForBreakdown.map((s) => s.physiotherapistId || s.completedByUserId).filter((id): id is string => !!id),
        ),
      ];
      const users = userIds.length
        ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } })
        : [];
      const userMap = Object.fromEntries(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

      const grouped = new Map<string, { physiotherapistId: string | null; physiotherapistName: string; sessions: number; revenue: number }>();
      for (const s of sessionsForBreakdown) {
        const key = s.physiotherapistId || s.completedByUserId || 'unassigned';
        const entry = grouped.get(key) || {
          physiotherapistId: s.physiotherapistId || s.completedByUserId || null,
          physiotherapistName: key === 'unassigned' ? 'Nuk është caktuar' : userMap[key] || 'I panjohur',
          sessions: 0,
          revenue: 0,
        };
        entry.sessions += 1;
        entry.revenue += Number(s.amount || 0);
        grouped.set(key, entry);
      }
      return Array.from(grouped.values()).map((d) => ({
        physiotherapistId: d.physiotherapistId,
        physiotherapistName: d.physiotherapistName,
        sessions: d.sessions,
        ...(isPhysio ? {} : { revenue: d.revenue }),
      }));
    }

    const list = await this.prisma.session.findMany({
      where,
      orderBy: { completedAt: 'desc' },
      take: 500,
      select: {
        id: true,
        scheduledAt: true,
        completedAt: true,
        status: true,
        sessionNumber: true,
        ...(isPhysio ? {} : { amount: true }),
        patient: { select: { firstName: true, lastName: true } },
        branch: { select: { name: true } },
        physiotherapist: { select: { firstName: true, lastName: true } },
        completedByUser: { select: { firstName: true, lastName: true } },
      },
    });

    if (groupBy === 'day') {
      const counts = new Map<string, number>();
      for (const s of list) {
        if (!s.completedAt) continue;
        const key = dayjs(s.completedAt).format('YYYY-MM-DD');
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const chart = Array.from(counts.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));
      return { chart, list };
    }

    return list;
  }

  // Revenue breakdown for Reports → "Të ardhurat" tab. A physiotherapist
  // never reaches this — the controller route only allows ADMIN/MANAGER —
  // and a manager is pinned to their own branch regardless of what's asked.
  async getRevenueReport(
    filter: { branchId?: string; userId?: string; month?: string; dateFrom?: string; dateTo?: string; groupBy?: 'month' | 'branch' | 'day' | 'user' },
    user?: any,
  ) {
    let { branchId } = filter;
    const { userId, month, groupBy = 'month' } = filter;
    let { dateFrom, dateTo } = filter;
    if (user?.role === 'MANAGER') {
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      branchId = userBranchIds[0];
    }
    if (month) {
      const start = dayjs(month, 'YYYY-MM').startOf('month');
      dateFrom = start.toISOString();
      dateTo = start.endOf('month').toISOString();
    }

    const where: any = { deletedAt: null, status: 'PAID' };
    if (branchId) where.branchId = branchId;
    if (userId) where.createdByUserId = userId;
    if (dateFrom || dateTo) {
      where.paidAt = {};
      if (dateFrom) where.paidAt.gte = new Date(dateFrom);
      if (dateTo) where.paidAt.lte = new Date(dateTo);
    }

    if (groupBy === 'branch') {
      const data = await this.prisma.payment.groupBy({
        by: ['branchId'],
        where,
        _sum: { amount: true },
        _count: { id: true },
      });
      const branches = await this.prisma.branch.findMany({ where: { deletedAt: null } });
      const branchMap = Object.fromEntries(branches.map((b) => [b.id, b.name]));
      return data
        .map((d) => ({ branchId: d.branchId, branchName: branchMap[d.branchId], revenue: Number(d._sum.amount || 0), payments: d._count.id }))
        .sort((a, b) => b.revenue - a.revenue);
    }

    if (groupBy === 'user') {
      const data = await this.prisma.payment.groupBy({
        by: ['createdByUserId'],
        where,
        _sum: { amount: true },
        _count: { id: true },
      });
      const userIds = data.map((d) => d.createdByUserId).filter(Boolean) as string[];
      const users = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } });
      const userMap = Object.fromEntries(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
      return data
        .map((d) => ({
          userId: d.createdByUserId,
          userName: d.createdByUserId ? userMap[d.createdByUserId] || 'I panjohur' : 'I panjohur',
          revenue: Number(d._sum.amount || 0),
          payments: d._count.id,
        }))
        .sort((a, b) => b.revenue - a.revenue);
    }

    // 'month' or 'day' — Prisma can't group by a truncated date, so pull the
    // (bounded, paid-only) rows and bucket them in memory.
    const payments = await this.prisma.payment.findMany({
      where,
      orderBy: { paidAt: 'desc' },
      take: 2000,
      select: { amount: true, paidAt: true, createdAt: true },
    });

    const bucketFormat = groupBy === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM';
    const buckets = new Map<string, { revenue: number; payments: number }>();
    for (const p of payments) {
      const key = dayjs(p.paidAt || p.createdAt).format(bucketFormat);
      const bucket = buckets.get(key) || { revenue: 0, payments: 0 };
      bucket.revenue += Number(p.amount);
      bucket.payments += 1;
      buckets.set(key, bucket);
    }

    return Array.from(buckets.entries())
      .map(([period, v]) => ({ period, revenue: v.revenue, payments: v.payments }))
      .sort((a, b) => (a.period < b.period ? 1 : -1));
  }

  async getOutstandingBalances(
    filter: {
      branchId?: string; patientId?: string; userId?: string; month?: string; dateFrom?: string; dateTo?: string;
      paymentStatus?: string; page?: number; limit?: number;
    } = {},
    user?: any,
  ) {
    let branchId = filter.branchId;
    if (user?.role === 'MANAGER') {
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      branchId = branchId && userBranchIds.includes(branchId) ? branchId : userBranchIds[0];
    }

    let dateFrom = filter.dateFrom;
    let dateTo = filter.dateTo;
    if (filter.month) {
      const m = dayjs(filter.month, 'YYYY-MM');
      dateFrom = m.startOf('month').toISOString();
      dateTo = m.endOf('month').toISOString();
    }

    // Debt/balance is a current-state figure (computePlanFinancials below
    // never changes), so the date/user filter only controls WHICH plans are
    // included in the list — by when the plan was created and who created
    // or is assigned to it — never how the figures themselves are computed.
    const where: any = { paymentStatus: { not: 'PAID' }, deletedAt: null };
    if (branchId) where.patient = { branchId };
    if (filter.patientId) where.patientId = filter.patientId;
    if (filter.paymentStatus) where.paymentStatus = filter.paymentStatus;
    if (filter.userId) where.OR = [{ createdByUserId: filter.userId }, { assignedPhysiotherapistId: filter.userId }];
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const plans = await this.prisma.treatmentPlan.findMany({
      where,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, phone: true, branch: { select: { id: true, name: true } } } },
        payments: { where: { deletedAt: null }, orderBy: { paidAt: 'desc' }, take: 1, select: { paidAt: true } },
      },
      orderBy: { totalAmount: 'desc' },
    });

    const balances = plans.map((p) => ({
      planId: p.id,
      patient: { id: p.patient.id, firstName: p.patient.firstName, lastName: p.patient.lastName, phone: p.patient.phone },
      branch: p.patient.branch,
      treatment: p.diagnosis || 'Trajtim',
      lastPaymentDate: p.payments[0]?.paidAt || null,
      ...computePlanFinancials(p),
      // Legacy field names kept for any existing consumers
      totalAmount: p.totalAmount,
      amountPaid: p.amountPaid,
    }));

    // Same situation as PaymentsService.getDebts: the balance is derived,
    // not a stored column, so pagination is applied in-memory after a
    // server-bounded query rather than via SQL OFFSET — the client still
    // only ever receives one page.
    const page = Number(filter.page) || 1;
    const limit = Number(filter.limit) || 24;
    const total = balances.length;
    const skip = (page - 1) * limit;
    return { data: balances.slice(skip, skip + limit), meta: buildPaginationMeta(total, page, limit) };
  }

  // Bonus per completed trajtim/seancë — each branch sets its own
  // bonusPerCompletedSession; totalBonus = completedSessions * that rate,
  // summed across branches if a physio worked at more than one. ADMIN sees
  // everyone, MANAGER is pinned to their own branch, PHYSIOTHERAPIST only
  // ever sees their own row (enforced here, not just at the controller).
  async getBonusReport(
    filter: { month?: string; dateFrom?: string; dateTo?: string; userId?: string; branchId?: string },
    user: any,
  ) {
    let { branchId, userId } = filter;
    const isPhysio = user.role === 'PHYSIOTHERAPIST';
    const isManager = user.role === 'MANAGER';

    if (isManager) {
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      branchId = branchId && userBranchIds.includes(branchId) ? branchId : userBranchIds[0];
    }
    if (isPhysio) userId = user.id;

    let dateFrom = filter.dateFrom;
    let dateTo = filter.dateTo;
    if (filter.month) {
      const m = dayjs(filter.month, 'YYYY-MM');
      dateFrom = m.startOf('month').toISOString();
      dateTo = m.endOf('month').toISOString();
    }

    const where: any = { deletedAt: null, status: 'COMPLETED', physiotherapistId: { not: null } };
    if (branchId) where.branchId = branchId;
    if (userId) where.physiotherapistId = userId;
    if (dateFrom || dateTo) {
      where.completedAt = {};
      if (dateFrom) where.completedAt.gte = new Date(dateFrom);
      if (dateTo) where.completedAt.lte = new Date(dateTo);
    }

    const [grouped, bonusRate] = await Promise.all([
      this.prisma.session.groupBy({ by: ['physiotherapistId'], where, _count: { id: true } }),
      this.clinicSettingsService.getBonusPerCompletedSession(),
    ]);

    const physioIds = grouped.map((g) => g.physiotherapistId).filter(Boolean) as string[];
    const physios = physioIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: physioIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const physioMap = Object.fromEntries(physios.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));

    return grouped
      .filter((g) => g.physiotherapistId)
      .map((g) => ({
        userId: g.physiotherapistId as string,
        userName: physioMap[g.physiotherapistId as string] || 'I panjohur',
        completedSessions: g._count.id,
        bonusPerCompletedSession: bonusRate,
        totalBonus: g._count.id * bonusRate,
      }))
      .sort((a, b) => b.totalBonus - a.totalBonus);
  }

  async getPatientActivityReport(branchId?: string, user?: any) {
    if (user?.role === 'MANAGER') {
      const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      branchId = userBranchIds[0];
    }
    const where: any = { deletedAt: null };
    if (branchId) where.branchId = branchId;

    const patients = await this.prisma.patient.findMany({
      where,
      include: {
        _count: { select: { sessions: true, treatmentPlans: true } },
        branch: { select: { name: true } },
        treatmentPlans: {
          where: { deletedAt: null },
          select: { paymentStatus: true, amountPaid: true, totalAmount: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return patients;
  }
}
