import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as dayjs from 'dayjs';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getAdminStats(branchId?: string) {
    const where: any = { deletedAt: null };
    const paymentWhere: any = { deletedAt: null };
    const sessionWhere: any = { deletedAt: null };

    if (branchId) {
      where.branchId = branchId;
      paymentWhere.branchId = branchId;
      sessionWhere.branchId = branchId;
    }

    const startOfMonth = dayjs().startOf('month').toDate();
    const startOfYear = dayjs().startOf('year').toDate();
    const today = dayjs().startOf('day').toDate();
    const tomorrow = dayjs().add(1, 'day').startOf('day').toDate();

    const [
      totalPatients,
      activePatients,
      activeInClinicCount,
      totalSessions,
      completedSessions,
      todaySessions,
      monthSessions,
      totalTreatments,
      totalRevenue,
      monthRevenue,
      yearRevenue,
      outstandingBalance,
      revenueByBranch,
      sessionsByBranch,
      recentSessions,
      recentPayments,
    ] = await Promise.all([
      this.prisma.patient.count({ where }),
      this.prisma.patient.count({ where: { ...where, isActive: true } }),
      this.prisma.patient.count({ where: { ...where, activeInClinic: true, activeInClinicExpiresAt: { gt: new Date() } } }),
      this.prisma.session.count({ where: sessionWhere }),
      this.prisma.session.count({ where: { ...sessionWhere, status: 'COMPLETED' } }),
      this.prisma.session.count({
        where: { ...sessionWhere, scheduledAt: { gte: today, lt: tomorrow } },
      }),
      this.prisma.session.count({
        where: { ...sessionWhere, scheduledAt: { gte: startOfMonth } },
      }),
      this.prisma.treatment.count({ where: { deletedAt: null } }),
      this.prisma.payment.aggregate({ where: { ...paymentWhere, status: 'PAID' }, _sum: { amount: true } }),
      this.prisma.payment.aggregate({
        where: { ...paymentWhere, status: 'PAID', paidAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { ...paymentWhere, status: 'PAID', paidAt: { gte: startOfYear } },
        _sum: { amount: true },
      }),
      this.prisma.treatmentPlan.aggregate({
        where: { deletedAt: null, ...(branchId ? { patient: { branchId } } : {}) },
        _sum: { amountPaid: true, totalAmount: true },
      }),
      this.prisma.payment.groupBy({
        by: ['branchId'],
        where: { ...paymentWhere, status: 'PAID' },
        _sum: { amount: true },
      }),
      this.prisma.session.groupBy({
        by: ['branchId'],
        where: { ...sessionWhere, status: 'COMPLETED' },
        _count: { id: true },
      }),
      this.prisma.session.findMany({
        where: sessionWhere,
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          patient: { select: { firstName: true, lastName: true } },
          physiotherapist: { select: { firstName: true, lastName: true } },
          completedByUser: { select: { firstName: true, lastName: true } },
          branch: { select: { name: true } },
        },
      }),
      this.prisma.payment.findMany({
        where: paymentWhere,
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          patient: { select: { firstName: true, lastName: true } },
          branch: { select: { name: true } },
        },
      }),
    ]);

    // Enrich branch data
    const branches = await this.prisma.branch.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    });
    const branchMap = Object.fromEntries(branches.map((b) => [b.id, b.name]));

    const revenueByBranchEnriched = revenueByBranch.map((r) => ({
      branchId: r.branchId,
      branchName: branchMap[r.branchId] || 'E panjohur',
      revenue: r._sum.amount || 0,
    }));

    const sessionsByBranchEnriched = sessionsByBranch.map((s) => ({
      branchId: s.branchId,
      branchName: branchMap[s.branchId] || 'E panjohur',
      sessions: s._count.id,
    }));

    const totalPaid = outstandingBalance._sum.amountPaid || 0;
    const totalOwed = outstandingBalance._sum.totalAmount || 0;

    return {
      overview: {
        totalPatients,
        activePatients,
        activeInClinicCount,
        totalSessions,
        completedSessions,
        todaySessions,
        monthSessions,
        totalTreatments,
      },
      revenue: {
        total: totalRevenue._sum.amount || 0,
        month: monthRevenue._sum.amount || 0,
        year: yearRevenue._sum.amount || 0,
        outstanding: Number(totalOwed) - Number(totalPaid),
      },
      byBranch: {
        revenue: revenueByBranchEnriched,
        sessions: sessionsByBranchEnriched,
      },
      recent: {
        sessions: recentSessions,
        payments: recentPayments,
      },
    };
  }

  async getManagerStats(userId: string, branchId: string) {
    const startOfMonth = dayjs().startOf('month').toDate();
    const today = dayjs().startOf('day').toDate();
    const tomorrow = dayjs().add(1, 'day').startOf('day').toDate();

    const [
      patients,
      todaySessions,
      monthSessions,
      monthRevenue,
      unpaidPlans,
      recentPatients,
    ] = await Promise.all([
      this.prisma.patient.count({ where: { branchId, deletedAt: null } }),
      this.prisma.session.count({ where: { branchId, scheduledAt: { gte: today, lt: tomorrow }, deletedAt: null } }),
      this.prisma.session.count({ where: { branchId, scheduledAt: { gte: startOfMonth }, deletedAt: null } }),
      this.prisma.payment.aggregate({ where: { branchId, status: 'PAID', paidAt: { gte: startOfMonth }, deletedAt: null }, _sum: { amount: true } }),
      this.prisma.treatmentPlan.count({ where: { patient: { branchId }, paymentStatus: { not: 'PAID' }, deletedAt: null } }),
      this.prisma.patient.findMany({ where: { branchId, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 5 }),
    ]);

    return {
      patients,
      todaySessions,
      monthSessions,
      monthRevenue: monthRevenue._sum.amount || 0,
      unpaidPlans,
      recentPatients,
    };
  }

  async getPhysiotherapistStats(userId: string) {
    const startOfMonth = dayjs().startOf('month').toDate();
    const today = dayjs().startOf('day').toDate();
    const tomorrow = dayjs().add(1, 'day').startOf('day').toDate();

    // A session is "this physio's" if they're assigned to it OR they're the
    // one who actually completed it — assignment can be left blank (e.g. on
    // a plan with no physio set yet) while completedByUserId is always the
    // person who did the work. And date filtering must use completedAt, not
    // scheduledAt: sessions are created already-COMPLETED with no explicit
    // scheduled time in the normal flow, so scheduledAt is usually null and
    // "today's sessions" would always read 0 even right after completing one.
    const mine = { OR: [{ physiotherapistId: userId }, { completedByUserId: userId }] };

    const [
      totalSessions,
      todaySessions,
      monthSessions,
      totalTreatments,
      monthTreatments,
      completedSessions,
    ] = await Promise.all([
      this.prisma.session.count({ where: { ...mine, deletedAt: null } }),
      this.prisma.session.count({ where: { ...mine, completedAt: { gte: today, lt: tomorrow }, deletedAt: null } }),
      this.prisma.session.count({ where: { ...mine, completedAt: { gte: startOfMonth }, deletedAt: null } }),
      this.prisma.treatment.count({ where: { physiotherapistId: userId, deletedAt: null } }),
      this.prisma.treatment.count({ where: { physiotherapistId: userId, createdAt: { gte: startOfMonth }, deletedAt: null } }),
      this.prisma.session.count({ where: { ...mine, status: 'COMPLETED', deletedAt: null } }),
    ]);

    return {
      totalSessions,
      todaySessions,
      monthSessions,
      totalTreatments,
      monthTreatments,
      completedSessions,
    };
  }

  async getRevenueChart(branchId?: string, year?: number) {
    const targetYear = year || dayjs().year();
    const months = Array.from({ length: 12 }, (_, i) => i);

    const data = await Promise.all(
      months.map(async (month) => {
        const start = dayjs().year(targetYear).month(month).startOf('month').toDate();
        const end = dayjs().year(targetYear).month(month).endOf('month').toDate();
        const result = await this.prisma.payment.aggregate({
          where: {
            status: 'PAID',
            paidAt: { gte: start, lte: end },
            deletedAt: null,
            ...(branchId ? { branchId } : {}),
          },
          _sum: { amount: true },
        });
        const monthNames = ['Jan', 'Shk', 'Mar', 'Pri', 'Maj', 'Qer', 'Kor', 'Gus', 'Sht', 'Tet', 'Nën', 'Dhj'];
        return {
          month: monthNames[month],
          revenue: Number(result._sum.amount || 0),
        };
      }),
    );

    return data;
  }
}
