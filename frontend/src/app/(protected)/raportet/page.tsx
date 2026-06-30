'use client';

import { useSession } from 'next-auth/react';
import { AdminReportsView } from './_views/admin-reports-view';
import { ManagerReportsView } from './_views/manager-reports-view';
import { PhysioReportsView } from './_views/physio-reports-view';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';

export default function ReportsPage() {
  const { data: session, status } = useSession();
  const role = session?.user?.role;

  if (status === 'loading') return <LoadingSkeleton rows={6} />;
  if (role === 'ADMIN') return <AdminReportsView />;
  if (role === 'MANAGER') return <ManagerReportsView />;
  return <PhysioReportsView />;
}
