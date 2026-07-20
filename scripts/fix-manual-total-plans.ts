/**
 * Migration: Fix MANUAL_TOTAL treatment plans where sessions were created
 * with the standard branch fee instead of the effective (proportional) fee.
 *
 * Example:
 *   Plan: 10 sessions, manual total = 180 €, branch fee = 25 €
 *   Before: sessions stored at 25 €/each → debt = 250 - 180 = 70 € (WRONG)
 *   After:  sessions stored at 18 €/each → debt = 180 - 180 = 0 €  (CORRECT)
 *
 * Usage:
 *   npx ts-node scripts/fix-manual-total-plans.ts           # dry-run
 *   npx ts-node scripts/fix-manual-total-plans.ts --fix     # apply
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = !process.argv.includes('--fix');

function computeSessionPriceByIndex(totalAmount: number, totalSessions: number, index: number): number {
  if (totalSessions <= 0) return 0;
  const totalCents = Math.round(totalAmount * 100);
  const baseCents = Math.floor(totalCents / totalSessions);
  const remainder = totalCents % totalSessions;
  return (baseCents + (index < remainder ? 1 : 0)) / 100;
}

async function main() {
  console.log(`\n=== Fix Manual-Total Plans ${DRY_RUN ? '(DRY-RUN)' : '(FIX MODE)'} ===\n`);

  // Find plans where totalAmount ≠ sessionFee × totalSessions
  // (i.e., a manual total was set but sessions were stored at the wrong price).
  const plans = await prisma.treatmentPlan.findMany({
    where: { deletedAt: null },
    include: {
      patient: { select: { firstName: true, lastName: true } },
      sessions: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        include: { paymentAllocations: { select: { amount: true, paymentId: true } } },
      },
    },
  });

  let issueCount = 0;
  let fixCount = 0;

  for (const plan of plans) {
    const totalAmount = Number(plan.totalAmount);
    const sessionFee = Number(plan.sessionFee);
    const standardTotal = Math.round(sessionFee * plan.totalSessions * 100) / 100;

    // Skip plans where the manual total equals the standard total (no override)
    if (Math.abs(standardTotal - totalAmount) < 0.01) continue;

    // Expected per-session price (effective)
    const effectiveSessionFee = Math.round((totalAmount / plan.totalSessions) * 100) / 100;
    const isNonInteger = Math.abs(effectiveSessionFee * plan.totalSessions - totalAmount) > 0.005;

    // Sessions with wrong price (stored at standard, not effective)
    const wrongPriceSessions = plan.sessions.filter((s) => {
      const storedPrice = Number(s.amount ?? 0);
      const expectedPrice = computeSessionPriceByIndex(totalAmount, plan.totalSessions, 0); // rough check
      return Math.abs(storedPrice - effectiveSessionFee) > 0.02 && Math.abs(storedPrice - expectedPrice) > 0.02;
    });

    // Total session amounts as stored
    const currentSessionTotal = plan.sessions.reduce((s, x) => s + Number(x.amount ?? 0), 0);
    const expectedSessionTotal = plan.sessions.length > 0
      ? plan.sessions.reduce((sum, _, i) => sum + computeSessionPriceByIndex(totalAmount, plan.totalSessions, i), 0)
      : 0;

    // Total allocations
    const totalAllocations = plan.sessions.reduce((sum, s) =>
      sum + s.paymentAllocations.reduce((a, p) => a + Number(p.amount), 0), 0);

    const currentDebt = Math.max(0, Math.min(currentSessionTotal, totalAmount) - totalAllocations);
    const expectedDebt = Math.max(0, Math.min(expectedSessionTotal, totalAmount) - totalAllocations);

    if (Math.abs(currentSessionTotal - expectedSessionTotal) < 0.01 && plan.sessions.length === 0) continue;
    if (plan.sessions.length === 0 && Math.abs(Number(plan.sessionFee) - effectiveSessionFee) < 0.02) continue;

    const needsSessionFeeUpdate = Math.abs(Number(plan.sessionFee) - effectiveSessionFee) > 0.02;
    const needsSessionPriceUpdate = plan.sessions.length > 0 &&
      Math.abs(currentSessionTotal - expectedSessionTotal) > 0.02;
    const needsPricingModeUpdate = (plan as any).pricingMode !== 'MANUAL_TOTAL';

    if (!needsSessionFeeUpdate && !needsSessionPriceUpdate && !needsPricingModeUpdate) continue;

    issueCount++;
    console.log(
      `\n⚠  Plan ${plan.id}` +
      `\n   Pacient: ${plan.patient.firstName} ${plan.patient.lastName}` +
      `\n   Planned sessions: ${plan.totalSessions} | Manual total: ${totalAmount.toFixed(2)} €` +
      `\n   Standard total (${plan.totalSessions} × ${sessionFee}€): ${standardTotal.toFixed(2)} €` +
      `\n   Effective/session (expected): ${effectiveSessionFee.toFixed(2)} €` +
      (isNonInteger ? ` (cent-exact distribution)` : '') +
      `\n   Sessions stored: ${plan.sessions.length}` +
      `\n   Current session total: ${currentSessionTotal.toFixed(2)} €` +
      `\n   Expected session total: ${expectedSessionTotal.toFixed(2)} €` +
      `\n   Allocations: ${totalAllocations.toFixed(2)} €` +
      `\n   Current debt: ${currentDebt.toFixed(2)} €  →  Expected debt after fix: ${expectedDebt.toFixed(2)} €`,
    );

    if (!DRY_RUN) {
      await prisma.$transaction(async (tx) => {
        // 1. Update pricingMode on the plan
        await tx.treatmentPlan.update({
          where: { id: plan.id },
          data: {
            pricingMode: 'MANUAL_TOTAL',
            sessionFee: effectiveSessionFee,
          },
        });

        // 2. Update each session's amount to the cent-exact price
        for (let i = 0; i < plan.sessions.length; i++) {
          const sess = plan.sessions[i];
          const expectedPrice = computeSessionPriceByIndex(totalAmount, plan.totalSessions, i);
          const currentPrice = Number(sess.amount ?? 0);
          if (Math.abs(currentPrice - expectedPrice) < 0.005) continue; // already correct

          // Recompute isPaid based on allocations vs new price
          const allocatedForSession = sess.paymentAllocations.reduce((s, a) => s + Number(a.amount), 0);
          const isPaid = expectedPrice <= 0.005 || allocatedForSession >= expectedPrice - 0.005;

          await tx.session.update({
            where: { id: sess.id },
            data: { amount: expectedPrice, isPaid },
          });
        }
      });
      fixCount++;
      console.log(`   → Fixed: pricingMode=MANUAL_TOTAL, sessionFee=${effectiveSessionFee.toFixed(2)} €, ${plan.sessions.length} session(s) updated`);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Plans affected: ${issueCount}`);
  if (!DRY_RUN) console.log(`  Plans fixed: ${fixCount}`);
  if (DRY_RUN && issueCount > 0) {
    console.log(`\n  Run with --fix to apply corrections (after taking a database backup).`);
  }
  if (issueCount === 0) console.log('  ✓ No issues — all plans are consistent.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
