'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { AdminPaymentsView } from '../pagesat/_views/admin-payments-view';
import { ManagerPaymentsView } from '../pagesat/_views/manager-payments-view';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { Button } from '@/components/ui/button';
import { getDashboardPath } from '@/lib/routes';

export default function DebtsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = session?.user?.role;

  if (status === 'loading') return <LoadingSkeleton rows={6} />;
  if (role === 'ADMIN') return <AdminPaymentsView initialTab="debts" />;
  if (role === 'MANAGER') return <ManagerPaymentsView initialTab="debts" />;

  return (
    <div className="text-center py-20 space-y-4">
      <p className="text-muted-foreground">Nuk keni qasje në këtë faqe.</p>
      <Button onClick={() => router.push(getDashboardPath(role))}>Kthehu në panel</Button>
    </div>
  );
}
