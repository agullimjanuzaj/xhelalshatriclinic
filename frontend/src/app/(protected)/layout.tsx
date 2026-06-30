import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { ROUTES } from '@/lib/routes';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect(ROUTES.login);

  return <DashboardLayout>{children}</DashboardLayout>;
}
