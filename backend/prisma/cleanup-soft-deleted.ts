/**
 * One-time cleanup: permanently remove all records that were soft-deleted
 * (deletedAt IS NOT NULL) before the switch to hard deletes.
 *
 * Run with:
 *   npx ts-node --project tsconfig.json prisma/cleanup-soft-deleted.ts
 *
 * Safe to re-run — idempotent.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting soft-delete cleanup...\n');

  // ── 1. Children of soft-deleted patients ──────────────────────────────────
  const softPatients = await prisma.patient.findMany({
    where: { deletedAt: { not: null } },
    select: { id: true },
  });
  const softPatientIds = softPatients.map((p) => p.id);

  if (softPatientIds.length > 0) {
    const t = await prisma.treatment.deleteMany({ where: { patientId: { in: softPatientIds } } });
    const s = await prisma.session.deleteMany({ where: { patientId: { in: softPatientIds } } });
    const pay = await prisma.payment.deleteMany({ where: { patientId: { in: softPatientIds } } });
    const tp = await prisma.treatmentPlan.deleteMany({ where: { patientId: { in: softPatientIds } } });
    console.log(`Patients (${softPatientIds.length}) children removed: ${t.count} treatments, ${s.count} sessions, ${pay.count} payments, ${tp.count} plans`);
  }

  // ── 2. Children of soft-deleted treatment plans (not already removed above) ─
  const softPlans = await prisma.treatmentPlan.findMany({
    where: { deletedAt: { not: null } },
    select: { id: true },
  });
  const softPlanIds = softPlans.map((p) => p.id);

  if (softPlanIds.length > 0) {
    const t = await prisma.treatment.deleteMany({ where: { treatmentPlanId: { in: softPlanIds } } });
    const s = await prisma.session.deleteMany({ where: { treatmentPlanId: { in: softPlanIds } } });
    const pay = await prisma.payment.deleteMany({ where: { treatmentPlanId: { in: softPlanIds } } });
    console.log(`Plans (${softPlanIds.length}) children removed: ${t.count} treatments, ${s.count} sessions, ${pay.count} payments`);
  }

  // ── 3. Remaining soft-deleted leaf records ─────────────────────────────────
  const t2  = await prisma.treatment.deleteMany({ where: { deletedAt: { not: null } } });
  const s2  = await prisma.session.deleteMany({ where: { deletedAt: { not: null } } });
  const pay2 = await prisma.payment.deleteMany({ where: { deletedAt: { not: null } } });
  const tp2 = await prisma.treatmentPlan.deleteMany({ where: { deletedAt: { not: null } } });
  const p2  = await prisma.patient.deleteMany({ where: { deletedAt: { not: null } } });
  console.log(`Remaining soft-deleted: ${t2.count} treatments, ${s2.count} sessions, ${pay2.count} payments, ${tp2.count} plans, ${p2.count} patients`);

  // ── 4. Lookup-table soft-deleted records ───────────────────────────────────
  const c  = await prisma.complaint.deleteMany({ where: { deletedAt: { not: null } } });
  const sc = await prisma.suggestedCondition.deleteMany({ where: { deletedAt: { not: null } } });
  const tt = await prisma.treatmentType.deleteMany({ where: { deletedAt: { not: null } } });
  const b  = await prisma.branch.deleteMany({ where: { deletedAt: { not: null } } });
  console.log(`Lookup tables: ${c.count} complaints, ${sc.count} suggested conditions, ${tt.count} treatment types, ${b.count} branches`);

  // ── 5. Users with clinical history: keep soft-deleted but free username ─────
  //    Users without clinical history: hard delete
  const softUsers = await prisma.user.findMany({
    where: { deletedAt: { not: null } },
    select: { id: true, username: true },
  });

  let hardDeletedUsers = 0;
  let keptUsers = 0;

  for (const u of softUsers) {
    const hasTreatments = await prisma.treatment.count({ where: { physiotherapistId: u.id } });
    if (hasTreatments > 0) {
      keptUsers++;
      continue; // keep soft-deleted to preserve clinical history
    }
    // Null out optional FKs before hard delete
    await prisma.session.updateMany({ where: { physiotherapistId: u.id }, data: { physiotherapistId: null } });
    await prisma.session.updateMany({ where: { completedByUserId: u.id }, data: { completedByUserId: null } });
    await prisma.session.updateMany({ where: { priceChangedByUserId: u.id }, data: { priceChangedByUserId: null } });
    await prisma.treatmentPlan.updateMany({ where: { createdByUserId: u.id }, data: { createdByUserId: null } });
    await prisma.treatmentPlan.updateMany({ where: { assignedPhysiotherapistId: u.id }, data: { assignedPhysiotherapistId: null } });
    await prisma.payment.updateMany({ where: { createdByUserId: u.id }, data: { createdByUserId: null } });
    await prisma.branch.updateMany({ where: { managerId: u.id }, data: { managerId: null } });
    await prisma.user.delete({ where: { id: u.id } });
    hardDeletedUsers++;
  }

  console.log(`Users: ${hardDeletedUsers} hard-deleted, ${keptUsers} kept (have clinical records)`);
  console.log('\nCleanup complete.');
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
