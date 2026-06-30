'use client';

import { useState } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { sessionsApi } from '@/lib/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { SessionBadge } from '@/components/ui/session-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhysiotherapistCombobox } from '@/components/ui/physiotherapist-combobox';
import { formatDate } from '@/lib/utils';
import { Calendar, CheckCircle2, CreditCard, X } from 'lucide-react';
import { DocumentActions } from '@/components/shared/document-actions';
import { PaymentFormDialog } from '@/components/payments/payment-form-dialog';
import { showSessionReport, printSessionReport } from '@/lib/invoice';
import { buildSessionShareText } from '@/lib/share';

export function ManagerSessionsView() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const dateFilter = searchParams.get('date') || '';
  const [page, setPage] = useState(1);
  const [physiotherapistId, setPhysiotherapistId] = useState('');
  const [paySession, setPaySession] = useState<any>(null);
  const branchId = session?.user?.userBranches?.[0]?.branchId;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['sessions-manager', page, branchId, physiotherapistId, dateFilter],
    queryFn: () => sessionsApi.getAll({
      page, limit: 24, branchId, physiotherapistId: physiotherapistId || undefined,
      dateFrom: dateFilter || undefined,
      dateTo: dateFilter ? `${dateFilter}T23:59:59` : undefined,
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
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Trajtimet (vetëm lexim)</h1>
          <p className="text-sm text-muted-foreground">Trajtimet e degës tuaj</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-56">
            <PhysiotherapistCombobox
              value={physiotherapistId}
              onChange={(v) => { setPhysiotherapistId(v); setPage(1); }}
              branchId={branchId}
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
