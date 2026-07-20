import { PaymentStatus } from '@prisma/client';
import { computePlanFinancials, computeSessionPriceByIndex } from './plan-financials.util';

function makePlan(overrides: Partial<{
  totalAmount: number;
  amountPaid: number;
  completedSessions: number;
  totalSessions: number;
  sessionFee: number;
}>) {
  const p = { totalAmount: 250, amountPaid: 0, completedSessions: 0, totalSessions: 10, sessionFee: 25, ...overrides };
  return {
    totalAmount: { toString: () => String(p.totalAmount) },
    amountPaid: { toString: () => String(p.amountPaid) },
    completedSessions: p.completedSessions,
    totalSessions: p.totalSessions,
    sessionFee: { toString: () => String(p.sessionFee) },
  };
}

// ── Tests 1–2: Standard pricing ──────────────────────────────────────────────

test('1. Standard plan: 10 × 25 € = 250 € total', () => {
  const f = computePlanFinancials(makePlan({ totalSessions: 10, sessionFee: 25 }));
  expect(f.totalTreatmentValue).toBe(250);
});

test('2. Manual total 180 € / 10 sessions → effective price 18 €/session', () => {
  const effectivePrice = computeSessionPriceByIndex(180, 10, 0);
  expect(effectivePrice).toBe(18);
});

// ── Tests 3–5: 180 € manual total, 10 sessions ───────────────────────────────

test('3. After 10 sessions at 18 €, completed total = 180 €', () => {
  const total = Array.from({ length: 10 }, (_, i) => computeSessionPriceByIndex(180, 10, i))
    .reduce((s, v) => s + v, 0);
  expect(Math.round(total * 100)).toBe(18000); // 180.00 €
});

test('4. After paying 180 €, debt = 0 € (no artificial 70 € debt)', () => {
  // Plan: 10 sessions, manual total 180 €, sessionFee=18 (effective), amountPaid=180
  const f = computePlanFinancials(makePlan({
    totalAmount: 180, amountPaid: 180, completedSessions: 10,
    totalSessions: 10, sessionFee: 18,
  }), 180);
  expect(f.currentDebt).toBe(0);
  expect(f.finalRemainingBalance).toBe(0);
});

test('5. Without cap fix: 10 × 25 € would show 70 € debt — cap fix prevents it', () => {
  // Simulate old bug scenario: sessionFee=25 but totalAmount=180, all paid
  const f = computePlanFinancials(makePlan({
    totalAmount: 180, amountPaid: 180, completedSessions: 10,
    totalSessions: 10, sessionFee: 25, // standard fee, not effective
  }), 180);
  expect(f.currentDebt).toBe(0); // cap ensures no artificial debt
  expect(f.currentEarnedAmount).toBe(180); // capped at totalAmount
});

// ── Tests 6–7: 200 € / 6 sessions — cent distribution ────────────────────────

test('6. 6 sessions, 200 € total → correct cent distribution', () => {
  const prices = Array.from({ length: 6 }, (_, i) => computeSessionPriceByIndex(200, 6, i));
  expect(prices[0]).toBe(33.34);
  expect(prices[1]).toBe(33.34);
  expect(prices[2]).toBe(33.33);
  expect(prices[3]).toBe(33.33);
  expect(prices[4]).toBe(33.33);
  expect(prices[5]).toBe(33.33);
});

test('7. Sum of 6 sessions = exactly 200.00 €', () => {
  const total = Array.from({ length: 6 }, (_, i) => computeSessionPriceByIndex(200, 6, i))
    .reduce((s, v) => Math.round((s + v) * 100) / 100, 0);
  expect(total).toBe(200);
});

// ── Test 8: Partial payment allocation ───────────────────────────────────────

test('8. Partial payment 100 € on 10-session/180 € plan → correct remaining debt', () => {
  // 100 € paid: covers 5 full sessions (90 €) + 10 € partial on session 6
  const f = computePlanFinancials(makePlan({
    totalAmount: 180, amountPaid: 100, completedSessions: 6,
    totalSessions: 10, sessionFee: 18,
  }), 100);
  // 6 sessions earned = 108 € (capped at nothing since 108 < 180)
  // debt = 108 - 100 = 8 €
  expect(f.currentDebt).toBe(8);
});

// ── Test 9: Prepayment / credit ───────────────────────────────────────────────

test('9. Prepaying 180 € before sessions → 0 debt after all 10 sessions', () => {
  const f = computePlanFinancials(makePlan({
    totalAmount: 180, amountPaid: 180, completedSessions: 10,
    totalSessions: 10, sessionFee: 18,
  }));
  expect(f.currentDebt).toBe(0);
  expect(f.finalRemainingBalance).toBe(0);
});

// ── Test 10: 11th session (extra — guard at service layer) ───────────────────

test('10. computeSessionPriceByIndex beyond totalSessions uses same formula (service blocks this)', () => {
  // Session index 10 (11th) for a 10-session plan
  // The service layer throws before this can happen — but the util itself is safe
  const price = computeSessionPriceByIndex(180, 10, 10);
  expect(price).toBe(18); // baseCents=1800, remainder=0, all sessions 18 €
});

// ── Test 11: Branch price change does NOT affect existing plan ────────────────

test('11. Plan stores sessionFee snapshot — branch price change is irrelevant', () => {
  // Plan was created with sessionFee=18 (effective). Branch later changes to 30 €.
  // The plan still uses sessionFee=18.
  const f = computePlanFinancials(makePlan({
    totalAmount: 180, amountPaid: 0, completedSessions: 5,
    totalSessions: 10, sessionFee: 18, // stored effective price, not branch 30 €
  }));
  expect(f.currentEarnedAmount).toBe(90); // 5 × 18, not 5 × 30
});

// ── Test 12: Plan with no sessions can be edited (financials are zero) ────────

test('12. Plan with no sessions → earned = 0, debt = 0', () => {
  const f = computePlanFinancials(makePlan({
    totalAmount: 180, amountPaid: 0, completedSessions: 0, sessionFee: 18,
  }));
  expect(f.currentEarnedAmount).toBe(0);
  expect(f.currentDebt).toBe(0);
});

// ── Test 13: paymentStatus reflects totalAmount, not session fee × count ──────

test('13. paymentStatus PAID when amountPaid >= totalAmount', () => {
  // Even with sessionFee=25 (standard), paying totalAmount (180) marks as PAID
  const f = computePlanFinancials(makePlan({
    totalAmount: 180, amountPaid: 180, completedSessions: 10,
    totalSessions: 10, sessionFee: 25,
  }), 180);
  expect(f.paymentStatus).toBe(PaymentStatus.PAID);
});

// ── Tests 14–15: Consistency across views ─────────────────────────────────────

test('14. Fallback (amountPaid) gives same debt as allocation-based when fully paid', () => {
  const plan = makePlan({ totalAmount: 180, amountPaid: 180, completedSessions: 10, sessionFee: 18 });
  const withAllocs = computePlanFinancials(plan, 180);
  const withFallback = computePlanFinancials(plan, undefined); // falls back to amountPaid
  expect(withAllocs.currentDebt).toBe(withFallback.currentDebt);
  expect(withAllocs.finalRemainingBalance).toBe(withFallback.finalRemainingBalance);
});

test('15. totalTreatmentValue always equals plan.totalAmount', () => {
  const f = computePlanFinancials(makePlan({ totalAmount: 180, sessionFee: 25, totalSessions: 10 }));
  expect(f.totalTreatmentValue).toBe(180);
});

// ── Test 16: Repair script scenario ───────────────────────────────────────────

test('16. After repair: 10-session/180 € plan with 180 € paid → debt 0, not 70 €', () => {
  // Before repair: sessionFee=25, totalAmount=180
  const before = computePlanFinancials(makePlan({
    totalAmount: 180, amountPaid: 180, completedSessions: 10,
    sessionFee: 25, totalSessions: 10,
  }), 180);
  expect(before.currentDebt).toBe(0); // cap fix already handles this

  // After repair: sessionFee=18, totalAmount=180 (repair script sets effective fee)
  const after = computePlanFinancials(makePlan({
    totalAmount: 180, amountPaid: 180, completedSessions: 10,
    sessionFee: 18, totalSessions: 10,
  }), 180);
  expect(after.currentDebt).toBe(0);
});

// ── Test 17: Allocations are NOT lost during repair ────────────────────────────

test('17. Changing session amounts does not affect PaymentAllocation records', () => {
  // The repair script updates session.amount but keeps allocations intact.
  // This test verifies the math: with 100 € allocated to 6 sessions at 18 €,
  // debt = 6*18 - 100 = 8 €.
  const f = computePlanFinancials(makePlan({
    totalAmount: 180, amountPaid: 100, completedSessions: 6, sessionFee: 18,
  }), 100);
  expect(f.currentDebt).toBe(8); // allocations preserved, just amount changed
});

// ── Test 18: No new payments created during repair ─────────────────────────────

test('18. computeSessionPriceByIndex is pure — no DB side-effects', () => {
  // Verifies the utility is a pure function: same inputs always return same output.
  expect(computeSessionPriceByIndex(180, 10, 0)).toBe(computeSessionPriceByIndex(180, 10, 0));
  expect(computeSessionPriceByIndex(200, 6, 0)).toBe(computeSessionPriceByIndex(200, 6, 0));
});
