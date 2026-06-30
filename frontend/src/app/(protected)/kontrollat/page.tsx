'use client';

import { useSession } from 'next-auth/react';
import { AdminTreatmentsView } from './_views/admin-treatments-view';
import { ManagerTreatmentsView } from './_views/manager-treatments-view';
import { PhysioTreatmentsView } from './_views/physio-treatments-view';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';

export default function TreatmentsPage() {
  const { data: session, status } = useSession();
  const role = session?.user?.role;

  if (status === 'loading') return <LoadingSkeleton rows={6} />;
  if (role === 'ADMIN') return <AdminTreatmentsView />;
  if (role === 'MANAGER') return <ManagerTreatmentsView />;
  return <PhysioTreatmentsView />;
}
