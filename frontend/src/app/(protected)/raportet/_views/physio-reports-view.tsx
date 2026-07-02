'use client';

import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '@/lib/api';
import { useSession } from 'next-auth/react';
import { useReportsFilters } from '@/hooks/use-reports-filters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, Column } from '@/components/ui/data-table';
import { SessionBadge } from '@/components/ui/session-badge';
import { StatsCard } from '@/components/ui/stats-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDate, formatCurrency } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, ClipboardList, CalendarCheck, Filter, FilterX, Coins } from 'lucide-react';

export function PhysioReportsView() {
  const { data: session } = useSession();
  const f = useReportsFilters();

  // Every query is driven by the same `f.applied` object — "Pastro
  // filtrat" (f.clear()) resets all of them in one shot. branchId/userId
  // are never exposed in the UI here (a physio is implicitly scoped to
  // themselves server-side), only month is relevant.
  const { data: overviewData } = useQuery({
    queryKey: ['report-overview-physio', session?.user?.id, f.applied],
    queryFn: () => reportsApi.getOverview({ month: f.applied.month }),
    enabled: !!session?.user?.id,
  });
  const overview = (overviewData as any)?.data;

  const { data: sessionsData } = useQuery({
    queryKey: ['reports-sessions-physio', session?.user?.id, f.applied],
    queryFn: () => reportsApi.getSessions({ groupBy: 'day', physiotherapistId: session?.user?.id, month: f.applied.month }),
    enabled: !!session?.user?.id,
  });
  const sessionsByDay = (sessionsData as any)?.data?.chart || [];
  const sessionsList = (sessionsData as any)?.data?.list || [];

  // Backend always pins this to the current physiotherapist's own row,
  // regardless of any userId param — nothing else to scope here.
  const { data: bonusData } = useQuery({
    queryKey: ['report-bonuses-physio', session?.user?.id, f.applied],
    queryFn: () => reportsApi.getBonuses({ month: f.applied.month }),
    enabled: !!session?.user?.id,
  });
  const myBonus = ((bonusData as any)?.data || [])[0];

  // Patient activity (financial/branch-wide patient data) is intentionally
  // never fetched here — physiotherapists don't have backend access to it,
  // and they shouldn't see other patients' payment status anyway.

  const sessionColumns: Column<any>[] = [
    {
      header: 'Pacienti',
      accessor: (row) => (
        <p className="font-medium text-sm">
          {row.patient?.firstName} {row.patient?.lastName}
        </p>
      ),
    },
    { header: 'Data', accessor: (row) => <span className="text-sm">{row.scheduledAt ? formatDate(row.scheduledAt) : '—'}</span> },
    { header: 'Statusi', accessor: (row) => <SessionBadge status={row.status} /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Raportet e mia</h1>
        <p className="text-sm text-muted-foreground">Aktiviteti juaj klinik</p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
            <div>
              <label className="text-xs text-muted-foreground">Muaji</label>
              <Input type="month" value={f.month} onChange={(e) => f.setMonth(e.target.value)} className="w-full sm:w-40" />
            </div>
            <Button onClick={f.apply} className="col-span-2 w-full sm:w-auto gap-2 gradient-teal text-white border-0"><Filter size={14} />Filtro</Button>
            <Button variant="outline" onClick={f.clear} className="col-span-2 w-full sm:w-auto gap-2"><FilterX size={14} />Pastro filtrat</Button>
          </div>
        </CardContent>
      </Card>

      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatsCard title="Trajtime të kryera" value={overview.sessionsCompleted} icon={CalendarCheck} />
          <StatsCard title="Pacientë aktivë" value={overview.activePatients} icon={Activity} />
          <StatsCard title="Bonusi im" value={formatCurrency(myBonus?.totalBonus || 0)} icon={Coins} />
        </div>
      )}

      {/* Sessions per day chart */}
      {sessionsByDay.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity size={16} className="text-teal-600" />
              Trajtimet ditore
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <ResponsiveContainer width="100%" height={180} minWidth={200}>
              <BarChart data={sessionsByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={25} />
                <Tooltip formatter={(v: any) => [v, 'Trajtime']} />
                <Bar dataKey="count" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Recent sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList size={16} className="text-teal-600" />
            Trajtimet e fundit
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={sessionColumns}
            data={sessionsList.slice(0, 10)}
            emptyMessage="Nuk ka trajtime të regjistruara"
          />
        </CardContent>
      </Card>
    </div>
  );
}
