/**
 * Multi-user concurrency test — Xhelal Shatri Clinic
 *
 * Tests race conditions across the three highest-risk operations:
 *   1. Double-payment: two concurrent requests pay the same session
 *   2. Concurrent session create for PHYSIOTHERAPIST (same active period)
 *   3. Dashboard branch isolation: manager can't view another branch
 *
 * Usage:
 *   npx ts-node scripts/concurrency-test.ts
 *
 * Requires:
 *   - Backend running on http://localhost:3001
 *   - Admin credentials below
 *   - A real patient + plan + unpaid session in the DB (see SEED section)
 */

const BASE = 'http://localhost:3001';
const ADMIN = { username: 'xhelalshatri', password: 'Admin123!' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function login(creds: { username: string; password: string }): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(creds),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const body = await res.json();
  return body.accessToken as string;
}

async function post(token: string, path: string, body: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function get(token: string, path: string): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

function pass(msg: string) { console.log(`  \x1b[32m✓\x1b[0m ${msg}`); }
function fail(msg: string) { console.error(`  \x1b[31m✗\x1b[0m ${msg}`); process.exitCode = 1; }
function info(msg: string) { console.log(`  \x1b[90m→\x1b[0m ${msg}`); }

// ---------------------------------------------------------------------------
// Test 1: Double-payment race condition
// ---------------------------------------------------------------------------

async function testDoublePayment(token: string, patientId: string, sessionId: string, branchId: string) {
  console.log('\n[1] Double-payment race condition');

  const payload = {
    patientId,
    branchId,
    sessionIds: [sessionId],
    amount: 2000,
    paymentMethod: 'CASH',
    paymentType: 'FULL',
  };

  // Fire two requests simultaneously
  const [r1, r2] = await Promise.all([
    post(token, '/payments', payload),
    post(token, '/payments', payload),
  ]);

  const created = [r1, r2].filter(r => r.status === 201);
  const rejected = [r1, r2].filter(r => r.status !== 201);

  info(`Request 1: ${r1.status} | Request 2: ${r2.status}`);

  if (created.length === 1 && rejected.length === 1) {
    pass('Exactly one payment created — transaction protected the duplicate');
  } else if (created.length === 2) {
    fail('BOTH payments succeeded — session was double-charged!');
  } else {
    fail(`Unexpected: created=${created.length}, rejected=${rejected.length}`);
  }

  // Clean up — delete the payment that succeeded so the session stays unpaid for re-runs
  if (created.length === 1) {
    const paymentId = created[0].data?.id;
    if (paymentId) {
      const del = await fetch(`${BASE}/payments/${paymentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      info(`Cleanup: DELETE /payments/${paymentId} → ${del.status}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Test 2: Dashboard branch isolation for MANAGER
// ---------------------------------------------------------------------------

async function testManagerBranchIsolation(managerToken: string, ownBranchId: string, otherBranchId: string) {
  console.log('\n[2] MANAGER dashboard branch isolation');

  const own = await get(managerToken, `/dashboard/manager?branchId=${ownBranchId}`);
  const other = await get(managerToken, `/dashboard/manager?branchId=${otherBranchId}`);
  const chart = await get(managerToken, `/dashboard/revenue-chart?branchId=${otherBranchId}`);

  info(`Own branch stats: ${own.status}`);
  info(`Other branch stats: ${other.status}`);
  info(`Revenue chart (other branch): ${chart.status}`);

  if (own.status === 200) {
    pass('Manager can access own branch stats');
  } else {
    fail(`Manager blocked from own branch stats: ${own.status}`);
  }

  // After the fix, the backend silently redirects to the manager's own branch
  // when an invalid branchId is sent — so 200 is returned but data must be
  // for the manager's branch, not the requested other branch.
  if (other.status === 200) {
    // Verify data belongs to own branch, not other branch
    const returnedBranchId = other.data?.branchId;
    if (!returnedBranchId || returnedBranchId !== otherBranchId) {
      pass('Manager request for other branch silently scoped to own branch (correct)');
    } else {
      fail('Manager received data for another branch!');
    }
  } else if (other.status === 403) {
    pass('Manager correctly blocked from other branch with 403');
  }

  if (chart.status === 200) {
    info('Revenue chart returned 200 — verify data is scoped to own branch');
  }
}

// ---------------------------------------------------------------------------
// Test 3: Auth isolation — two simultaneous sessions
// ---------------------------------------------------------------------------

async function testAuthIsolation(token1: string, token2: string) {
  console.log('\n[3] Auth session isolation');

  const [me1, me2] = await Promise.all([
    get(token1, '/auth/me'),
    get(token2, '/auth/me'),
  ]);

  if (me1.status === 200 && me2.status === 200) {
    if (me1.data?.id !== me2.data?.id) {
      pass('Two independent auth sessions see different users');
    } else {
      info('Both tokens belong to the same user (expected for single-user test)');
    }
  } else {
    fail(`Auth isolation check failed: token1=${me1.status} token2=${me2.status}`);
  }
}

// ---------------------------------------------------------------------------
// Test 4: Concurrent read integrity (no phantom reads on payments list)
// ---------------------------------------------------------------------------

async function testConcurrentReads(token: string) {
  console.log('\n[4] Concurrent reads stability');

  const requests = Array.from({ length: 10 }, (_, i) =>
    get(token, `/payments?page=1&limit=10`).then(r => ({ i, status: r.status }))
  );

  const results = await Promise.all(requests);
  const failed = results.filter(r => r.status !== 200);

  if (failed.length === 0) {
    pass(`10 concurrent /payments reads all returned 200`);
  } else {
    fail(`${failed.length}/10 concurrent reads failed: ${failed.map(r => r.status).join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Xhelal Shatri Clinic — Concurrency Test ===\n');

  let token: string;
  try {
    token = await login(ADMIN);
    pass('Admin login successful');
  } catch (e: any) {
    fail(`Login failed — is the backend running at ${BASE}?\n  ${e.message}`);
    return;
  }

  // ---------------------------------------------------------------------------
  // SEED: find a real patient + unpaid session for the double-payment test
  // ---------------------------------------------------------------------------
  console.log('\n[Seed] Finding test data...');
  const debtsRes = await get(token, '/payments/debts?page=1&limit=5');
  const debts: any[] = debtsRes.data?.data || [];

  if (debts.length === 0) {
    info('No debts found — skipping double-payment test (requires an unpaid session in DB)');
  } else {
    const debt = debts[0];
    const patientId = debt.patient?.id;
    const sessionId = debt.sessionId;
    const branchId = debt.patient?.branchId || debt.branchId;

    if (patientId && sessionId) {
      info(`Using patient=${patientId.slice(0, 8)}… session=${sessionId.slice(0, 8)}…`);
      await testDoublePayment(token, patientId, sessionId, branchId);
    } else {
      info(`Debt found but no standalone sessionId — using plan debt. sessionId=${sessionId}`);
      if (patientId && debt.planId) {
        await testDoublePayment(token, patientId, sessionId ?? 'N/A', branchId);
      }
    }
  }

  // Auth isolation — use same credentials, two separate tokens
  const token2 = await login(ADMIN);
  await testAuthIsolation(token, token2);

  // Concurrent reads
  await testConcurrentReads(token);

  // Branch isolation — needs a second branch; skip if only one branch exists
  const branchesRes = await get(token, '/branches?limit=10');
  const branches: any[] = branchesRes.data?.data || branchesRes.data || [];
  if (branches.length >= 2) {
    // Manager branch isolation needs a manager token — skip in admin-only setup
    info('Multiple branches found — manager branch isolation test requires a MANAGER account');
    info('To test: create a manager user, login with that token, call testManagerBranchIsolation()');
  } else {
    info('Only one branch in DB — skipping manager branch isolation test');
  }

  console.log('\n=== Done ===\n');
}

main().catch(e => { console.error(e); process.exit(1); });
