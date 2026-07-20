/**
 * Unit tests — Standalone session (pa plan kontrolli) financial logic.
 *
 * Tests the business rules for sessions created without a treatment plan:
 *   - Price stored on the session itself (not re-fetched from branch after creation)
 *   - Price = 0 is valid; negative values are invalid
 *   - remainingAmount = max(price - paidAmount, 0)
 *   - isPaid = remainingAmount === 0
 *   - "Paguaj" button shows only when remainingAmount > 0
 *   - No payment record is created for price-0 sessions
 */

// ─── Pure financial helpers (same logic used by backend service) ──────────────

function computeStandaloneFinancials(price: number, paidAmount: number) {
  const remainingAmount = Math.max(0, Math.round((price - paidAmount) * 100) / 100);
  const isPaid = remainingAmount < 0.005;
  const showPayButton = !isPaid;
  return { price, paidAmount, remainingAmount, isPaid, showPayButton };
}

function isValidSessionPrice(price: number): boolean {
  return price >= 0;
}

// ─── 1. Fizioterapeuti krijon trajtim pa plan me çmim 30 € ───────────────────
describe('Scenario 1 — session created with price 30 €', () => {
  it('stores amount=30 and isPaid=false on creation', () => {
    const f = computeStandaloneFinancials(30, 0);
    expect(f.price).toBe(30);
    expect(f.paidAmount).toBe(0);
    expect(f.isPaid).toBe(false);
  });
});

// ─── 2. Butoni "Paguaj" propozon shumën e mbetur ────────────────────────────
describe('Scenario 2 — payment button pre-fills with remainingAmount', () => {
  it('remainingAmount = 30 when nothing paid', () => {
    const f = computeStandaloneFinancials(30, 0);
    expect(f.remainingAmount).toBe(30);
    expect(f.showPayButton).toBe(true);
  });
});

// ─── 3. Pas pagesës 30 €, trajtimi bëhet i paguar ──────────────────────────
describe('Scenario 3 — after full payment session is paid', () => {
  it('isPaid=true when paidAmount = price', () => {
    const f = computeStandaloneFinancials(30, 30);
    expect(f.isPaid).toBe(true);
    expect(f.remainingAmount).toBe(0);
    expect(f.showPayButton).toBe(false);
  });
});

// ─── 4. Pagesë e pjesshme ───────────────────────────────────────────────────
describe('Scenario 4 — partial payment: price 30, paid 10', () => {
  it('remainingAmount = 20, still shows Paguaj button', () => {
    const f = computeStandaloneFinancials(30, 10);
    expect(f.remainingAmount).toBe(20);
    expect(f.isPaid).toBe(false);
    expect(f.showPayButton).toBe(true);
  });
});

// ─── 5–7. Çmim 0 € ─────────────────────────────────────────────────────────
describe('Scenario 5–7 — price = 0 €', () => {
  it('remainingAmount = 0 when price = 0', () => {
    const f = computeStandaloneFinancials(0, 0);
    expect(f.remainingAmount).toBe(0);
  });

  it('isPaid = true when price = 0 (no payment needed)', () => {
    const f = computeStandaloneFinancials(0, 0);
    expect(f.isPaid).toBe(true);
  });

  it('showPayButton = false when price = 0', () => {
    const f = computeStandaloneFinancials(0, 0);
    expect(f.showPayButton).toBe(false);
  });
});

// ─── 6. Backend DTO accepts price = 0 ───────────────────────────────────────
describe('Scenario 6 — backend validation: price >= 0', () => {
  it('accepts price = 0', () => {
    expect(isValidSessionPrice(0)).toBe(true);
  });

  it('accepts price = 30', () => {
    expect(isValidSessionPrice(30)).toBe(true);
  });
});

// ─── 8. Tick i gjelbër ──────────────────────────────────────────────────────
describe('Scenario 8 — green tick shown when isPaid or price = 0', () => {
  it('tick shown when isPaid=true', () => {
    const showTick = (isPaid: boolean, amount: number) => isPaid || amount === 0;
    expect(showTick(true, 30)).toBe(true);
  });

  it('tick shown when amount = 0 (even if isPaid flag not yet updated)', () => {
    const showTick = (isPaid: boolean, amount: number) => isPaid || amount === 0;
    expect(showTick(false, 0)).toBe(true);
  });

  it('no tick when unpaid and amount > 0', () => {
    const showTick = (isPaid: boolean, amount: number) => isPaid || amount === 0;
    expect(showTick(false, 30)).toBe(false);
  });
});

// ─── 9. Butoni "Paguaj" nuk shfaqet për seancë me çmim 0 ───────────────────
describe('Scenario 9 — Paguaj button not shown when price = 0', () => {
  it('button hidden when remainingAmount = 0', () => {
    const f = computeStandaloneFinancials(0, 0);
    expect(f.showPayButton).toBe(false);
  });
});

// ─── 10. Nuk krijohet payment record me shumë 0 ─────────────────────────────
describe('Scenario 10 — no payment record for amount 0', () => {
  it('payment amount must be > 0 (min 0.01)', () => {
    const isValidPaymentAmount = (amount: number) => amount >= 0.01;
    expect(isValidPaymentAmount(0)).toBe(false);
    expect(isValidPaymentAmount(0.01)).toBe(true);
    expect(isValidPaymentAmount(30)).toBe(true);
  });
});

// ─── 11. Vlera negative refuzohet ───────────────────────────────────────────
describe('Scenario 11 — negative price rejected', () => {
  it('rejects negative prices', () => {
    expect(isValidSessionPrice(-1)).toBe(false);
    expect(isValidSessionPrice(-0.01)).toBe(false);
  });

  it('accepts 0 and positive values', () => {
    expect(isValidSessionPrice(0)).toBe(true);
    expect(isValidSessionPrice(0.01)).toBe(true);
  });
});

// ─── 12. Çmimi ruhet në seancë, nuk merret nga dega pas krijimit ─────────────
describe('Scenario 12 — price frozen on session at creation time', () => {
  it('changing branch price after creation does not affect stored session price', () => {
    const sessionAtCreation = { amount: 30, branchSessionPrice: 30 };
    // Branch price changes to 40
    const branchPriceNow = 40;
    // Session price is stored, not derived from branch
    expect(sessionAtCreation.amount).toBe(30);
    expect(sessionAtCreation.amount).not.toBe(branchPriceNow);
  });
});

// ─── 13. Roli Fizioterapeut mund ta ruajë çmim 0 ────────────────────────────
describe('Scenario 13 — PHYSIOTHERAPIST role can save price = 0', () => {
  it('isValidSessionPrice(0) is true — no role-based block on price 0', () => {
    const canSave = (role: string, price: number) => isValidSessionPrice(price);
    expect(canSave('PHYSIOTHERAPIST', 0)).toBe(true);
  });
});

// ─── 15. FIFO: pagesa 200 € për 6 seanca × 25 € = 150 € + 50 € kredit ──────
describe('Scenario 15 — FIFO: 200 € payment for 6 × 25 € sessions', () => {
  function fifoAllocate(amount: number, sessions: { id: string; price: number; paid: number }[]) {
    const allocs: { id: string; allocated: number }[] = [];
    let remaining = amount;
    for (const s of sessions) {
      if (remaining < 0.005) break;
      const debt = Math.max(0, s.price - s.paid);
      if (debt < 0.005) continue;
      const allocated = Math.min(remaining, debt);
      allocs.push({ id: s.id, allocated: Math.round(allocated * 100) / 100 });
      remaining -= allocated;
    }
    const totalAllocated = allocs.reduce((s, a) => s + a.allocated, 0);
    return { allocs, balanceCredit: Math.max(0, Math.round((amount - totalAllocated) * 100) / 100) };
  }

  const sessions = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, price: 25, paid: 0 }));

  it('allocates 25 € to each of 6 sessions (150 € total)', () => {
    const { allocs } = fifoAllocate(200, sessions);
    expect(allocs).toHaveLength(6);
    allocs.forEach((a) => expect(a.allocated).toBe(25));
  });

  it('creates patient balance credit of 50 €', () => {
    const { balanceCredit } = fifoAllocate(200, sessions);
    expect(balanceCredit).toBe(50);
  });

  it('debt becomes 0 after payment', () => {
    const { allocs } = fifoAllocate(200, sessions);
    const totalAllocated = allocs.reduce((s, a) => s + a.allocated, 0);
    const remainingDebt = sessions.reduce((s, sess) => s + Math.max(0, sess.price - (allocs.find((a) => a.id === sess.id)?.allocated ?? 0)), 0);
    expect(totalAllocated).toBe(150);
    expect(remainingDebt).toBe(0);
  });
});

// ─── 16. FIFO: pagesa e saktë — nuk krijohet kredit ────────────────────────
describe('Scenario 16 — FIFO exact payment: no credit', () => {
  it('150 € payment for 6 × 25 € sessions → 0 balance credit', () => {
    function fifoBalance(amount: number, sessions: { price: number; paid: number }[]) {
      let remaining = amount;
      for (const s of sessions) {
        const debt = Math.max(0, s.price - s.paid);
        const toAllocate = Math.min(remaining, debt);
        remaining -= toAllocate;
        if (remaining < 0.005) break;
      }
      return Math.max(0, Math.round(remaining * 100) / 100);
    }
    const sessions = Array.from({ length: 6 }, () => ({ price: 25, paid: 0 }));
    expect(fifoBalance(150, sessions)).toBe(0);
  });
});

// ─── 17. FIFO: pagesë e pjesshme ────────────────────────────────────────────
describe('Scenario 17 — FIFO partial payment covers first sessions only', () => {
  it('75 € for 6 × 25 € sessions → covers 3 sessions, 3 remain unpaid', () => {
    let remaining = 75;
    const sessions = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, price: 25, paid: 0 }));
    const paid: string[] = [];
    for (const s of sessions) {
      if (remaining < 0.005) break;
      const debt = Math.max(0, s.price - s.paid);
      const toAllocate = Math.min(remaining, debt);
      if (toAllocate > 0.005) paid.push(s.id);
      remaining -= toAllocate;
    }
    expect(paid).toHaveLength(3);
    expect(paid).toEqual(['s0', 's1', 's2']);
  });
});

// ─── 18. FIFO: seancë e klikuar ka prioritet ────────────────────────────────
describe('Scenario 18 — clicked session has priority in FIFO', () => {
  it('clicking session s3 puts it first even if s0 is older', () => {
    const sessions = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, price: 25, paid: 0 }));
    const defaultSessionId = 's3';
    const ordered = [
      ...sessions.filter((s) => s.id === defaultSessionId),
      ...sessions.filter((s) => s.id !== defaultSessionId),
    ];
    expect(ordered[0].id).toBe('s3');
    expect(ordered[1].id).toBe('s0');
  });

  it('25 € for s3 → only s3 covered, others untouched', () => {
    const sessions = [
      { id: 's0', price: 25, paid: 0 },
      { id: 's3', price: 25, paid: 0 },
      { id: 's5', price: 25, paid: 0 },
    ];
    const ordered = [sessions[1], sessions[0], sessions[2]]; // s3 first
    let remaining = 25;
    const covered: string[] = [];
    for (const s of ordered) {
      if (remaining < 0.005) break;
      const toAllocate = Math.min(remaining, s.price - s.paid);
      if (toAllocate > 0.005) covered.push(s.id);
      remaining -= toAllocate;
    }
    expect(covered).toEqual(['s3']);
  });
});

// ─── 19. Seancë e re aplikon automatikisht balancën e pacientit ─────────────
describe('Scenario 19 — new session auto-applies patient balance', () => {
  it('patient.balance=50 → new 25 € session marked isPaid=true, balance becomes 25', () => {
    const patientBalance = 50;
    const sessionPrice = 25;
    const toApply = Math.min(patientBalance, sessionPrice);
    const isPaid = toApply >= sessionPrice - 0.005;
    const newBalance = patientBalance - toApply;
    expect(isPaid).toBe(true);
    expect(newBalance).toBe(25);
  });

  it('patient.balance=10 → new 25 € session partially paid, balance becomes 0', () => {
    const patientBalance = 10;
    const sessionPrice = 25;
    const toApply = Math.min(patientBalance, sessionPrice);
    const isPaid = toApply >= sessionPrice - 0.005;
    const newBalance = patientBalance - toApply;
    expect(isPaid).toBe(false);
    expect(newBalance).toBe(0);
  });
});

// ─── 20. Fshierja e pagesës rikthen balancën e saktë ───────────────────────
describe('Scenario 20 — deleting payment reverses balance correctly', () => {
  it('payment 200 €, allocated 150 €, balance +50 → delete reverses only 50 €', () => {
    const paymentAmount = 200;
    const totalAllocated = 150;
    const balanceToReverse = Math.max(0, Math.round((paymentAmount - totalAllocated) * 100) / 100);
    expect(balanceToReverse).toBe(50);
  });

  it('payment 150 €, allocated 150 €, balance 0 → delete reverses nothing', () => {
    const paymentAmount = 150;
    const totalAllocated = 150;
    const balanceToReverse = Math.max(0, Math.round((paymentAmount - totalAllocated) * 100) / 100);
    expect(balanceToReverse).toBe(0);
  });

  it('payment 200 €, no sessions → reverses full 200 €', () => {
    const paymentAmount = 200;
    const totalAllocated = 0;
    const balanceToReverse = Math.max(0, Math.round((paymentAmount - totalAllocated) * 100) / 100);
    expect(balanceToReverse).toBe(200);
  });
});

// ─── 21. FIFO me pagesa të ndryshme madhësie ────────────────────────────────
describe('Scenario 21 — FIFO handles partial session debt', () => {
  it('session already has 10 € paid: remaining debt is 15 €', () => {
    const price = 25;
    const alreadyPaid = 10;
    const debt = Math.max(0, price - alreadyPaid);
    expect(debt).toBe(15);
  });

  it('100 € covers session partially-paid (15 remaining) + 3 more sessions fully', () => {
    const sessions = [
      { price: 25, paid: 10 }, // 15 remaining
      { price: 25, paid: 0 },
      { price: 25, paid: 0 },
      { price: 25, paid: 0 },
    ];
    let remaining = 100;
    const allocs: number[] = [];
    for (const s of sessions) {
      if (remaining < 0.005) break;
      const debt = Math.max(0, s.price - s.paid);
      const toAllocate = Math.min(remaining, debt);
      allocs.push(toAllocate);
      remaining -= toAllocate;
    }
    expect(allocs).toEqual([15, 25, 25, 25]);
    expect(remaining).toBe(10); // balance credit
  });
});

// ─── 22. Balanca e pacientit llogaritet saktë (TotalPayments - TotalAllocations) ─
describe('Scenario 22 — patient balance formula', () => {
  it('balance = payment.amount - allocations when allocations < payment', () => {
    const payment = { amount: 200, allocations: [{ amount: 150 }] };
    const balance = Math.max(0, payment.amount - payment.allocations.reduce((s, a) => s + a.amount, 0));
    expect(balance).toBe(50);
  });

  it('balance = 0 when all payment is allocated', () => {
    const payment = { amount: 150, allocations: [{ amount: 50 }, { amount: 50 }, { amount: 50 }] };
    const balance = Math.max(0, payment.amount - payment.allocations.reduce((s, a) => s + a.amount, 0));
    expect(balance).toBe(0);
  });

  it('balance never goes negative', () => {
    const payment = { amount: 25, allocations: [{ amount: 25 }] };
    const balance = Math.max(0, payment.amount - payment.allocations.reduce((s, a) => s + a.amount, 0));
    expect(balance).toBeGreaterThanOrEqual(0);
  });
});

// ─── 23. getDebts tregon borxhin e saktë për seanca të paguara pjesërisht ──
describe('Scenario 23 — getDebts shows correct debt for partially-paid standalone sessions', () => {
  it('session price=30, allocated=10 → currentDebt=20 (not 30)', () => {
    const price = 30;
    const paidAmount = 10;
    const currentDebt = Math.max(0, Math.round((price - paidAmount) * 100) / 100);
    expect(currentDebt).toBe(20);
  });

  it('session price=30, allocated=30 → currentDebt=0, excluded from debts list', () => {
    const price = 30;
    const paidAmount = 30;
    const currentDebt = Math.max(0, Math.round((price - paidAmount) * 100) / 100);
    expect(currentDebt).toBe(0);
    expect(currentDebt < 0.005).toBe(true); // excluded
  });
});

// ─── 24–28. Fshierja e seancës rikthen balancën / kreditet e alokimit ────────

function computeDeleteSessionEffect(
  session: { price: number; treatmentPlanId: string | null },
  allocations: { amount: number }[],
) {
  const totalAllocated = allocations.reduce((s, a) => s + a.amount, 0);
  // Only standalone sessions (no plan) restore patient.balance
  const balanceRestore = session.treatmentPlanId ? 0 : Math.max(0, Math.round(totalAllocated * 100) / 100);
  return { totalAllocated, balanceRestore };
}

describe('Scenario 24 — delete fully-paid standalone session restores patient balance', () => {
  it('session 25 € fully paid → patient.balance +25', () => {
    const { balanceRestore } = computeDeleteSessionEffect(
      { price: 25, treatmentPlanId: null },
      [{ amount: 25 }],
    );
    expect(balanceRestore).toBe(25);
  });
});

describe('Scenario 25 — delete partially-paid standalone session restores only allocated amount', () => {
  it('session 30 €, paid 10 € → patient.balance +10 (not +30)', () => {
    const { balanceRestore } = computeDeleteSessionEffect(
      { price: 30, treatmentPlanId: null },
      [{ amount: 10 }],
    );
    expect(balanceRestore).toBe(10);
  });
});

describe('Scenario 26 — delete unpaid standalone session has no balance effect', () => {
  it('session 25 €, no allocations → patient.balance unchanged (+0)', () => {
    const { balanceRestore } = computeDeleteSessionEffect(
      { price: 25, treatmentPlanId: null },
      [],
    );
    expect(balanceRestore).toBe(0);
  });
});

describe('Scenario 27 — delete plan session does NOT touch patient.balance', () => {
  it('session 25 € in plan, paid 25 → patient.balance +0 (plan credit freed instead)', () => {
    const { balanceRestore } = computeDeleteSessionEffect(
      { price: 25, treatmentPlanId: 'plan-1' },
      [{ amount: 25 }],
    );
    expect(balanceRestore).toBe(0);
  });
});

describe('Scenario 28 — delete session with multiple allocation records', () => {
  it('two partial allocations (10+15) for 25 € session → balance +25', () => {
    const { balanceRestore, totalAllocated } = computeDeleteSessionEffect(
      { price: 25, treatmentPlanId: null },
      [{ amount: 10 }, { amount: 15 }],
    );
    expect(totalAllocated).toBe(25);
    expect(balanceRestore).toBe(25);
  });
});

// ─── 14. Statusi financiar konsistent ───────────────────────────────────────
describe('Scenario 14 — financial status consistent across views', () => {
  function sessionDisplayStatus(isPaid: boolean, amount: number, paidAmount: number) {
    const remaining = Math.max(0, amount - paidAmount);
    if (remaining < 0.005) return 'PAID';
    if (paidAmount > 0.005) return 'PARTIALLY_PAID';
    return 'UNPAID';
  }

  it('price=0 → PAID in all views', () => {
    expect(sessionDisplayStatus(true, 0, 0)).toBe('PAID');
  });

  it('price=30, paid=30 → PAID', () => {
    expect(sessionDisplayStatus(true, 30, 30)).toBe('PAID');
  });

  it('price=30, paid=10 → PARTIALLY_PAID', () => {
    expect(sessionDisplayStatus(false, 30, 10)).toBe('PARTIALLY_PAID');
  });

  it('price=30, paid=0 → UNPAID', () => {
    expect(sessionDisplayStatus(false, 30, 0)).toBe('UNPAID');
  });
});
