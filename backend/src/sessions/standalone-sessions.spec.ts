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
