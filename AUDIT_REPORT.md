# Audit Report — Xhelal Shatri Clinic
**Date:** 2026-07-07  
**Scope:** Frontend (`frontend/src`) + Backend (`backend/src`)

---

## 1. What Was Fixed

### 1a. Unused Imports Removed

| File | Import Removed | Reason |
|------|---------------|--------|
| `frontend/src/app/(protected)/trajtimet/_views/manager-sessions-view.tsx` | `Input` from `@/components/ui/input` | Imported on line 12 but `<Input>` is never rendered in this component |
| `frontend/src/app/(protected)/raportet/_views/admin-reports-view.tsx` | `useRef` from `react` | Only used for `downloadLinkRef`, which is itself unused |

### 1b. Unused Variable Removed

| File | Variable Removed | Reason |
|------|----------------|--------|
| `frontend/src/app/(protected)/raportet/_views/admin-reports-view.tsx` | `const downloadLinkRef = useRef<HTMLAnchorElement>(null)` | Declared but never attached to any DOM element or referenced after declaration; the export function uses `document.createElement('a')` directly instead |

---

## 2. Console.log Audit

### Frontend (`frontend/src`)
- `frontend/src/lib/push.ts` line 73: `console.log('[push]', ...args)` — **NOT removed** (PWA push notification logging; rule: do not touch PWA/service-worker code)

### Backend (`backend/src`)
- `backend/src/main.ts` lines 98–99: Two startup info logs (`Backend po dëgjon` and `Swagger`) — **NOT removed** (production-important server startup messages, not debug artifacts)

**Result: No console.log statements removed.**

---

## 3. Duplicate `formatDate` / `formatDateTime` Check

Only one definition exists: `frontend/src/lib/utils.ts` (lines 61 and 71).  
No duplicates found anywhere else in the codebase.

---

## 4. Read-Only Audit (Not Changed)

### 4a. Unused Components (imported nowhere — do not delete without further review)

| Component | Path | Notes |
|-----------|------|-------|
| `anatomy-icons.tsx` | `frontend/src/components/ui/anatomy-icons.tsx` | Zero imports found across entire codebase. Safe candidate for deletion in a future cleanup pass. |
| `revenue-chart.tsx` | `frontend/src/components/ui/revenue-chart.tsx` | No component import found. The API endpoint `/dashboard/revenue-chart` exists in `api.ts` but the React component itself is never rendered. May be a leftover from an earlier dashboard iteration. |

### 4b. Duplicate Import Declarations (same module, two statements)

| File | Issue |
|------|-------|
| `frontend/src/app/(protected)/trajtimet/_views/admin-sessions-view.tsx` | Two separate `import { ... } from 'lucide-react'` statements (lines 16 and 23). All symbols are used — this is a style issue only. Can be consolidated into one import in a future pass. |

### 4c. Large Components (>400 lines — refactoring candidates)

| File | Lines | Suggestion |
|------|-------|-----------|
| `components/treatment-plans/create-plan-dialog.tsx` | 554 | Split form sections (patient info, plan config, session schedule) into sub-components |
| `components/patients/patient-detail-content.tsx` | 546 | Split into tab-specific sub-components (sessions tab, payments tab, etc.) |
| `app/(protected)/sugjerime/page.tsx` | 501 | Three separate feature sections (`SymptomSuggestionTool`, `SuggestedConditionsAdmin`, `ComplaintsAdmin`) already exist as local functions — could be split into separate files |
| `app/(protected)/raportet/_views/admin-reports-view.tsx` | 419 | Each `<TabsContent>` block could become its own component |

### 4d. TypeScript `any` Usage

**Frontend:** 210 occurrences across 48 files  
**Backend:** 197 occurrences across 28 files  

Worst offenders (frontend):

| File | Count |
|------|-------|
| `raportet/_views/admin-reports-view.tsx` | 34 |
| `pacientet/_views/admin-patients-view.tsx` | 11 |
| `pacientet/_views/manager-patients-view.tsx` | 10 |
| `pagesat/_views/admin-payments-view.tsx` | 8 |
| `pagesat/_views/manager-payments-view.tsx` | 7 |

Worst offenders (backend):

| File | Count |
|------|-------|
| `reports/reports.service.ts` | 28 |
| `patients/patients.service.ts` | 24 |
| `payments/payments.service.ts` | 21 |
| `pdf/pdf.service.ts` | 20 |
| `treatment-plans/treatment-plans.service.ts` | 16 |

Most `any` usages come from Prisma query results and untyped API response shapes. The proper fix is to generate and use typed Prisma result types and typed API DTOs rather than casting everything to `any`.

### 4e. Pagination on List APIs

All list endpoints observed in the frontend use `page` and `limit` params and receive a `meta` object back from the API. No unbounded list queries were found. Pagination appears to be consistently applied.

### 4f. Unnecessary React Query Invalidations

Noted but not changed:
- `admin-sessions-view.tsx` delete mutation invalidates 5 query keys (sessions, treatment-plans, payment-debts, outstanding-balances, report-overview). This is broad but defensible because a deleted session can affect balances and reports.
- `admin-treatments-view.tsx` `invalidateAfterChange` invalidates 7 query keys on every create/edit/delete. Consider scoping invalidations more tightly (e.g. only invalidate `report-overview` and `admin-stats` after a delete, not after every edit).

### 4g. Bundle Size Concerns

- `recharts` is imported in `admin-reports-view.tsx` and `manager-reports-view.tsx`. The imports are already tree-shaken (specific named exports only). No concern.
- No large barrel imports detected.

---

## 5. Lint / Typecheck / Build Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` (frontend) | **PASS** — zero errors |
| `npx tsc --noEmit` (backend) | **PASS** — zero errors |
| `npx prisma generate` (backend) | **PASS** — Prisma Client generated successfully |
| `npm run lint` (frontend) | **SKIPPED** — ESLint is not configured (running `npm run lint` prompts for interactive setup). No `.eslintrc` or `eslint.config.*` found. |

---

## 6. Recommendations for Future Cleanup

1. **Configure ESLint** — Add a `.eslintrc.json` (or `eslint.config.mjs` for flat config) with `next/core-web-vitals` rules. This will automatically catch unused imports, duplicate imports from the same module, and other style issues going forward.

2. **Delete `anatomy-icons.tsx` and `revenue-chart.tsx`** — Both components are unreferenced. Confirm with the team that they are not needed, then delete them.

3. **Reduce `any` usage** — Start with the backend services (`reports.service.ts`, `patients.service.ts`) by replacing Prisma query result types with proper `Prisma.XxxGetPayload<...>` types. On the frontend, define typed response interfaces for each API endpoint.

4. **Split large components** — `create-plan-dialog.tsx` (554 lines) and `patient-detail-content.tsx` (546 lines) are the highest-priority refactoring candidates.

5. **Consolidate duplicate lucide-react import** in `admin-sessions-view.tsx` — merge the two `import { ... } from 'lucide-react'` lines into one.

6. **Scope React Query invalidations** — In `admin-treatments-view.tsx`, avoid invalidating `admin-stats` and `report-overview` on every plan edit (only on create/delete).
