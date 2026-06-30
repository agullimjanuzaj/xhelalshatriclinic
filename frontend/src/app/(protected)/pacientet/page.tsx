'use client';

import { useSession } from 'next-auth/react';
import { AdminPatientsView } from './_views/admin-patients-view';
import { ManagerPatientsView } from './_views/manager-patients-view';
import { PhysioPatientsView } from './_views/physio-patients-view';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';

export default function PatientsPage() {
  const { data: session, status } = useSession();
  const role = session?.user?.role;

  if (status === 'loading') return <LoadingSkeleton rows={6} />;
  if (role === 'ADMIN') return <AdminPatientsView />;
  if (role === 'MANAGER') return <ManagerPatientsView />;
  return <PhysioPatientsView />;
}
