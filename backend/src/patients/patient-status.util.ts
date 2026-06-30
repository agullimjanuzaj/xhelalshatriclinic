import { PrismaService } from '../prisma/prisma.service';
import { PatientStatus } from '@prisma/client';

// The patient's clinical status is always derived, never set directly by a
// form — it only ever reflects the state of their treatment plans:
//   - no plans at all            -> null (just registered, no badge)
//   - any plan still in progress -> IN_TREATMENT
//   - plans exist and all done   -> COMPLETED
// Recompute from scratch every time rather than incrementing/decrementing a
// stored value, so it can never drift out of sync with reality.
export async function recalculatePatientStatus(prisma: PrismaService, patientId: string): Promise<PatientStatus | null> {
  const plans = await prisma.treatmentPlan.findMany({
    where: { patientId, deletedAt: null },
    select: { completedSessions: true, totalSessions: true },
  });

  let status: PatientStatus | null;
  if (plans.length === 0) {
    status = null;
  } else if (plans.some((p) => p.completedSessions < p.totalSessions)) {
    status = PatientStatus.IN_TREATMENT;
  } else {
    status = PatientStatus.COMPLETED;
  }

  await prisma.patient.update({ where: { id: patientId }, data: { status } });
  return status;
}
