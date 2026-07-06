'use client';

import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { treatmentPlansApi } from '@/lib/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { ClearableDateInput } from '@/components/ui/clearable-date-input';
import { getTreatmentTypeLabel, formatDate } from '@/lib/utils';
import { getPatientDetailPath, ROUTES } from '@/lib/routes';
import { Badge } from '@/components/ui/badge';
import { DocumentActions } from '@/components/shared/document-actions';
import { printTreatmentPlan, shareTreatmentPlan } from '@/lib/invoice';

const ASSIGNED_ROW = 'border-l-[3px] border-l-teal-500 bg-teal-50/40 dark:bg-teal-950/20';

export function PhysioTreatmentsView() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [page, setPage] = useState(1);

  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo = searchParams.get('dateTo') || '';

  const setDateParam = (key: 'dateFrom' | 'dateTo', value: string) => {
    setPage(1);
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value); else params.delete(key);
    router.replace(params.size ? `${pathname}?${params.toString()}` : pathname);
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['treatment-plans-physio', page, dateFrom, dateTo],
    queryFn: () => treatmentPlansApi.getAll({
      page, limit: 24,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    placeholderData: keepPreviousData,
  });
  const plans = (data as any)?.data || [];
  const meta = (data as any)?.meta;

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
        </div>
      ),
    },
    {
      header: 'Seancat',
      accessor: (row) => <span className="text-sm font-medium">{row.completedSessions}/{row.totalSessions}</span>,
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
        <DocumentActions
          onShow={() => router.push(ROUTES.treatmentDetail(row.id))}
          onPrint={() => printTreatmentPlan(row.id)}
          onShare={() => shareTreatmentPlan(row.id, row.patient?.firstName, row.patient?.lastName)}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Kontrollat</h1>
        <p className="text-sm text-muted-foreground">Kontrollat e pacientëve të caktuar për ju</p>
      </div>

      <div className="flex gap-2 w-full sm:w-auto">
        <div className="flex-1 sm:flex-none">
          <label className="text-xs text-muted-foreground block mb-1">Prej</label>
          <ClearableDateInput
            value={dateFrom}
            onChange={(v) => setDateParam('dateFrom', v)}
            onClear={() => setDateParam('dateFrom', '')}
            max={dateTo || undefined}
            className="w-full sm:w-36"
          />
        </div>
        <div className="flex-1 sm:flex-none">
          <label className="text-xs text-muted-foreground block mb-1">Deri</label>
          <ClearableDateInput
            value={dateTo}
            onChange={(v) => setDateParam('dateTo', v)}
            onClear={() => setDateParam('dateTo', '')}
            min={dateFrom || undefined}
            className="w-full sm:w-36"
          />
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
        onRowClick={(row: any) => router.push(`${getPatientDetailPath('PHYSIOTHERAPIST', row.patientId)}?tab=trajtimet`)}
        rowClassName={(row: any) => row.assignedPhysiotherapistId === userId ? ASSIGNED_ROW : undefined}
      />

    </div>
  );
}
