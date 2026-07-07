'use client';

import { useState } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { sessionsApi } from '@/lib/api';
import { ROUTES } from '@/lib/routes';
import { DataTable, Column } from '@/components/ui/data-table';
import { SessionBadge } from '@/components/ui/session-badge';
import { Button } from '@/components/ui/button';
import { PhysiotherapistCombobox } from '@/components/ui/physiotherapist-combobox';
import { formatDate } from '@/lib/utils';
import { Calendar, CheckCircle2, CreditCard } from 'lucide-react';
import { ClearableDateInput } from '@/components/ui/clearable-date-input';
import { DocumentActions } from '@/components/shared/document-actions';
import { PaymentFormDialog } from '@/components/payments/payment-form-dialog';
import { printSessionReport, shareSessionReport } from '@/lib/invoice';

export function ManagerSessionsView() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo = searchParams.get('dateTo') || '';
  const [page, setPage] = useState(1);
  const [physiotherapistId, setPhysiotherapistId] = useState('');
  const [paySession, setPaySession] = useState<any>(null);
  const branchId = session?.user?.userBranches?.[0]?.branchId;

  const setDateParam = (key: 'dateFrom' | 'dateTo', value: string) => {
    setPage(1);
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value); else params.delete(key);
    router.replace(params.size ? `${pathname}?${params.toString()}` : pathname);
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['sessions-manager', page, branchId, physiotherapistId, dateFrom, dateTo],
    queryFn: () => sessionsApi.getAll({
      page, limit: 24, branchId, physiotherapistId: physiotherapistId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo ? `${dateTo}T23:59:59` : undefined,
    }),
    enabled: !!branchId,
    placeholderData: keepPreviousData,
  });
  const sessions = (data as any)?.data || [];
  const meta = (data as any)?.meta;

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
    { header: 'Statusi', accessor: (row) => <SessionBadge status={row.status} /> },
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
      header: 'Veprimet',
      accessor: (row) => (
        <DocumentActions
          onShow={() => router.push(ROUTES.sessionDetail(row.id))}
          onPrint={() => printSessionReport(row.id)}
          onShare={() => shareSessionReport(row.id, row.patient?.firstName, row.patient?.lastName)}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Trajtimet</h1>
        <p className="text-sm text-muted-foreground">Trajtimet e degës tuaj</p>
      </div>

      {/* Filters — stacked on mobile, row on md+ */}
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-end md:gap-3">
        <div className="w-full md:w-56">
          <PhysiotherapistCombobox
            value={physiotherapistId}
            onChange={(v) => { setPhysiotherapistId(v); setPage(1); }}
            branchId={branchId}
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
      />

      {paySession && (
        <PaymentFormDialog
          open={!!paySession}
          onClose={() => setPaySession(null)}
          onSuccess={() => {
            setPaySession(null);
            queryClient.invalidateQueries({ queryKey: ['sessions-manager'] });
            queryClient.invalidateQueries({ queryKey: ['treatment-plans'] });
            queryClient.invalidateQueries({ queryKey: ['payment-debts'] });
            queryClient.invalidateQueries({ queryKey: ['outstanding-balances'] });
            queryClient.invalidateQueries({ queryKey: ['report-overview-manager'] });
            queryClient.invalidateQueries({ queryKey: ['payments-manager'] });
          }}
          defaultPatientId={paySession.patientId}
          defaultPlanId={paySession.treatmentPlanId || undefined}
          defaultSessionId={paySession.id}
        />
      )}

    </div>
  );
}
