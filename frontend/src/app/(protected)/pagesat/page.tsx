'use client';

import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AdminPaymentsView } from './_views/admin-payments-view';
import { ManagerPaymentsView } from './_views/manager-payments-view';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { Button } from '@/components/ui/button';
import { getDashboardPath } from '@/lib/routes';

export default function PaymentsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = session?.user?.role;
  const initialTab = searchParams.get('tab') === 'debts' ? 'debts' : 'payments';

  if (status === 'loading') return <LoadingSkeleton rows={6} />;
  if (role === 'ADMIN') return <AdminPaymentsView initialTab={initialTab} />;
  if (role === 'MANAGER') return <ManagerPaymentsView initialTab={initialTab} />;

  return (
    <div className="text-center py-20 space-y-4">
      <p className="text-muted-foreground">Nuk keni qasje në këtë faqe.</p>
      <Button onClick={() => router.push(getDashboardPath(role))}>Kthehu në panel</Button>
    </div>
  );
}
