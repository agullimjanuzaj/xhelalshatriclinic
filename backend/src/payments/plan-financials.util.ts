import { PaymentStatus } from '@prisma/client';

export interface PlanFinancials {
  totalTreatmentValue: number;
  totalSessions: number;
  completedSessionsCount: number;
  currentEarnedAmount: number;
  totalPaidAmount: number;
  currentDebt: number;
  totalRemainingTreatmentValue: number;
  finalRemainingBalance: number;
  prepaidAmount: number;
  availableCredit: number;
  financiallyCoveredSessions: number;
  paymentStatus: PaymentStatus;
}

interface PlanLike {
  totalAmount: { toString(): string };
  amountPaid: { toString(): string };
  completedSessions: number;
  totalSessions: number;
  sessionFee: { toString(): string };
}

// Computes plan financials.
// `totalSessionAllocations` = sum(PaymentAllocation.amount) for sessions of this plan.
// When omitted, falls back to amountPaid (backward-compat for list views without
// the extra join).
export function computePlanFinancials(
  plan: PlanLike,
  totalSessionAllocations?: number,
): PlanFinancials {
  const totalTreatmentValue = Number(plan.totalAmount.toString());
  const totalPaidAmount = Number(plan.amountPaid.toString());
  const completed = plan.completedSessions;
  const sessionFee = Number(plan.sessionFee.toString());

  const currentEarnedAmount = Math.max(0, completed) * sessionFee;
  // Credit = money received but not yet allocated to individual sessions
  const effectiveAllocations = totalSessionAllocations ?? totalPaidAmount;
  const availableCredit = Math.max(0, totalPaidAmount - effectiveAllocations);
  const currentDebt = Math.max(0, currentEarnedAmount - effectiveAllocations);
  const prepaidAmount = availableCredit;
  const totalRemainingTreatmentValue = Math.max(0, totalTreatmentValue - currentEarnedAmount);
  const finalRemainingBalance = Math.max(0, totalTreatmentValue - totalPaidAmount);
  const financiallyCoveredSessions = sessionFee > 0
    ? Math.min(Math.floor((effectiveAllocations + availableCredit) / sessionFee), plan.totalSessions)
    : 0;

  let paymentStatus: PaymentStatus;
  if (totalPaidAmount <= 0) paymentStatus = PaymentStatus.UNPAID;
  else if (totalPaidAmount >= totalTreatmentValue - 0.005) paymentStatus = PaymentStatus.PAID;
  else paymentStatus = PaymentStatus.PARTIALLY_PAID;

  return {
    totalTreatmentValue,
    totalSessions: plan.totalSessions,
    completedSessionsCount: completed,
    currentEarnedAmount,
    totalPaidAmount,
    currentDebt,
    totalRemainingTreatmentValue,
    finalRemainingBalance,
    prepaidAmount,
    availableCredit,
    financiallyCoveredSessions,
    paymentStatus,
  };
}

// Compute per-session allocation total for a plan's completed sessions.
export function computeSessionDebt(
  sessions: {
    amount: { toString(): string } | null;
    paymentAllocations: { amount: { toString(): string } }[];
  }[],
): number {
  return sessions.reduce((debt, s) => {
    const price = Number(s.amount?.toString() ?? '0');
    const paid = s.paymentAllocations.reduce((sum, a) => sum + Number(a.amount.toString()), 0);
    return debt + Math.max(0, price - paid);
  }, 0);
}
