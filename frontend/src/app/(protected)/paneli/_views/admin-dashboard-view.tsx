'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { dashboardApi } from '@/lib/api';
import { useAppStore } from '@/store/use-app-store';
import { StatsCard } from '@/components/ui/stats-card';
import { PaymentBadge } from '@/components/ui/payment-badge';
import { SessionBadge } from '@/components/ui/session-badge';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { formatCurrency, formatDateTime, getInitials, formatCount } from '@/lib/utils';
import { Calendar, Activity, UserCheck, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getSessionsPath, getTreatmentsPath, getReportsPath, getPatientsPath } from '@/lib/routes';

export function AdminDashboardView() {
  const { selectedBranchId } = useAppStore();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-stats', selectedBranchId],
    queryFn: () => dashboardApi.getAdminStats(selectedBranchId || undefined),
  });

  const stats = (data as any)?.data;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton type="cards" rows={4} />
        <LoadingSkeleton rows={6} />
      </div>
    );
  }

  const overview = stats?.overview || {};
  const recent = stats?.recent || {};

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Aktiv në klinikë"
          value={overview.activeInClinicCount ?? 0}
          description="Pacientë të pranishëm tani"
          icon={UserCheck}
          gradient="teal"
          onClick={() => router.push(`${getPatientsPath()}?activeInClinic=true`)}
        />
        <StatsCard
          title="Trajtimet sot"
          value={overview.todaySessions ?? 0}
          description={`${overview.completedSessions ?? 0} të kompletuara gjithsej`}
          icon={Calendar}
          gradient="blue"
          onClick={() => { const d = new Date().toISOString().slice(0, 10); router.push(`${getSessionsPath()}?dateFrom=${d}&dateTo=${d}`); }}
        />
        <StatsCard
          title="Kontrollat totale"
          value={overview.totalTreatments ?? 0}
          description={`${formatCount(overview.monthSessions ?? 0, 'trajtim', 'trajtime')} këtë muaj`}
          icon={Activity}
          gradient="emerald"
          onClick={() => router.push(getTreatmentsPath())}
        />
        <StatsCard
          title="Raportet"
          value="Shiko"
          description="Analiza dhe të ardhurat"
          icon={BarChart3}
          gradient="purple"
          onClick={() => router.push(getReportsPath())}
        />
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Sessions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Trajtimet e fundit</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {(recent.sessions || []).slice(0, 6).map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-full gradient-emerald flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {getInitials(s.patient?.firstName, s.patient?.lastName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.patient?.firstName} {s.patient?.lastName}</p>
                    <p className="text-xs text-muted-foreground">{s.branch?.name} · {(s.physiotherapist || s.completedByUser)?.firstName || 'Nuk është caktuar'}</p>
                  </div>
                  <div className="text-right">
                    <SessionBadge status={s.status} />
                    <p className="text-[10px] text-muted-foreground mt-0.5">{formatDateTime(s.scheduledAt)}</p>
                  </div>
                </div>
              ))}
              {!recent.sessions?.length && (
                <p className="text-sm text-muted-foreground text-center py-8">Nuk ka trajtime</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Payments */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pagesat e fundit</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {(recent.payments || []).slice(0, 6).map((p: any) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-full gradient-blue flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {getInitials(p.patient?.firstName, p.patient?.lastName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.patient?.firstName} {p.patient?.lastName}</p>
                    <p className="text-xs text-muted-foreground">{p.invoiceNumber} · {p.branch?.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-foreground">{formatCurrency(p.amount)}</p>
                    <PaymentBadge status={p.status} />
                  </div>
                </div>
              ))}
              {!recent.payments?.length && (
                <p className="text-sm text-muted-foreground text-center py-8">Nuk ka pagesa</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
