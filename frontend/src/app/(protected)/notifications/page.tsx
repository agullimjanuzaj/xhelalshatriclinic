'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/lib/routes';

export default function NotificationsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(ROUTES.dashboard);
  }, [router]);
  return null;
}
