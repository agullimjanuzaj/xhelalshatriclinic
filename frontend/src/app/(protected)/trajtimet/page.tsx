'use client';

import { useSession } from 'next-auth/react';
import { AdminSessionsView } from './_views/admin-sessions-view';
import { ManagerSessionsView } from './_views/manager-sessions-view';
import { PhysioSessionsView } from './_views/physio-sessions-view';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';

export default function SessionsPage() {
  const { data: session, status } = useSession();
  const role = session?.user?.role;

  if (status === 'loading') return <LoadingSkeleton rows={6} />;
  if (role === 'ADMIN') return <AdminSessionsView />;
  if (role === 'MANAGER') return <ManagerSessionsView />;
  return <PhysioSessionsView />;
}
