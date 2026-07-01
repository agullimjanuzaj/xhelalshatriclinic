'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { dashboardApi, sessionsApi } from '@/lib/api';
import { StatsCard } from '@/components/ui/stats-card';
import { SessionBadge } from '@/components/ui/session-badge';
import { formatDateTime, getInitials, extractItem, extractList } from '@/lib/utils';
import { Calendar, Activity, CheckCircle, TrendingUp, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { ROUTES, getSessionDetailPath, getSessionsPath, getTreatmentsPath } from '@/lib/routes';
import { CreateSessionDialog } from '@/components/sessions/create-session-dialog';

export function PhysioDashboardView() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCreateSession, setShowCreateSession] = useState(false);
  const todayStr = new Date().toISOString().slice(0, 10);

  const { data, isLoading } = useQuery({
    queryKey: ['physio-stats'],
    queryFn: () => dashboardApi.getPhysiotherapistStats(),
  });

  const { data: todaySessionsData } = useQuery({
    queryKey: ['sessions-today'],
    queryFn: () => sessionsApi.getAll({ dateFrom: todayStr, dateTo: `${todayStr}T23:59:59`, limit: 10 }),
  });

  const stats = extractItem<any>(data);
  const todaySessions = extractList<any>(todaySessionsData);

  if (isLoading) return <LoadingSkeleton type="cards" rows={4} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mirë se vini!</h1>
          <p className="text-sm text-muted-foreground">Paneli i Fizioterapeutit</p>
        </div>
        <div className="flex gap-2">
          <Button className="gap-2 gradient-teal text-white border-0" size="sm" onClick={() => setShowCreateSession(true)}>
            <Plus size={15} />Trajtim i ri
          </Button>
        </div>
      </div>

      <CreateSessionDialog
        open={showCreateSession}
        onClose={() => { setShowCreateSession(false); queryClient.invalidateQueries({ queryKey: ['sessions-today'] }); }}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Trajtimet sot"
          value={stats?.todaySessions ?? 0}
          icon={Calendar}
          gradient="teal"
          onClick={() => router.push(`${getSessionsPath(role)}?date=${todayStr}`)}
        />
        <StatsCard
          title="Trajtimet"
          value={stats?.totalSessions ?? 0}
          icon={TrendingUp}
          gradient="blue"
          onClick={() => router.push(getSessionsPath(role))}
        />
        <StatsCard
          title="Kontrollat"
          value={stats?.totalTreatments ?? 0}
          icon={Activity}
          gradient="emerald"
          onClick={() => router.push(getTreatmentsPath(role))}
        />
        <StatsCard title="Trajtimet e kompletuara" value={stats?.completedSessions ?? 0} icon={CheckCircle} gradient="amber" />
      </div>

      {/* Today's Sessions */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Trajtimet e sotme</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href={getSessionsPath(role)}>Shiko të gjitha</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {todaySessions.map((s: any) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-full gradient-emerald flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {getInitials(s.patient?.firstName, s.patient?.lastName)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{s.patient?.firstName} {s.patient?.lastName}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(s.scheduledAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <SessionBadge status={s.status} />
                  {s.status === 'SCHEDULED' && (
                    <Button size="sm" asChild className="gradient-teal text-white border-0 h-7 text-xs">
                      <Link href={getSessionDetailPath(role, s.id)}>Kompletoje</Link>
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {!todaySessions.length && (
              <div className="py-12 text-center">
                <p className="text-muted-foreground text-sm">Nuk ka trajtime sot</p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href={getSessionsPath(role)}>Shto trajtim</Link>
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Pacientët e mi', href: ROUTES.patients, icon: '👥' },
          { label: 'Kontrollat', href: ROUTES.treatments, icon: '💊' },
          { label: 'Sugjerime', href: ROUTES.suggestions, icon: '🔍' },
          { label: 'Raportet', href: ROUTES.reports, icon: '📊' },
        ].map((item) => (
          <Button key={item.href} variant="outline" asChild className="h-16 flex-col gap-2">
            <Link href={item.href}>
              <span className="text-xl">{item.icon}</span>
              <span className="text-xs">{item.label}</span>
            </Link>
          </Button>
        ))}
      </div>
    </div>
  );
}
