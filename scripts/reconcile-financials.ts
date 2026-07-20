/**
 * Financial Reconciliation Script — Xhelal Shatri Clinic
 *
 * Finds patients/plans where financial data is inconsistent:
 *   - TreatmentPlan.amountPaid doesn't match sum of Payment amounts for that plan
 *   - TreatmentPlan.paymentStatus doesn't match its actual amountPaid
 *   - Session.isPaid doesn't match its total PaymentAllocation sum
 *   - Patient.balance doesn't match unallocated credit
 *
 * Usage:
 *   npx ts-node scripts/reconcile-financials.ts           # dry-run (no changes)
 *   npx ts-node scripts/reconcile-financials.ts --fix     # apply corrections
 */

import { PrismaClient, PaymentStatus } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = !process.argv.includes('--fix');

function computeStatus(amountPaid: number, totalAmount: number): PaymentStatus {
  if (amountPaid <= 0) return PaymentStatus.UNPAID;
  if (amountPaid >= totalAmount - 0.005) return PaymentStatus.PAID;
  return PaymentStatus.PARTIALLY_PAID;
}

async function main() {
  console.log(`\n=== Reconcile Financials ${DRY_RUN ? '(DRY-RUN — no changes)' : '(FIX MODE)'} ===\n`);

  let issueCount = 0;
  let fixCount = 0;

  // ── 1. Plan.amountPaid vs sum of Payment.amount for that plan ─────────────
  console.log('▸ Checking plan amountPaid vs payment sums...');
  const allPlans = await prisma.treatmentPlan.findMany({
    where: { deletedAt: null },
    include: {
      payments: { where: { deletedAt: null }, select: { amount: true } },
      patient: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  for (const plan of allPlans) {
    const paymentSum = plan.payments.reduce((s, p) => s + Number(p.amount), 0);
    const storedPaid = Number(plan.amountPaid);
    const expectedStatus = computeStatus(storedPaid, Number(plan.totalAmount));

    if (Math.abs(paymentSum - storedPaid) > 0.01) {
      issueCount++;
      console.log(
        `  ⚠ Plan ${plan.id} — patient: ${plan.patient.firstName} ${plan.patient.lastName}` +
        `\n    amountPaid=${storedPaid.toFixed(2)} but sum(payments)=${paymentSum.toFixed(2)}`,
      );
      if (!DRY_RUN) {
        const newStatus = computeStatus(paymentSum, Number(plan.totalAmount));
        await prisma.treatmentPlan.update({
          where: { id: plan.id },
          data: { amountPaid: paymentSum, paymentStatus: newStatus },
        });
        fixCount++;
        console.log(`    → Fixed: amountPaid=${paymentSum.toFixed(2)}, status=${newStatus}`);
      }
    }

    if (plan.paymentStatus !== expectedStatus) {
      issueCount++;
      console.log(
        `  ⚠ Plan ${plan.id} — paymentStatus=${plan.paymentStatus} but should be ${expectedStatus}`,
      );
      if (!DRY_RUN) {
        await prisma.treatmentPlan.update({
          where: { id: plan.id },
          data: { paymentStatus: expectedStatus },
        });
        fixCount++;
        console.log(`    → Fixed: paymentStatus=${expectedStatus}`);
      }
    }
  }

  // ── 2. Session.isPaid vs PaymentAllocation sum ───────────────────────────
  console.log('\n▸ Checking session isPaid vs allocation sums...');
  const sessions = await prisma.session.findMany({
    where: { deletedAt: null, status: 'COMPLETED' },
    include: { paymentAllocations: { select: { amount: true } } },
  });

  for (const session of sessions) {
    const allocated = session.paymentAllocations.reduce((s, a) => s + Number(a.amount), 0);
    const price = Number(session.amount ?? 0);
    const shouldBePaid = price > 0.005 && allocated >= price - 0.005;

    if (session.isPaid !== shouldBePaid) {
      issueCount++;
      console.log(
        `  ⚠ Session ${session.id} — isPaid=${session.isPaid} but allocated=${allocated.toFixed(2)}/price=${price.toFixed(2)}`,
      );
      if (!DRY_RUN) {
        await prisma.session.update({ where: { id: session.id }, data: { isPaid: shouldBePaid } });
        fixCount++;
        console.log(`    → Fixed: isPaid=${shouldBePaid}`);
      }
    }
  }

  // ── 3. Patient.balance vs unallocated credit ─────────────────────────────
  // Formula: balance = sum(payment.amount) - sum(payment.allocations.amount) for plan-less payments
  console.log('\n▸ Checking patient balances (plan-less unallocated credit)...');
  const patients = await prisma.patient.findMany({
    where: { deletedAt: null },
    include: {
      payments: {
        where: { deletedAt: null, treatmentPlanId: null },
        select: {
          amount: true,
          allocations: { select: { amount: true } },
        },
      },
    },
  });

  for (const patient of patients) {
    const computedBalance = patient.payments.reduce((s, p) => {
      const allocated = (p as any).allocations.reduce((a: number, alloc: any) => a + Number(alloc.amount), 0);
      return s + Math.max(0, Number(p.amount) - allocated);
    }, 0);
    const storedBalance = Number(patient.balance);

    if (Math.abs(computedBalance - storedBalance) > 0.01) {
      issueCount++;
      console.log(
        `  ⚠ Patient ${patient.id} — ${patient.firstName} ${patient.lastName}` +
        `\n    balance=${storedBalance.toFixed(2)} but plan-less payments sum=${computedBalance.toFixed(2)}`,
      );
      if (!DRY_RUN) {
        await prisma.patient.update({
          where: { id: patient.id },
          data: { balance: computedBalance },
        });
        fixCount++;
        console.log(`    → Fixed: balance=${computedBalance.toFixed(2)}`);
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Issues found: ${issueCount}`);
  if (!DRY_RUN) console.log(`  Issues fixed: ${fixCount}`);
  if (DRY_RUN && issueCount > 0) {
    console.log(`\n  Run with --fix to apply corrections (after taking a database backup).`);
  }
  if (issueCount === 0) console.log('  ✓ No issues found — database is consistent.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
