'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { sessionsApi } from '@/lib/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SessionBadge } from '@/components/ui/session-badge';
import { Input } from '@/components/ui/input';
import { PhysiotherapistCombobox } from '@/components/ui/physiotherapist-combobox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatDate, formatCurrency } from '@/lib/utils';
import { getPatientDetailPath, ROUTES } from '@/lib/routes';
import { Search, Calendar, Plus, Pencil, Trash2, CheckCircle2, CreditCard } from 'lucide-react';
import { ClearableDateInput } from '@/components/ui/clearable-date-input';
import { CreateSessionDialog } from '@/components/sessions/create-session-dialog';
import { EditSessionDialog } from '@/components/sessions/edit-session-dialog';
import { DocumentActions } from '@/components/shared/document-actions';
import { PaymentFormDialog } from '@/components/payments/payment-form-dialog';
import { printSessionReport, shareSessionReport } from '@/lib/invoice';
import { toast } from 'sonner';

export function AdminSessionsView() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo = searchParams.get('dateTo') || '';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [physiotherapistId, setPhysiotherapistId] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editSession, setEditSession] = useState<any>(null);
  const [deleteSession, setDeleteSession] = useState<any>(null);
  const [paySession, setPaySession] = useState<any>(null);

  const setDateParam = (key: 'dateFrom' | 'dateTo', value: string) => {
    setPage(1);
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value); else params.delete(key);
    router.replace(params.size ? `${pathname}?${params.toString()}` : pathname);
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['sessions', page, search, physiotherapistId, dateFrom, dateTo],
    queryFn: () => sessionsApi.getAll({
      page, limit: 24, search: search || undefined, physiotherapistId: physiotherapistId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo ? `${dateTo}T23:59:59` : undefined,
    }),
    placeholderData: keepPreviousData,
  });
  const sessions = (data as any)?.data || [];
  const meta = (data as any)?.meta;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => sessionsApi.delete(id),
    onSuccess: () => {
      toast.success('Trajtimi u fshi me sukses');
      setDeleteSession(null);
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['treatment-plans'] });
      queryClient.invalidateQueries({ queryKey: ['payment-debts'] });
      queryClient.invalidateQueries({ queryKey: ['outstanding-balances'] });
      queryClient.invalidateQueries({ queryKey: ['report-overview'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns: Column<any>[] = [
    {
      header: 'Pacienti',
      accessor: (row) => (
        <div>
          <p className="font-medium text-sm">{row.patient?.firstName} {row.patient?.lastName}</p>
          <p className="text-xs text-muted-foreground">{row.sessionNumber ? `Trajtimi #${row.sessionNumber}` : 'Pa plan kontrolle'}</p>
        </div>
      ),
    },
    {
      header: 'Fizioterapeuti',
      accessor: (row) => {
        const person = row.physiotherapist || row.completedByUser;
        return <p className="text-sm">{person ? `${person.firstName} ${person.lastName}` : '—'}</p>;
      },
    },
    {
      header: 'Data',
      accessor: (row) => (
        <div className="flex items-center gap-2 text-sm">
          <Calendar size={14} className="text-muted-foreground" />
          {formatDate(row.scheduledAt || row.completedAt || row.createdAt)}
        </div>
      ),
    },
    {
      header: 'Statusi',
      accessor: (row) => <SessionBadge status={row.status} />,
    },
    {
      header: 'Shuma',
      accessor: (row) => <span className="font-semibold text-sm">{formatCurrency(row.amount)}</span>,
    },
    {
      header: 'Paguar',
      accessor: (row) =>
        row.isPaid || row.treatmentPlan?.paymentStatus === 'PAID' ? (
          <CheckCircle2 size={18} className="text-green-500" />
        ) : (
          <div data-stop-row-click>
            <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => setPaySession(row)}>
              <CreditCard size={12} />Paguaj
            </Button>
          </div>
        ),
    },
    {
      header: 'Dega',
      accessor: (row) => <Badge variant="outline">{row.branch?.name || '—'}</Badge>,
    },
    {
      header: 'Veprimet',
      accessor: (row) => (
        <div className="flex items-center gap-1">
          <DocumentActions
            onShow={() => router.push(ROUTES.sessionDetail(row.id))}
            onPrint={() => printSessionReport(row.id)}
            onShare={() => shareSessionReport(row.id, row.patient?.firstName, row.patient?.lastName)}
          />
          <div data-stop-row-click className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setEditSession(row)} title="Ndrysho">
              <Pencil size={14} />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:text-red-600" onClick={() => setDeleteSession(row)} title="Fshi">
              <Trash2 size={14} />
            </Button>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Trajtimet</h1>
          <p className="text-sm text-muted-foreground">Të gjitha trajtimet e klinikës</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2 gradient-teal text-white border-0 w-full sm:w-auto">
          <Plus size={16} />Trajtim i ri
        </Button>
      </div>

      {/* Filters — stacked on mobile, row on md+ */}
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-end md:gap-3">
        <div className="relative w-full md:flex-1 md:max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Kërko pacient..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 w-full"
          />
        </div>
        <div className="w-full md:w-56">
          <PhysiotherapistCombobox
            value={physiotherapistId}
            onChange={(v) => { setPhysiotherapistId(v); setPage(1); }}
            placeholder="Filtro fizioterapeutin"
          />
        </div>
        {/* Date range */}
        <div className="flex gap-2 w-full md:w-auto">
          <div className="flex-1 md:flex-none">
            <label className="text-xs text-muted-foreground block mb-1">Prej</label>
            <ClearableDateInput
              value={dateFrom}
              onChange={(v) => setDateParam('dateFrom', v)}
              onClear={() => setDateParam('dateFrom', '')}
              max={dateTo || undefined}
              className="w-full md:w-36"
            />
          </div>
          <div className="flex-1 md:flex-none">
            <label className="text-xs text-muted-foreground block mb-1">Deri</label>
            <ClearableDateInput
              value={dateTo}
              onChange={(v) => setDateParam('dateTo', v)}
              onClear={() => setDateParam('dateTo', '')}
              min={dateFrom || undefined}
              className="w-full md:w-36"
            />
          </div>
        </div>
      </div>

      {(dateFrom || dateTo) && (
        <p className="text-xs text-muted-foreground">
          {dateFrom && dateTo
            ? <>Prej <strong>{formatDate(dateFrom)}</strong> deri <strong>{formatDate(dateTo)}</strong></>
            : dateFrom ? <>Prej <strong>{formatDate(dateFrom)}</strong></> : <>Deri <strong>{formatDate(dateTo)}</strong></>}
        </p>
      )}

      <DataTable
        columns={columns}
        data={sessions}
        isLoading={isLoading}
        isError={isError}
        errorMessage={(error as Error)?.message}
        pagination={meta}
        onPageChange={setPage}
        emptyMessage="Nuk ka trajtime"
        onRowClick={(row: any) => router.push(`${getPatientDetailPath('ADMIN', row.patientId)}?tab=seancat`)}
      />

      {showCreate && (
        <CreateSessionDialog open={showCreate} onClose={() => setShowCreate(false)} />
      )}

      {editSession && (
        <EditSessionDialog open={!!editSession} session={editSession} isAdmin onClose={() => setEditSession(null)} />
      )}

      <ConfirmDialog
        open={!!deleteSession}
        onOpenChange={(open) => !open && setDeleteSession(null)}
        title="Fshi trajtimin?"
        description="A jeni i sigurt që dëshironi ta fshini këtë trajtim?"
        onConfirm={() => deleteSession && deleteMutation.mutate(deleteSession.id)}
        isPending={deleteMutation.isPending}
      />

      {paySession && (
        <PaymentFormDialog
          open={!!paySession}
          onClose={() => setPaySession(null)}
          onSuccess={() => {
            setPaySession(null);
            queryClient.invalidateQueries({ queryKey: ['sessions'] });
            queryClient.invalidateQueries({ queryKey: ['treatment-plans'] });
            queryClient.invalidateQueries({ queryKey: ['payment-debts'] });
            queryClient.invalidateQueries({ queryKey: ['outstanding-balances'] });
            queryClient.invalidateQueries({ queryKey: ['report-overview'] });
            queryClient.invalidateQueries({ queryKey: ['payments'] });
          }}
          defaultPatientId={paySession.patientId}
          defaultPlanId={paySession.treatmentPlanId || undefined}
          defaultSessionId={paySession.id}
        />
      )}

    </div>
  );
}
