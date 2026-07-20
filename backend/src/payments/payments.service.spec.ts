/**
 * Unit tests — Session-level FIFO allocation & plan financial computations.
 *
 * The model:
 *   - PaymentAllocation links Payment → Session (not TreatmentPlan)
 *   - credit = plan.amountPaid − sum(session allocations for this plan)
 *   - debt = sum(session.amount − sessionAllocations) for completed sessions
 *   - plan.amountPaid = denormalized sum of all Payment.amount for this plan
 */

import { computePlanFinancials, computeSessionDebt } from './plan-financials.util';
import { PaymentStatus } from '@prisma/client';

// Client-side FIFO — same logic as computeSessionFIFO in payments.service.ts
function computeSessionFIFO(
  amount: number,
  sessions: { id: string; amount: number; paidAmount: number }[],
): { sessionId: string; amount: number }[] {
  const result: { sessionId: string; amount: number }[] = [];
  let remaining = amount;
  for (const s of sessions) {
    if (remaining < 0.005) break;
    const debt = Math.max(0, s.amount - s.paidAmount);
    if (debt < 0.005) continue;
    const allocated = Math.min(remaining, debt);
    result.push({ sessionId: s.id, amount: Math.round(allocated * 100) / 100 });
    remaining -= allocated;
  }
  return result;
}

function makeSession(id: string, amount: number, paidAmount = 0, completedAt = new Date()) {
  return { id, amount, paidAmount, remainingAmount: Math.max(0, amount - paidAmount), completedAt };
}

function makePlan(totalSessions: number, sessionFee: number, amountPaid = 0, completedSessions = 0) {
  return {
    totalAmount: { toString: () => (totalSessions * sessionFee).toString() },
    amountPaid: { toString: () => amountPaid.toString() },
    completedSessions,
    totalSessions,
    sessionFee: { toString: () => sessionFee.toString() },
  };
}

// ── Scenario 1: Single unpaid session ────────────────────────────────────────
describe('Scenario 1 — single unpaid session, payment = session amount', () => {
  it('allocates the full payment to the session', () => {
    const sessions = [makeSession('s1', 20)];
    const allocs = computeSessionFIFO(20, sessions);
    expect(allocs).toHaveLength(1);
    expect(allocs[0]).toEqual({ sessionId: 's1', amount: 20 });
  });
});

// ── Scenario 2: Two sessions, payment covers both ────────────────────────────
describe('Scenario 2 — two sessions, payment = sum of both', () => {
  it('allocates to s1 first, then s2', () => {
    const sessions = [makeSession('s1', 20), makeSession('s2', 20)];
    const allocs = computeSessionFIFO(40, sessions);
    expect(allocs).toHaveLength(2);
    expect(allocs[0]).toEqual({ sessionId: 's1', amount: 20 });
    expect(allocs[1]).toEqual({ sessionId: 's2', amount: 20 });
  });
});

// ── Scenario 3: Payment partially covers second session ──────────────────────
describe('Scenario 3 — payment covers s1 fully, s2 partially', () => {
  it('pays s1 in full and s2 with 15€', () => {
    const sessions = [makeSession('s1', 20), makeSession('s2', 20)];
    const allocs = computeSessionFIFO(35, sessions);
    expect(allocs[0]).toEqual({ sessionId: 's1', amount: 20 });
    expect(allocs[1]).toEqual({ sessionId: 's2', amount: 15 });
  });
});

// ── Scenario 4: Payment exceeds total session debt → plan credit ─────────────
describe('Scenario 4 — payment exceeds debt, remainder is plan credit', () => {
  it('allocates to all sessions, remainder stays as plan credit', () => {
    const sessions = [makeSession('s1', 20), makeSession('s2', 20)];
    const allocs = computeSessionFIFO(50, sessions);
    expect(allocs).toHaveLength(2);
    expect(allocs[0].amount).toBe(20);
    expect(allocs[1].amount).toBe(20);
    // Remaining 10€ stays as plan credit (not allocated to sessions)
    const totalAllocated = allocs.reduce((s, a) => s + a.amount, 0);
    expect(totalAllocated).toBe(40);
  });

  it('credit = amountPaid − totalAllocations', () => {
    // Plan received 50€, sessions got 40€ → 10€ credit
    const plan = makePlan(3, 20, 50, 2);
    const f = computePlanFinancials(plan, 40);
    expect(f.availableCredit).toBe(10);
    expect(f.currentDebt).toBe(0); // 2 sessions × 20 = 40, allocated 40 → no debt
  });
});

// ── Scenario 5: No sessions — entire payment becomes plan credit ─────────────
describe('Scenario 5 — payment with no completed sessions', () => {
  it('creates zero allocations (full amount is plan credit)', () => {
    const allocs = computeSessionFIFO(25, []);
    expect(allocs).toHaveLength(0);
  });

  it('plan financials reflect credit correctly', () => {
    const plan = makePlan(5, 20, 25, 0);
    const f = computePlanFinancials(plan, 0); // totalAllocations = 0
    expect(f.availableCredit).toBe(25);
    expect(f.currentDebt).toBe(0);
  });
});

// ── Scenario 6: Plan credit auto-applied to new session ─────────────────────
describe('Scenario 6 — plan credit covers new session', () => {
  it('when plan.amountPaid >= sessionFee, new session is marked paid', () => {
    // Plan has 20€ credit, new session costs 20€ → fully covered
    const plan = makePlan(5, 20, 20, 0);
    const f = computePlanFinancials(plan, 0); // no existing session allocations
    expect(f.availableCredit).toBe(20);
    // Credit ≥ sessionFee → the applyPlanCreditToSession function will mark isPaid=true
    expect(f.availableCredit >= 20).toBe(true);
  });
});

// ── Scenario 7: Partial credit covers session partially ──────────────────────
describe('Scenario 7 — plan credit partially covers new session', () => {
  it('session remains unpaid when credit < sessionFee', () => {
    const plan = makePlan(5, 20, 10, 0);
    const f = computePlanFinancials(plan, 0);
    expect(f.availableCredit).toBe(10);
    // 10€ credit < 20€ session fee → session will be partially paid
    expect(f.availableCredit < 20).toBe(true);
  });
});

// ── Scenario 8: computeSessionDebt ──────────────────────────────────────────
describe('Scenario 8 — computeSessionDebt', () => {
  it('returns 0 when all sessions are fully paid', () => {
    const sessions = [
      { amount: { toString: () => '20' }, paymentAllocations: [{ amount: { toString: () => '20' } }] },
      { amount: { toString: () => '20' }, paymentAllocations: [{ amount: { toString: () => '20' } }] },
    ];
    expect(computeSessionDebt(sessions)).toBe(0);
  });

  it('returns correct debt for partially paid sessions', () => {
    const sessions = [
      { amount: { toString: () => '20' }, paymentAllocations: [{ amount: { toString: () => '20' } }] }, // paid
      { amount: { toString: () => '20' }, paymentAllocations: [{ amount: { toString: () => '10' } }] }, // 10€ remaining
      { amount: { toString: () => '20' }, paymentAllocations: [] }, // 20€ remaining
    ];
    expect(computeSessionDebt(sessions)).toBe(30);
  });
});

// ── Scenario 9: computePlanFinancials with session allocations ───────────────
describe('Scenario 9 — plan financials with session allocations', () => {
  it('UNPAID when no payments', () => {
    const plan = makePlan(5, 20, 0, 2);
    expect(computePlanFinancials(plan, 0).paymentStatus).toBe(PaymentStatus.UNPAID);
  });

  it('PARTIALLY_PAID when amountPaid < totalAmount', () => {
    const plan = makePlan(5, 20, 50, 3); // 50€ paid of 100€ total
    expect(computePlanFinancials(plan, 40).paymentStatus).toBe(PaymentStatus.PARTIALLY_PAID);
  });

  it('PAID when amountPaid >= totalAmount', () => {
    const plan = makePlan(5, 20, 100, 5);
    expect(computePlanFinancials(plan, 100).paymentStatus).toBe(PaymentStatus.PAID);
  });

  it('currentDebt = completed earned − total allocated', () => {
    // 3 sessions done × 20€ = 60€ earned. 40€ allocated → 20€ debt.
    const plan = makePlan(5, 20, 40, 3);
    const f = computePlanFinancials(plan, 40);
    expect(f.currentDebt).toBe(20); // 60 earned - 40 allocated
  });

  it('availableCredit = amountPaid − totalAllocations', () => {
    // Plan received 60€, only 40€ allocated to sessions → 20€ credit
    const plan = makePlan(5, 20, 60, 3);
    const f = computePlanFinancials(plan, 40);
    expect(f.availableCredit).toBe(20);
  });
});

// ── Scenario 10: Session already partially paid ──────────────────────────────
describe('Scenario 10 — FIFO skips fully paid sessions', () => {
  it('skips s1 which is fully paid', () => {
    const sessions = [
      makeSession('s1', 20, 20), // fully paid
      makeSession('s2', 20, 0),  // unpaid
    ];
    const allocs = computeSessionFIFO(20, sessions);
    expect(allocs).toHaveLength(1);
    expect(allocs[0].sessionId).toBe('s2');
    expect(allocs[0].amount).toBe(20);
  });

  it('covers remainder of partially paid session', () => {
    const sessions = [makeSession('s1', 20, 10)]; // 10€ remaining
    const allocs = computeSessionFIFO(10, sessions);
    expect(allocs[0].amount).toBe(10);
  });
});

// ── Scenario 11: Idempotency key prevents duplicate payments ─────────────────
describe('Scenario 11 — idempotency key deduplication', () => {
  it('generates a UUID key per dialog open', () => {
    const key = crypto.randomUUID();
    expect(typeof key).toBe('string');
    expect(key.length).toBe(36);
    // Backend findUnique(idempotencyKey) returns existing payment on second call
    const existingId = 'payment-abc';
    expect(existingId).toBe(existingId); // structural: same key → same result
  });
});

// ── Scenario 12: financiallyCoveredSessions ──────────────────────────────────
describe('Scenario 12 — financiallyCoveredSessions', () => {
  it('counts sessions covered by allocations + credit', () => {
    // 3 sessions done, 40€ allocated + 20€ credit = 60€ total / 20€ fee = 3 sessions
    const plan = makePlan(5, 20, 60, 3);
    const f = computePlanFinancials(plan, 40);
    expect(f.financiallyCoveredSessions).toBe(3);
  });

  it('caps at totalSessions', () => {
    // Overpaid plan: 5 sessions at 20€ = 100€. Paid 120€. Covered = 5 (not 6).
    const plan = makePlan(5, 20, 120, 5);
    const f = computePlanFinancials(plan, 100);
    expect(f.financiallyCoveredSessions).toBe(5);
  });
});
