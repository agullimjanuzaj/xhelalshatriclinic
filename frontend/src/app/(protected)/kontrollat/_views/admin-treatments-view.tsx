'use client';

import { useState } from 'react';
import { useQuery, useQueryClient, useMutation, keepPreviousData } from '@tanstack/react-query';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { treatmentPlansApi } from '@/lib/api';
import { getPatientDetailPath } from '@/lib/routes';
import { DataTable, Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { PaymentBadge } from '@/components/ui/payment-badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ClearableDateInput } from '@/components/ui/clearable-date-input';
import { getTreatmentTypeLabel, formatDate } from '@/lib/utils';
import { Search, Plus, Pencil, Trash2 } from 'lucide-react';
import { CreatePlanDialog } from '@/components/treatment-plans/create-plan-dialog';
import { DocumentActions } from '@/components/shared/document-actions';
import { showTreatmentPlan, printTreatmentPlan, shareTreatmentPlan } from '@/lib/invoice';
import { toast } from 'sonner';

export function AdminTreatmentsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [editPlan, setEditPlan] = useState<any>(null);
  const [deletePlan, setDeletePlan] = useState<any>(null);

  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo = searchParams.get('dateTo') || '';

  const setDateParam = (key: 'dateFrom' | 'dateTo', value: string) => {
    setPage(1);
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value); else params.delete(key);
    router.replace(params.size ? `${pathname}?${params.toString()}` : pathname);
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['treatment-plans', page, search, dateFrom, dateTo],
    queryFn: () => treatmentPlansApi.getAll({
      page, limit: 24,
      search: search || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    placeholderData: keepPreviousData,
  });
  const plans = (data as any)?.data || [];
  const meta = (data as any)?.meta;

  const invalidateAfterChange = () => {
    queryClient.invalidateQueries({ queryKey: ['treatment-plans'] });
    queryClient.invalidateQueries({ queryKey: ['patients'] });
    queryClient.invalidateQueries({ queryKey: ['sessions'] });
    queryClient.invalidateQueries({ queryKey: ['payments'] });
    queryClient.invalidateQueries({ queryKey: ['payment-debts'] });
    queryClient.invalidateQueries({ queryKey: ['report-overview'] });
    queryClient.invalidateQueries({ queryKey: ['outstanding-balances'] });
    queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => treatmentPlansApi.delete(id),
    onSuccess: () => {
      toast.success('Trajtimi u fshi me sukses!');
      setDeletePlan(null);
      invalidateAfterChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns: Column<any>[] = [
    {
      header: 'Pacienti',
      accessor: (row) => (
        <div>
          <p className="font-medium text-sm">{row.patient?.firstName} {row.patient?.lastName}</p>
          <p className="text-xs text-muted-foreground">{row.patient?.phone}</p>
        </div>
      ),
    },
    {
      header: 'Dega',
      accessor: (row) => <Badge variant="outline">{row.branch?.name || '—'}</Badge>,
    },
    {
      header: 'Lloji i trajtimit',
      accessor: (row) => (
        <div className="flex flex-wrap gap-1 max-w-[160px]">
          {(row.treatmentTypes || []).slice(0, 2).map((t: string) => (
            <Badge key={t} variant="outline" className="text-[10px]">{getTreatmentTypeLabel(t)}</Badge>
          ))}
          {(row.treatmentTypes?.length || 0) > 2 && (
            <Badge variant="outline" className="text-[10px]">+{row.treatmentTypes.length - 2}</Badge>
          )}
        </div>
      ),
    },
    {
      header: 'Seancat',
      accessor: (row) => <span className="text-sm font-medium">{row.completedSessions}/{row.totalSessions}</span>,
    },
    {
      header: 'Pagesa',
      accessor: (row) => <PaymentBadge status={row.paymentStatus} />,
    },
    {
      header: 'Statusi',
      accessor: (row) => (
        <Badge variant={row.completedSessions >= row.totalSessions ? 'secondary' : 'default'}>
          {row.completedSessions >= row.totalSessions ? 'Përfunduar' : 'Aktiv'}
        </Badge>
      ),
    },
    {
      header: 'Veprimet',
      accessor: (row) => (
        <div className="flex items-center gap-1">
          <DocumentActions
            onShow={() => showTreatmentPlan(row.id)}
            onPrint={() => printTreatmentPlan(row.id)}
            onShare={() => shareTreatmentPlan(row.id, row.patient?.firstName, row.patient?.lastName)}
          />
          <div data-stop-row-click className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setEditPlan(row)} title="Ndrysho">
              <Pencil size={14} />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:text-red-600" onClick={() => setDeletePlan(row)} title="Fshi">
              <Trash2 size={14} />
            </Button>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Kontrollat</h1>
          <p className="text-sm text-muted-foreground">Të gjitha kontrollat e klinikës</p>
        </div>
        <Button onClick={() => setShowPlanDialog(true)} className="gap-2 gradient-teal text-white border-0 w-full sm:w-auto">
          <Plus size={16} />Kontrollë e re
        </Button>
      </div>

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
        data={plans}
        isLoading={isLoading}
        isError={isError}
        errorMessage={(error as Error)?.message}
        pagination={meta}
        onPageChange={setPage}
        emptyMessage="Nuk ka kontrolla"
        onRowClick={(row: any) => router.push(`${getPatientDetailPath('ADMIN', row.patientId)}?tab=trajtimet`)}
      />

      {showPlanDialog && (
        <CreatePlanDialog
          open={showPlanDialog}
          onClose={() => { setShowPlanDialog(false); invalidateAfterChange(); }}
        />
      )}

      {editPlan && (
        <CreatePlanDialog
          open={!!editPlan}
          plan={editPlan}
          onClose={() => { setEditPlan(null); invalidateAfterChange(); }}
        />
      )}

      <ConfirmDialog
        open={!!deletePlan}
        onOpenChange={(open) => !open && setDeletePlan(null)}
        title="Fshi trajtimin?"
        description={`Trajtimi i ${deletePlan?.patient?.firstName} ${deletePlan?.patient?.lastName} do të fshihet. Seancat dhe pagesat ekzistuese nuk humbasin, vetëm trajtimi nuk do të shfaqet më si aktiv.`}
        onConfirm={() => deletePlan && deleteMutation.mutate(deletePlan.id)}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
