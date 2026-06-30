'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { getDashboardPath, ROUTES } from '@/lib/routes';
import { FileQuestion } from 'lucide-react';

export default function AppNotFound() {
  const { data: session } = useSession();
  const router = useRouter();
  const role = session?.user?.role;

  return (
    <div className="flex flex-col items-center justify-center text-center py-24 space-y-4">
      <FileQuestion size={48} className="text-muted-foreground" />
      <div>
        <h1 className="text-xl font-bold">Faqja nuk u gjet</h1>
        <p className="text-sm text-muted-foreground mt-1">Kjo faqe nuk ekziston ose nuk keni qasje.</p>
      </div>
      <Button onClick={() => router.push(session ? getDashboardPath(role) : ROUTES.login)} className="gradient-teal text-white border-0">
        Kthehu në panel
      </Button>
    </div>
  );
}
