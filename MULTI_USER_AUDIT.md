# Multi-User Audit — Xhelal Shatri Clinic
**Date:** 2026-07-09  
**Scope:** Auth session isolation, RBAC/branch isolation, concurrent operations, React Query invalidation, database consistency

---

## Summary

| Area | Status | Action |
|---|---|---|
| Auth/JWT session isolation | ✅ OK | No change |
| RBAC (role enforcement) | ✅ OK | No change |
| MANAGER branch isolation — payments | ✅ OK | No change |
| MANAGER branch isolation — **dashboard** | ❌ Bug | **Fixed** |
| Payment create — double-payment race | ❌ Bug | **Fixed** |
| Payment delete — non-atomic | ❌ Bug | **Fixed** |
| Session create TOCTOU (physio period) | ⚠️ Low risk | Documented |
| React Query — missing invalidations | ❌ Bug | **Fixed** |
| DB indexes — `Session.isPaid` | ⚠️ Missing | **Added** |
| DB indexes — `AuditLog.entityId` | ⚠️ Missing | **Added** |
| Double-click protection | ✅ OK | No change |
| Foreign keys / cascade deletes | ✅ OK | No change |
| PHYSIOTHERAPIST scoping | ✅ OK | No change |

---

## Confirmed Issues and Fixes

### 1. SECURITY — Dashboard MANAGER Branch Bypass

**File:** `backend/src/dashboard/dashboard.controller.ts`

**Problem:** `GET /dashboard/manager?branchId=<any>` and `GET /dashboard/revenue-chart?branchId=<any>` accepted any `branchId` from a MANAGER without validating it against the user's actual branches. A MANAGER could pass a different branch's ID and view its revenue and statistics.

**Fix:** Added branch validation in the controller for both endpoints. When `user.role === MANAGER`, the `branchId` is accepted only if it's in `user.userBranches`; otherwise it silently falls back to the user's own branch.

```ts
// Before
const targetBranchId = branchId || user.managedBranches?.[0]?.id || user.userBranches?.[0]?.branchId;

// After
if (user.role === Role.MANAGER) {
  const userBranchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
  branchId = branchId && userBranchIds.includes(branchId) ? branchId : userBranchIds[0];
}
```

---

### 2. DATA INTEGRITY — Payment Create: Double-Payment Race Condition

**File:** `backend/src/payments/payments.service.ts` — `create()`

**Problem:** The flow was:
1. `findMany` sessions → check `isPaid === false`
2. `payment.create`
3. `session.updateMany` → `isPaid = true`
4. `adjustPlanAmountPaid`

Steps 1 and 3 were not atomic. Two concurrent requests could both pass the `isPaid` check at step 1, both create a payment, and both mark the session as paid — resulting in two payments for the same session and double credit on the plan.

**Fix:** Wrapped `payment.create + session.updateMany + adjustPlanAmountPaid` in a single `prisma.$transaction`. The `isPaid` re-check runs first inside the transaction, making it atomic with the session update.

---

### 3. DATA INTEGRITY — Payment Delete: Non-Atomic

**File:** `backend/src/payments/payments.service.ts` — `remove()`

**Problem:** Three separate Prisma calls (session unlink → plan adjust → payment delete) were not atomic. A crash between any two steps would leave the database in an inconsistent state (e.g., plan amountPaid reversed but session still linked to deleted payment).

**Fix:** Wrapped all three operations in a single `prisma.$transaction`.

---

### 4. REACT QUERY — Missing Query Invalidations

Multiple mutations were missing invalidations, meaning related data would show stale values until the cache expired (1 minute by default).

| File | Missing Invalidation | Impact |
|---|---|---|
| `create-session-dialog.tsx` | `payment-debts`, `outstanding-balances` | Borxhet tab shows stale debt after standalone session created |
| `edit-session-dialog.tsx` | `admin-stats`, `manager-stats`, `physio-stats` | Dashboard stats stale after session status change |
| `create-plan-dialog.tsx` | `outstanding-balances` | Outstanding balance widget stale after plan creation |
| `admin-payments-view.tsx` | `patients`, `patient` | Patient financials ("Borxhi aktual") stale after payment |
| `manager-payments-view.tsx` | `patients`, `patient` | Same as above for MANAGER view |

All missing invalidations have been added.

---

### 5. DATABASE — Missing Indexes

Two frequently-queried columns had no index:

| Model | Column | Query pattern |
|---|---|---|
| `Session` | `isPaid` | `getDebts()` filters `isPaid: false` across all sessions |
| `AuditLog` | `entityId` | Audit lookups by entity ID (patient history, payment audit) |

Both indexes have been added to `prisma/schema.prisma` and pushed to the database.

---

## Confirmed OK — No Changes Made

### Auth / JWT Session Isolation
- Two users can be logged in simultaneously with separate tokens; each JWT is independently verified on every request via the `JwtStrategy` which re-queries `user.isActive` and `user.deletedAt` in the database. No shared session state.
- Access token TTL: 15 minutes. Refresh token: 7 days, stored per-user-session in DB. Logout invalidates the refresh token.

### RBAC
- `RolesGuard` correctly enforces `@Roles()` decorators on all endpoints.
- `PHYSIOTHERAPIST` endpoints correctly scope to `user.id` (sessions, stats).
- `MANAGER` endpoints correctly derive `branchId` from `user.userBranches[0]` for all non-dashboard endpoints (dashboard fix applied above).

### Double-Click Protection
- All forms use `disabled={mutation.isPending}` on the submit button. No double-submit possible through the UI.

### Foreign Keys / Cascade Behavior
- Prisma schema uses `Restrict` and `Cascade` delete appropriately. Soft-delete pattern (`deletedAt`) is applied consistently.

### PHYSIOTHERAPIST Scoping
- One session per active-in-clinic period enforced server-side (not just hidden in UI).
- `activeInClinicExpiresAt` timestamp checked directly, not just the boolean flag.
- Branch and assignment checks applied before session creation.

---

## Known Risks (Not Fixed — Low Priority)

### Session Create TOCTOU (Physiotherapist One-per-Period)

**File:** `backend/src/sessions/sessions.service.ts:179-193`

The `findFirst` check and subsequent `session.create` are not in the same transaction. Two simultaneous requests from the same physio for the same patient could theoretically both pass the check and both create a session.

**Why not fixed:** The practical risk is negligible for this clinic:
- A PHYSIOTHERAPIST has a single-user browser session; double-submit is blocked by `isPending`.
- The window is bounded to a specific patient's active-in-clinic period.
- No financial data is at stake.

Adding a `Serializable` transaction here would require restructuring the entire 200-line `create()` method, which risks introducing regressions.

**Mitigation:** If this becomes a concern in future, add a unique constraint at the DB level: `@@unique([patientId, activeInClinicSince])` on a derived table, or upgrade to Serializable isolation for this one path.

---

## Test Script

`scripts/concurrency-test.ts` — run with `npx ts-node scripts/concurrency-test.ts`

Tests:
1. **Double-payment** — fires two simultaneous payment requests for the same session, verifies only one succeeds
2. **Auth isolation** — verifies two concurrent tokens see independent user identities
3. **Concurrent reads** — 10 simultaneous `GET /payments` requests, all must return 200
4. **Manager branch isolation** — requires a MANAGER account (see script comments)
