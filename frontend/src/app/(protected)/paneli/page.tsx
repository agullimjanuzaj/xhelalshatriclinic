'use client';

import { useSession } from 'next-auth/react';
import { AdminDashboardView } from './_views/admin-dashboard-view';
import { ManagerDashboardView } from './_views/manager-dashboard-view';
import { PhysioDashboardView } from './_views/physio-dashboard-view';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const role = session?.user?.role;

  if (status === 'loading') return <LoadingSkeleton type="cards" rows={4} />;
  if (role === 'ADMIN') return <AdminDashboardView />;
  if (role === 'MANAGER') return <ManagerDashboardView />;
  return <PhysioDashboardView />;
}
