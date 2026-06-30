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
  paymentStatus: PaymentStatus;
}

interface PlanLike {
  totalAmount: { toString(): string };
  amountPaid: { toString(): string };
  completedSessions: number;
  totalSessions: number;
  sessionFee: { toString(): string };
}

// Single per-session price now drives every figure — no more first-session
// vs. regular-session split:
//   totalValue     = totalSessions * sessionFee
//   completedValue = completedSessions * sessionFee
//   debt           = completedValue - paidAmount
//   finalBalance   = totalValue - paidAmount
// "Earned"/"completed value" is what's actually owed so far — a patient who
// has done 3/10 sessions at 20€ has earned 60€ of value, not the full
// totalAmount, and that's the debt baseline.
export function computePlanFinancials(plan: PlanLike): PlanFinancials {
  const totalTreatmentValue = Number(plan.totalAmount.toString());
  const totalPaidAmount = Number(plan.amountPaid.toString());
  const completed = plan.completedSessions;
  const sessionFee = Number(plan.sessionFee.toString());

  const currentEarnedAmount = Math.max(0, completed) * sessionFee;
  const currentDebt = Math.max(0, currentEarnedAmount - totalPaidAmount);
  const prepaidAmount = Math.max(0, totalPaidAmount - currentEarnedAmount);
  const totalRemainingTreatmentValue = Math.max(0, totalTreatmentValue - currentEarnedAmount);
  const finalRemainingBalance = Math.max(0, totalTreatmentValue - totalPaidAmount);

  let paymentStatus: PaymentStatus;
  if (totalPaidAmount <= 0) paymentStatus = PaymentStatus.UNPAID;
  else if (totalPaidAmount >= totalTreatmentValue) paymentStatus = PaymentStatus.PAID;
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
    paymentStatus,
  };
}
