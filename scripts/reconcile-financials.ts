/**
 * Financial Reconciliation Script — Xhelal Shatri Clinic
 *
 * Finds patients/plans where:
 *   - Patient.balance doesn't match computed unallocated credit
 *   - TreatmentPlan.amountPaid doesn't match sum of PaymentAllocation amounts
 *   - Plans that should be (partially) paid from existing patient balance
 *   - Plans whose paymentStatus doesn't match their actual amountPaid
 *
 * Usage:
 *   npx ts-node scripts/reconcile-financials.ts           # dry-run (no changes)
 *   npx ts-node scripts/reconcile-financials.ts --fix     # apply corrections
 *
 * ALWAYS take a database backup before running with --fix.
 */

import { PrismaClient, PaymentStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();
const DRY_RUN = !process.argv.includes('--fix');

// Mirror of backend computePlanFinancials
function computeStatus(amountPaid: number, totalAmount: number): PaymentStatus {
  if (amountPaid <= 0) return PaymentStatus.UNPAID;
  if (amountPaid >= totalAmount - 0.005) return PaymentStatus.PAID;
  return PaymentStatus.PARTIALLY_PAID;
}

async function main() {
  console.log(`\n=== Reconcile Financials ${DRY_RUN ? '(DRY-RUN — no changes)' : '(FIX MODE)'} ===\n`);

  let issueCount = 0;
  let fixCount = 0;

  // ── 1. Plan amountPaid vs PaymentAllocation sum ──────────────────────────
  console.log('▸ Checking plan amountPaid vs allocation sums...');
  const allPlans = await prisma.treatmentPlan.findMany({
    where: { deletedAt: null },
    include: {
      paymentAllocations: true,
      patient: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  for (const plan of allPlans) {
    const allocSum = plan.paymentAllocations.reduce(
      (s, a) => s + Number(a.amount),
      0,
    );
    const storedPaid = Number(plan.amountPaid);
    const expectedStatus = computeStatus(storedPaid, Number(plan.totalAmount));

    // Only flag allocation mismatch when PaymentAllocation rows exist
    if (plan.paymentAllocations.length > 0 && Math.abs(allocSum - storedPaid) > 0.01) {
      issueCount++;
      console.log(
        `  ⚠ Plan ${plan.id} — patient: ${plan.patient.firstName} ${plan.patient.lastName}` +
        `\n    amountPaid=${storedPaid.toFixed(2)} but alloc sum=${allocSum.toFixed(2)} (diff=${(allocSum - storedPaid).toFixed(2)})`,
      );
      if (!DRY_RUN) {
        const newStatus = computeStatus(allocSum, Number(plan.totalAmount));
        await prisma.treatmentPlan.update({
          where: { id: plan.id },
          data: { amountPaid: allocSum, paymentStatus: newStatus },
        });
        fixCount++;
        console.log(`    → Fixed: amountPaid=${allocSum.toFixed(2)}, status=${newStatus}`);
      }
    }

    // Check paymentStatus is consistent with amountPaid
    if (plan.paymentStatus !== expectedStatus) {
      issueCount++;
      console.log(
        `  ⚠ Plan ${plan.id} — paymentStatus=${plan.paymentStatus} but should be ${expectedStatus}` +
        ` (paid=${storedPaid.toFixed(2)} / total=${Number(plan.totalAmount).toFixed(2)})`,
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

  // ── 2. Patient.balance vs computed unallocated credit ───────────────────
  console.log('\n▸ Checking patient balances...');
  const patients = await prisma.patient.findMany({
    where: { deletedAt: null },
    include: {
      payments: {
        where: { deletedAt: null },
        include: { allocations: true },
      },
    },
  });

  for (const patient of patients) {
    // Unallocated credit = sum(payment.amount) - sum(all allocations for that payment)
    let computedBalance = 0;
    for (const payment of patient.payments) {
      const allocated = payment.allocations.reduce((s, a) => s + Number(a.amount), 0);
      const surplus = Number(payment.amount) - allocated;
      if (surplus > 0.005) computedBalance += surplus;
    }
    computedBalance = Math.round(computedBalance * 100) / 100;

    const storedBalance = Math.round(Number(patient.balance) * 100) / 100;

    if (Math.abs(computedBalance - storedBalance) > 0.01) {
      issueCount++;
      console.log(
        `  ⚠ Patient ${patient.id} — ${patient.firstName} ${patient.lastName}` +
        `\n    balance=${storedBalance.toFixed(2)} but computed=${computedBalance.toFixed(2)}`,
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

  // ── 3. Plans that could be paid from patient balance ────────────────────
  console.log('\n▸ Checking for plans that could be auto-paid from patient balance...');
  for (const patient of patients) {
    const balance = Number(patient.balance);
    if (balance < 0.01) continue;
    const unpaidPlans = allPlans.filter(
      (p) =>
        p.patientId === patient.id &&
        p.paymentStatus !== PaymentStatus.PAID &&
        Number(p.totalAmount) - Number(p.amountPaid) > 0.01,
    );
    if (unpaidPlans.length > 0) {
      const totalDebt = unpaidPlans.reduce(
        (s, p) => s + (Number(p.totalAmount) - Number(p.amountPaid)),
        0,
      );
      console.log(
        `  ℹ Patient ${patient.firstName} ${patient.lastName} — balance=${balance.toFixed(2)}€,` +
        ` unpaid plan debt=${totalDebt.toFixed(2)}€`,
      );
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
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
