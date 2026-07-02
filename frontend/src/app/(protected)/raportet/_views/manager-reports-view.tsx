'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi, usersApi } from '@/lib/api';
import { useSession } from 'next-auth/react';
import { useReportsFilters } from '@/hooks/use-reports-filters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, Column } from '@/components/ui/data-table';
import { PaymentBadge } from '@/components/ui/payment-badge';
import { StatsCard } from '@/components/ui/stats-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency, formatCount } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, AlertTriangle, Users, Activity, CalendarCheck, Filter, FilterX, Stethoscope, X } from 'lucide-react';
import { ClinicSettingsCard } from '@/components/reports/clinic-settings-card';

const ALL = '__all__';

export function ManagerReportsView() {
  const { data: session } = useSession();
  const branchId = session?.user?.userBranches?.[0]?.branchId;
  const f = useReportsFilters();

  const { data: usersData } = useQuery({ queryKey: ['users-select-manager'], queryFn: () => usersApi.getAll({ limit: 200 }) });
  const users = (usersData as any)?.data || [];

  // Every query is driven by the same `f.applied` object (+ the manager's
  // fixed branchId) — switching sections never loses a filter, and "Pastro
  // filtrat" (f.clear()) resets all of them in one shot.
  const { data: overviewData, isLoading: overviewLoading, isError: overviewError } = useQuery({
    queryKey: ['report-overview-manager', branchId, f.applied],
    queryFn: () => reportsApi.getOverview({ ...f.applied, branchId }),
    enabled: !!branchId,
  });
  const overview = (overviewData as any)?.data;

  const { data: sessionsByPhysioData } = useQuery({
    queryKey: ['reports-sessions-physio-manager', branchId, f.applied],
    queryFn: () => reportsApi.getSessions({ ...f.applied, physiotherapistId: f.applied.userId, branchId, groupBy: 'physiotherapist' }),
    enabled: !!branchId,
  });
  const sessionsByPhysio = (sessionsByPhysioData as any)?.data || [];

  const { data: revenueData } = useQuery({
    queryKey: ['reports-revenue-manager', branchId, f.applied],
    queryFn: () => reportsApi.getRevenue({ ...f.applied, groupBy: 'month', branchId }),
    enabled: !!branchId,
  });
  const revenueByMonth = (revenueData as any)?.data || [];

  const { data: revenueByDayData } = useQuery({
    queryKey: ['reports-revenue-day-manager', branchId, f.applied],
    queryFn: () => reportsApi.getRevenue({ ...f.applied, groupBy: 'day', branchId }),
    enabled: !!branchId,
  });
  const revenueByDay = (revenueByDayData as any)?.data || [];

  const { data: revenueByUserData } = useQuery({
    queryKey: ['reports-revenue-user-manager', branchId, f.applied],
    queryFn: () => reportsApi.getRevenue({ ...f.applied, groupBy: 'user', branchId }),
    enabled: !!branchId,
  });
  const revenueByUser = (revenueByUserData as any)?.data || [];

  const [balancesPage, setBalancesPage] = useState(1);
  useEffect(() => { setBalancesPage(1); }, [f.applied]);
  const { data: balancesData } = useQuery({
    queryKey: ['reports-balances-manager', branchId, f.applied, balancesPage],
    queryFn: () => reportsApi.getOutstandingBalances({ ...f.applied, branchId, page: balancesPage, limit: 24 }),
    enabled: !!branchId,
  });
  const balances = (balancesData as any)?.data || [];
  const balancesMeta = (balancesData as any)?.meta;

  const { data: bonusData } = useQuery({
    queryKey: ['report-bonuses-manager', branchId, f.applied],
    queryFn: () => reportsApi.getBonuses({ ...f.applied, branchId }),
    enabled: !!branchId,
  });
  const bonuses = (bonusData as any)?.data || [];

  const balanceColumns: Column<any>[] = [
    {
      header: 'Pacienti',
      accessor: (row) => (
        <p className="font-medium text-sm">{row.patient?.firstName} {row.patient?.lastName}</p>
      ),
    },
    { header: 'Telefoni', accessor: (row) => row.patient?.phone || '—' },
    { header: 'Dega', accessor: (row) => row.branch?.name || '—' },
    { header: 'Total', accessor: (row) => <span className="font-semibold">{formatCurrency(row.totalTreatmentValue)}</span> },
    { header: 'Paguar', accessor: (row) => <span className="text-green-600">{formatCurrency(row.totalPaidAmount)}</span> },
    { header: 'Borxhi aktual', accessor: (row) => <span className="font-bold text-red-600">{formatCurrency(row.currentDebt)}</span> },
    { header: 'Balanca finale', accessor: (row) => formatCurrency(row.finalRemainingBalance) },
    { header: 'Statusi', accessor: (row) => <PaymentBadge status={row.paymentStatus} /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Raportet</h1>
        <p className="text-sm text-muted-foreground">Analizat e degës tuaj</p>
      </div>

      <ClinicSettingsCard editable={false} />

      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
            <div>
              <label className="text-xs text-muted-foreground">Muaji</label>
              <Input type="month" value={f.month} onChange={(e) => f.setMonth(e.target.value)} className="w-full sm:w-40" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Data prej</label>
              <div className="flex items-center gap-1">
                <Input type="date" value={f.fromDate} disabled={!!f.month} onChange={(e) => f.setFromDate(e.target.value)} className="w-full sm:w-40" />
                {f.fromDate && !f.month && (
                  <button type="button" onClick={() => f.setFromDate('')} className="h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted"><X size={13} /></button>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Data deri</label>
              <div className="flex items-center gap-1">
                <Input type="date" value={f.toDate} disabled={!!f.month} onChange={(e) => f.setToDate(e.target.value)} className="w-full sm:w-40" />
                {f.toDate && !f.month && (
                  <button type="button" onClick={() => f.setToDate('')} className="h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted"><X size={13} /></button>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Përdoruesi</label>
              <Select value={f.userId || ALL} onValueChange={(v) => f.setUserId(v === ALL ? '' : v)}>
                <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Të gjithë" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Të gjithë</SelectItem>
                  {users.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>{u.firstName} {u.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={f.apply} className="col-span-2 w-full sm:w-auto gap-2 gradient-teal text-white border-0"><Filter size={14} />Filtro</Button>
            <Button variant="outline" onClick={f.clear} className="col-span-2 w-full sm:w-auto gap-2"><FilterX size={14} />Pastro filtrat</Button>
          </div>
        </CardContent>
      </Card>

      {overviewLoading && <p className="text-sm text-muted-foreground">Duke ngarkuar përmbledhjen...</p>}
      {overviewError && <p className="text-sm text-red-600">Ndodhi një gabim gjatë ngarkimit të raportit</p>}
      {overview && !overviewLoading && !overviewError && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard title="Pacientë gjithsej" value={overview.totalPatients} icon={Users} />
          <StatsCard title="Pacientë aktivë" value={overview.activePatients} icon={Activity} />
          <StatsCard title="Seanca të kryera" value={overview.sessionsCompleted} icon={CalendarCheck} />
          <StatsCard title="Borxhi aktual" value={formatCurrency(overview.currentDebt)} icon={AlertTriangle} />
        </div>
      )}

      {/* Trajtimet sipas fizioterapeutit */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Stethoscope size={16} className="text-teal-600" />
            Trajtimet sipas fizioterapeutit
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {sessionsByPhysio.map((p: any) => (
              <div key={p.physiotherapistId} className="flex justify-between items-center py-1 border-b last:border-0">
                <span className="text-sm">{p.physiotherapistName}</span>
                <span className="font-bold text-sm">{formatCount(p.sessions, 'trajtim', 'trajtime')}</span>
              </div>
            ))}
            {!sessionsByPhysio.length && (
              <p className="text-sm text-muted-foreground text-center py-4">Nuk ka të dhëna</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Revenue Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp size={16} className="text-teal-600" />
            Të ardhurat mujore
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <ResponsiveContainer width="100%" height={200} minWidth={200}>
            <BarChart data={revenueByMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="period" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={45} tickFormatter={(v) => `${v}€`} />
              <Tooltip formatter={(v: any) => [`${v}€`, 'Të ardhura']} />
              <Bar dataKey="revenue" fill="#0d9488" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Revenue by date / by user */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Të ardhurat sipas datës</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              columns={[
                { header: 'Data', accessor: (r: any) => r.period },
                { header: 'Pagesa', accessor: (r: any) => r.payments },
                { header: 'Të ardhurat', accessor: (r: any) => <span className="font-semibold">{formatCurrency(r.revenue)}</span> },
              ]}
              data={revenueByDay}
              emptyMessage="Nuk ka të dhëna"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Të ardhurat sipas përdoruesit</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              columns={[
                { header: 'Përdoruesi', accessor: (r: any) => r.userName },
                { header: 'Pagesa', accessor: (r: any) => r.payments },
                { header: 'Të ardhurat', accessor: (r: any) => <span className="font-semibold">{formatCurrency(r.revenue)}</span> },
              ]}
              data={revenueByUser}
              emptyMessage="Nuk ka të dhëna"
            />
          </CardContent>
        </Card>
      </div>

      {/* Outstanding Balances */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" />
            Balanca të papaguara
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable columns={balanceColumns} data={balances} emptyMessage="Nuk ka balanca të papaguara" pagination={balancesMeta} onPageChange={setBalancesPage} />
        </CardContent>
      </Card>

      {/* Bonuses — configured only by ADMIN (Reports → Bonuset on the admin view); manager sees their own branch's figures read-only */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bonuset për trajtime të kompletuara</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={[
              { header: 'Fizioterapeuti', accessor: (r: any) => <span className="font-medium">{r.userName}</span> },
              { header: 'Trajtime të kryera', accessor: (r: any) => <span className="font-bold text-teal-600">{r.completedSessions}</span> },
              { header: 'Bonusi total', accessor: (r: any) => <span className="font-bold text-green-600">{formatCurrency(r.totalBonus)}</span> },
            ]}
            data={bonuses}
            emptyMessage="Nuk ka të dhëna për periudhën e zgjedhur"
          />
        </CardContent>
      </Card>
    </div>
  );
}
