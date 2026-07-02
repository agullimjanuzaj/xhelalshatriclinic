'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { dashboardApi } from '@/lib/api';
import { useSession } from 'next-auth/react';
import { StatsCard } from '@/components/ui/stats-card';
import { formatCurrency, formatDate, getInitials } from '@/lib/utils';
import { Users, Calendar, CreditCard, BarChart3, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { ROUTES, getPatientsPath, getSessionsPath, getPaymentsPath, getReportsPath } from '@/lib/routes';

export function ManagerDashboardView() {
  const { data: session } = useSession();
  const router = useRouter();
  const role = session?.user?.role;
  const branchId = session?.user?.userBranches?.[0]?.branchId;
  const branchName = session?.user?.userBranches?.[0]?.branch?.name;
  const todayStr = new Date().toISOString().slice(0, 10);

  const { data, isLoading } = useQuery({
    queryKey: ['manager-stats', branchId],
    queryFn: () => dashboardApi.getManagerStats(branchId),
    enabled: !!branchId,
  });

  const stats = (data as any)?.data;

  if (isLoading) return <LoadingSkeleton type="cards" rows={4} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Dega: <strong>{branchName}</strong></p>
        <Button asChild className="gap-2 gradient-teal text-white border-0">
          <Link href={ROUTES.patientsNew}><Plus size={16} />Pacient i ri</Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Pacientët"
          value={stats?.patients ?? 0}
          icon={Users}
          gradient="teal"
          onClick={() => router.push(getPatientsPath(role))}
        />
        <StatsCard
          title="Trajtimet sot"
          value={stats?.todaySessions ?? 0}
          icon={Calendar}
          gradient="blue"
          onClick={() => router.push(`${getSessionsPath(role)}?dateFrom=${todayStr}&dateTo=${todayStr}`)}
        />
        <StatsCard
          title="Pagesat"
          value={formatCurrency(stats?.monthRevenue ?? 0)}
          description="Këtë muaj"
          icon={CreditCard}
          gradient="emerald"
          onClick={() => router.push(getPaymentsPath(role))}
        />
        <StatsCard
          title="Raportet"
          value="Shiko"
          description="Analiza dhe të ardhurat"
          icon={BarChart3}
          gradient="purple"
          onClick={() => router.push(getReportsPath(role))}
        />
      </div>

      {/* Quick Actions & Recent Patients */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Veprimet e shpejta</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {[
              { label: 'Pacient i ri', href: ROUTES.patientsNew, color: 'gradient-teal' },
              { label: 'Regjistro pagesë', href: ROUTES.payments, color: 'gradient-blue' },
              { label: 'Kontrollat', href: ROUTES.treatments, color: 'gradient-emerald' },
              { label: 'Trajtimet', href: ROUTES.sessions, color: 'gradient-blue' },
            ].map((action) => (
              <Button key={action.href} asChild variant="outline" className="h-16 flex-col gap-1 text-sm">
                <Link href={action.href}>{action.label}</Link>
              </Button>
            ))}
          </CardContent>
        </Card>

        {/* Recent Patients */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Pacientët e fundit</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href={ROUTES.patients}>Shiko të gjithë</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {(stats?.recentPatients || []).map((p: any) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-full gradient-teal flex items-center justify-center text-white text-xs font-bold">
                    {getInitials(p.firstName, p.lastName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{p.firstName} {p.lastName}</p>
                    <p className="text-xs text-muted-foreground">{p.phone}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDate(p.createdAt)}</p>
                </div>
              ))}
              {!stats?.recentPatients?.length && (
                <p className="text-sm text-muted-foreground text-center py-8">Nuk ka pacientë</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
