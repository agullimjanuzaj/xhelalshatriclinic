'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi, usersApi, branchesApi } from '@/lib/api';
import { useReportsFilters } from '@/hooks/use-reports-filters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { PaymentBadge } from '@/components/ui/payment-badge';
import { StatsCard } from '@/components/ui/stats-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency, formatCount } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, Activity, CalendarCheck, Stethoscope, Wallet, AlertTriangle, FilterX, Filter } from 'lucide-react';
import { ClearableDateInput } from '@/components/ui/clearable-date-input';
import { ClinicSettingsCard } from '@/components/reports/clinic-settings-card';
import { BonusConfigCard } from '@/components/reports/bonus-config-card';

const ALL = '__all__';

export function AdminReportsView() {
  const f = useReportsFilters();
  const [outstandingPage, setOutstandingPage] = useState(1);
  useEffect(() => { setOutstandingPage(1); }, [f.applied]);

  const { data: usersData } = useQuery({ queryKey: ['users-select'], queryFn: () => usersApi.getAll({ limit: 200 }) });
  const users = (usersData as any)?.data || [];
  const { data: branchesData } = useQuery({ queryKey: ['branches-select'], queryFn: () => branchesApi.getAll() });
  const branches = (branchesData as any)?.data || [];

  // Every query below is driven by the exact same `f.applied` object —
  // switching tabs never loses a filter, and "Pastro filtrat" (f.clear())
  // resets every tab in one shot since they all key off this one value.
  const { data: overviewData, isLoading: overviewLoading, isError: overviewError } = useQuery({
    queryKey: ['report-overview', f.applied],
    queryFn: () => reportsApi.getOverview(f.applied),
  });
  const overview = (overviewData as any)?.data;

  const { data: sessionsByBranch } = useQuery({
    queryKey: ['report-sessions-branch', f.applied],
    queryFn: () => reportsApi.getSessions({ ...f.applied, physiotherapistId: f.applied.userId, groupBy: 'branch' }),
  });

  const { data: sessionsByPhysio } = useQuery({
    queryKey: ['report-sessions-physio', f.applied],
    queryFn: () => reportsApi.getSessions({ ...f.applied, physiotherapistId: f.applied.userId, groupBy: 'physiotherapist' }),
  });

  const { data: revenueByBranch } = useQuery({
    queryKey: ['report-revenue-branch', f.applied],
    queryFn: () => reportsApi.getRevenue({ ...f.applied, groupBy: 'branch' }),
  });

  const { data: revenueByMonth } = useQuery({
    queryKey: ['report-revenue-month', f.applied],
    queryFn: () => reportsApi.getRevenue({ ...f.applied, groupBy: 'month' }),
  });

  const { data: revenueByDay } = useQuery({
    queryKey: ['report-revenue-day', f.applied],
    queryFn: () => reportsApi.getRevenue({ ...f.applied, groupBy: 'day' }),
  });

  const { data: revenueByUser } = useQuery({
    queryKey: ['report-revenue-user', f.applied],
    queryFn: () => reportsApi.getRevenue({ ...f.applied, groupBy: 'user' }),
  });

  const { data: outstandingData } = useQuery({
    queryKey: ['outstanding-balances', f.applied, outstandingPage],
    queryFn: () => reportsApi.getOutstandingBalances({ ...f.applied, page: outstandingPage, limit: 24 }),
  });

  const { data: bonusData } = useQuery({
    queryKey: ['report-bonuses', f.applied],
    queryFn: () => reportsApi.getBonuses(f.applied),
  });

  const sessionsBranchData = (sessionsByBranch as any)?.data || [];
  const sessionsPhysioData = (sessionsByPhysio as any)?.data || [];
  const revBranchData = (revenueByBranch as any)?.data || [];
  const revMonthData = (revenueByMonth as any)?.data || [];
  const revDayData = (revenueByDay as any)?.data || [];
  const revUserData = (revenueByUser as any)?.data || [];
  const outstanding = (outstandingData as any)?.data || [];
  const outstandingMeta = (outstandingData as any)?.meta;
  const bonuses = (bonusData as any)?.data || [];

  const outstandingColumns = [
    {
      header: 'Pacienti',
      accessor: (r: any) => (
        <div>
          <p className="font-medium text-sm">{r.patient?.firstName} {r.patient?.lastName}</p>
          <p className="text-xs text-muted-foreground">{r.patient?.phone}</p>
        </div>
      ),
    },
    { header: 'Dega', accessor: (r: any) => r.branch?.name || '—' },
    { header: 'Trajtimi', accessor: (r: any) => r.treatment || '—' },
    { header: 'Totali', accessor: (r: any) => formatCurrency(r.totalTreatmentValue) },
    { header: 'Vlera e kryer', accessor: (r: any) => formatCurrency(r.currentEarnedAmount) },
    { header: 'Paguar', accessor: (r: any) => <span className="text-green-600">{formatCurrency(r.totalPaidAmount)}</span> },
    { header: 'Borxhi aktual', accessor: (r: any) => <span className="font-bold text-red-600">{formatCurrency(r.currentDebt)}</span> },
    { header: 'Balanca finale', accessor: (r: any) => formatCurrency(r.finalRemainingBalance) },
    { header: 'Statusi', accessor: (r: any) => <PaymentBadge status={r.paymentStatus} /> },
  ];

  const sessionsByUserColumns = [
    { header: 'Përdoruesi', accessor: (r: any) => r.userName },
    { header: 'Seancat', accessor: (r: any) => r.sessions },
  ];

  const revenueByUserColumns = [
    { header: 'Përdoruesi', accessor: (r: any) => r.userName },
    { header: 'Pagesa', accessor: (r: any) => r.payments },
    { header: 'Të ardhurat', accessor: (r: any) => <span className="font-semibold">{formatCurrency(r.revenue)}</span> },
  ];

  const revenueByDayColumns = [
    { header: 'Data', accessor: (r: any) => r.period },
    { header: 'Pagesa', accessor: (r: any) => r.payments },
    { header: 'Të ardhurat', accessor: (r: any) => <span className="font-semibold">{formatCurrency(r.revenue)}</span> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Raportet</h1>
        <p className="text-sm text-muted-foreground">Analizë e plotë e aktivitetit të klinikës</p>
      </div>

      <ClinicSettingsCard editable />

      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
            <div>
              <label className="text-xs text-muted-foreground">Muaji</label>
              <Input type="month" value={f.month} onChange={(e) => f.setMonth(e.target.value)} className="w-full sm:w-40" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Data prej</label>
              <ClearableDateInput value={f.fromDate} onChange={f.setFromDate} onClear={() => f.setFromDate('')} disabled={!!f.month} className="w-full sm:w-40" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Data deri</label>
              <ClearableDateInput value={f.toDate} onChange={f.setToDate} onClear={() => f.setToDate('')} disabled={!!f.month} className="w-full sm:w-40" />
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
            <div>
              <label className="text-xs text-muted-foreground">Dega</label>
              <Select value={f.branchId || ALL} onValueChange={(v) => f.setBranchId(v === ALL ? '' : v)}>
                <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Të gjitha" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Të gjitha</SelectItem>
                  {branches.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
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
          <StatsCard title="Trajtime të krijuara" value={overview.treatmentsCreated} icon={Stethoscope} />
          {overview.paymentsReceived !== undefined && (
            <>
              <StatsCard title="Pagesa të marra" value={formatCurrency(overview.paymentsReceived)} icon={Wallet} />
              <StatsCard title="Vlera totale e trajtimeve" value={formatCurrency(overview.totalTreatmentValue)} icon={Stethoscope} />
              <StatsCard title="Borxhi aktual" value={formatCurrency(overview.currentDebt)} icon={AlertTriangle} />
              <StatsCard title="Balanca e pashlyer" value={formatCurrency(overview.outstandingBalances)} icon={AlertTriangle} />
            </>
          )}
        </div>
      )}

      {overview?.sessionsByUser?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Seancat sipas përdoruesit</CardTitle></CardHeader>
          <CardContent>
            <DataTable columns={sessionsByUserColumns} data={overview.sessionsByUser} emptyMessage="Nuk ka të dhëna" />
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="sessions">
        {/* Scrollable tabs row on mobile */}
        <div className="overflow-x-auto pb-0.5">
          <TabsList className="min-w-max">
            <TabsTrigger value="sessions">Trajtimet</TabsTrigger>
            <TabsTrigger value="revenue">Të ardhurat</TabsTrigger>
            <TabsTrigger value="outstanding">Balancet</TabsTrigger>
            <TabsTrigger value="bonuses">Bonuset</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="sessions" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Trajtimet sipas degës</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <ResponsiveContainer width="100%" height={200} minWidth={200}>
                  <BarChart data={sessionsBranchData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="branchName" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={30} />
                    <Tooltip formatter={(v: any) => [v, 'Trajtime']} />
                    <Bar dataKey="sessions" fill="#0d9488" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Trajtimet sipas fizioterapeutit</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {sessionsPhysioData.map((p: any) => (
                    <div key={p.physiotherapistId} className="flex justify-between items-center py-1 border-b last:border-0">
                      <span className="text-sm">{p.physiotherapistName}</span>
                      <span className="font-bold text-sm">{formatCount(p.sessions, 'trajtim', 'trajtime')}</span>
                    </div>
                  ))}
                  {!sessionsPhysioData.length && (
                    <p className="text-sm text-muted-foreground text-center py-4">Nuk ka të dhëna</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="revenue" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Të ardhurat mujore</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <ResponsiveContainer width="100%" height={200} minWidth={200}>
                  <BarChart data={revMonthData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={45} tickFormatter={(v) => `${v}€`} />
                    <Tooltip formatter={(v: any) => [formatCurrency(v), 'Të ardhurat']} />
                    <Bar dataKey="revenue" fill="#0d9488" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Të ardhurat sipas degës</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <ResponsiveContainer width="100%" height={200} minWidth={200}>
                  <BarChart data={revBranchData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="branchName" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={45} tickFormatter={(v) => `${v}€`} />
                    <Tooltip formatter={(v: any) => [formatCurrency(v), 'Të ardhurat']} />
                    <Bar dataKey="revenue" fill="#0891b2" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Të ardhurat sipas datës</CardTitle></CardHeader>
              <CardContent>
                <DataTable columns={revenueByDayColumns} data={revDayData} emptyMessage="Nuk ka të dhëna" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Të ardhurat sipas përdoruesit</CardTitle></CardHeader>
              <CardContent>
                <DataTable columns={revenueByUserColumns} data={revUserData} emptyMessage="Nuk ka të dhëna" />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="outstanding" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Balancet e pa paguara</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={outstandingColumns}
                data={outstanding}
                emptyMessage="Nuk ka balanca të pa paguara"
                pagination={outstandingMeta}
                onPageChange={setOutstandingPage}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bonuses" className="mt-4 space-y-4">
          <BonusConfigCard editable />
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Bonuset për trajtime të kompletuara</CardTitle>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
