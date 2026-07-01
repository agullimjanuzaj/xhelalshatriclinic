'use client';

import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { AdminReportsView } from './_views/admin-reports-view';
import { PhysioReportsView } from './_views/physio-reports-view';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { Button } from '@/components/ui/button';

export default function ReportsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = session?.user?.role;

  if (status === 'loading') return <LoadingSkeleton rows={6} />;
  if (role === 'MANAGER') {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-muted-foreground">Nuk keni qasje në këtë faqe.</p>
        <Button variant="outline" onClick={() => router.push('/paneli')}>Kthehu në panel</Button>
      </div>
    );
  }
  if (role === 'ADMIN') return <AdminReportsView />;
  return <PhysioReportsView />;
}
