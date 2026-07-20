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

  // ── 4. Non-plan payments with unallocated credit but patient has outstanding sessions ─
  // These are payments where the old FIFO bug (treatmentPlanId:null filter) caused
  // the full payment to go to patient.balance instead of allocating to sessions.
  // Fix: run FIFO allocation post-hoc and decrement patient.balance accordingly.
  console.log('\n▸ Checking non-plan payments: unallocated credit vs outstanding session debt...');

  const nonPlanPayments = await prisma.payment.findMany({
    where: { deletedAt: null, treatmentPlanId: null },
    include: { allocations: { select: { amount: true } } },
    orderBy: { createdAt: 'asc' },
  });

  for (const p of nonPlanPayments) {
    const paymentAllocated = p.allocations.reduce((s, a) => s + Number(a.amount), 0);
    const unallocatedCredit = Math.max(0, Math.round((Number(p.amount) - paymentAllocated) * 100) / 100);
    if (unallocatedCredit < 0.005) continue; // fully allocated — nothing to fix

    // Find patient's outstanding sessions with remaining debt
    const outstandingSessions = await prisma.session.findMany({
      where: { patientId: p.patientId, deletedAt: null, status: 'COMPLETED', isPaid: false },
      orderBy: { createdAt: 'asc' },
      include: { paymentAllocations: { select: { amount: true, paymentId: true } } },
    });

    const sessionsWithDebt = outstandingSessions.map((s) => {
      const paidAmt = s.paymentAllocations.reduce((a, b) => a + Number(b.amount), 0);
      return { ...s, remainingDebt: Math.max(0, Number(s.amount || 0) - paidAmt) };
    }).filter((s) => s.remainingDebt > 0.005);

    if (!sessionsWithDebt.length) continue; // no outstanding debt — credit is legitimate

    // Simulate FIFO allocation of unallocated credit to outstanding sessions
    let toDistribute = unallocatedCredit;
    const allocsToCreate: { sessionId: string; amount: number }[] = [];
    for (const s of sessionsWithDebt) {
      if (toDistribute < 0.005) break;
      const portion = Math.min(toDistribute, s.remainingDebt);
      allocsToCreate.push({ sessionId: s.id, amount: Math.round(portion * 100) / 100 });
      toDistribute -= portion;
    }

    if (!allocsToCreate.length) continue;

    const totalNewAlloc = allocsToCreate.reduce((s, a) => s + a.amount, 0);
    const patient = await prisma.patient.findUnique({
      where: { id: p.patientId },
      select: { id: true, firstName: true, lastName: true, balance: true },
    });
    if (!patient) continue;

    const balanceBefore = Number(patient.balance);
    const balanceAfter = Math.max(0, Math.round((balanceBefore - totalNewAlloc) * 100) / 100);
    const debtAfter = Math.round((sessionsWithDebt.reduce((s, x) => s + x.remainingDebt, 0) - totalNewAlloc) * 100) / 100;

    issueCount++;
    console.log(
      `  ⚠ Payment ${(p as any).invoiceNumber || p.id} — ${patient.firstName} ${patient.lastName}` +
      `\n    Payment: ${Number(p.amount).toFixed(2)} € | Currently allocated: ${paymentAllocated.toFixed(2)} €` +
      `\n    Unallocated credit in balance: ${unallocatedCredit.toFixed(2)} €` +
      `\n    Sessions with debt: ${sessionsWithDebt.length} (total debt: ${sessionsWithDebt.reduce((s, x) => s + x.remainingDebt, 0).toFixed(2)} €)` +
      `\n    Should allocate: ${totalNewAlloc.toFixed(2)} € across ${allocsToCreate.length} session(s)` +
      `\n    Balance before → after repair: ${balanceBefore.toFixed(2)} € → ${balanceAfter.toFixed(2)} €` +
      `\n    Debt after repair: ${Math.max(0, debtAfter).toFixed(2)} €`,
    );

    if (!DRY_RUN) {
      await prisma.$transaction(async (tx) => {
        for (const alloc of allocsToCreate) {
          await tx.paymentAllocation.create({
            data: { paymentId: p.id, sessionId: alloc.sessionId, amount: alloc.amount },
          });
          const sess = await tx.session.findUnique({
            where: { id: alloc.sessionId },
            include: { paymentAllocations: { select: { amount: true } } },
          });
          if (sess) {
            const nowPaid = sess.paymentAllocations.reduce((s, a) => s + Number(a.amount), 0);
            const sessPrice = Number(sess.amount || 0);
            if (sessPrice > 0.005 && nowPaid >= sessPrice - 0.005) {
              await tx.session.update({ where: { id: alloc.sessionId }, data: { isPaid: true } });
            }
          }
        }
        // Reduce patient.balance by the newly allocated amount
        await tx.patient.update({
          where: { id: patient.id },
          data: { balance: balanceAfter },
        });
      });
      fixCount++;
      console.log(
        `    → Fixed: ${allocsToCreate.length} allocation(s) created, balance set to ${balanceAfter.toFixed(2)} €`,
      );
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Issues found: ${issueCount}`);
  if (!DRY_RUN) console.log(`  Issues fixed: ${fixCount}`);
  if (DRY_RUN && issueCount > 0) {
    console.log(`\n  Run with --fix to apply corrections (after taking a database backup).`);
    console.log(`  NOTE: if Check 4 (orphaned payments) reports issues, fix those FIRST — they affect balance.`);
  }
  if (issueCount === 0) console.log('  ✓ No issues found — database is consistent.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
