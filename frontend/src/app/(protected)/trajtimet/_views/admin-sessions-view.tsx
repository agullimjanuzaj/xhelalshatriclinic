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
import { getPatientDetailPath } from '@/lib/routes';
import { Search, Calendar, Plus, Pencil, Trash2 } from 'lucide-react';
import { CreateSessionDialog } from '@/components/sessions/create-session-dialog';
import { EditSessionDialog } from '@/components/sessions/edit-session-dialog';
import { DocumentActions } from '@/components/shared/document-actions';
import { PaymentFormDialog } from '@/components/payments/payment-form-dialog';
import { showSessionReport, printSessionReport } from '@/lib/invoice';
import { buildSessionShareText } from '@/lib/share';
import { CheckCircle2, CreditCard, X } from 'lucide-react';
import { toast } from 'sonner';

export function AdminSessionsView() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const dateFilter = searchParams.get('date') || '';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [physiotherapistId, setPhysiotherapistId] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editSession, setEditSession] = useState<any>(null);
  const [deleteSession, setDeleteSession] = useState<any>(null);
  const [paySession, setPaySession] = useState<any>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['sessions', page, search, physiotherapistId, dateFilter],
    queryFn: () => sessionsApi.getAll({
      page, limit: 24, search: search || undefined, physiotherapistId: physiotherapistId || undefined,
      dateFrom: dateFilter || undefined,
      dateTo: dateFilter ? `${dateFilter}T23:59:59` : undefined,
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
      header: 'Fizioterapisti',
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
        row.isPaid ? (
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
            onShow={() => showSessionReport(row.id)}
            onPrint={() => printSessionReport(row.id)}
            shareText={buildSessionShareText({
              patientName: `${row.patient?.firstName || ''} ${row.patient?.lastName || ''}`.trim(),
              sessionNumber: row.sessionNumber,
              totalSessions: row.treatmentPlan?.totalSessions,
              date: row.scheduledAt || row.completedAt || row.createdAt,
              physiotherapistName: (row.physiotherapist || row.completedByUser)
                ? `${(row.physiotherapist || row.completedByUser).firstName} ${(row.physiotherapist || row.completedByUser).lastName}`
                : undefined,
              treatmentTypes: row.treatmentTypes,
              notes: row.notes,
              recommendations: row.recommendations,
            })}
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Trajtimet</h1>
          <p className="text-sm text-muted-foreground">Të gjitha trajtimet e klinikës</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2 gradient-teal text-white border-0">
          <Plus size={16} />Trajtim i ri
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Kërko pacient..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <div className="w-56">
          <PhysiotherapistCombobox
            value={physiotherapistId}
            onChange={(v) => { setPhysiotherapistId(v); setPage(1); }}
            placeholder="Filtro fizioterapeutin"
          />
        </div>
        <div className="relative">
          <Input
            type="date"
            value={dateFilter}
            onChange={(e) => {
              setPage(1);
              const params = new URLSearchParams(searchParams.toString());
              if (e.target.value) params.set('date', e.target.value); else params.delete('date');
              router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
            }}
            className="w-40 pr-8"
          />
          {dateFilter && (
            <button
              type="button"
              title="Pastro datën"
              onClick={() => { setPage(1); router.replace(pathname); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {dateFilter && (
        <p className="text-sm text-muted-foreground">
          Duke shfaqur trajtimet e datës <strong>{formatDate(dateFilter)}</strong>
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
