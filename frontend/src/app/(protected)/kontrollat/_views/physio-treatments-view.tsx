'use client';

import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { treatmentPlansApi } from '@/lib/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { getTreatmentTypeLabel } from '@/lib/utils';
import { getPatientDetailPath } from '@/lib/routes';
import { Badge } from '@/components/ui/badge';
import { DocumentActions } from '@/components/shared/document-actions';
import { showTreatmentPlan, printTreatmentPlan } from '@/lib/invoice';
import { buildTreatmentShareText } from '@/lib/share';

export function PhysioTreatmentsView() {
  const router = useRouter();
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['treatment-plans-physio', page],
    queryFn: () => treatmentPlansApi.getAll({ page, limit: 24 }),
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
          onShow={() => showTreatmentPlan(row.id)}
          onPrint={() => printTreatmentPlan(row.id)}
          shareText={buildTreatmentShareText({
            patientName: `${row.patient?.firstName || ''} ${row.patient?.lastName || ''}`.trim(),
            diagnosis: row.diagnosis,
            treatmentTypes: row.treatmentTypes,
            totalSessions: row.totalSessions,
            completedSessions: row.completedSessions,
            totalTreatmentValue: Number(row.totalAmount),
            totalPaidAmount: Number(row.amountPaid),
            currentDebt: Math.max(0, Number(row.totalAmount) - Number(row.amountPaid)),
          })}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Kontrollat</h1>
        <p className="text-sm text-muted-foreground">Kontrollat e pacientëve të caktuar për ju</p>
      </div>

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
      />
    </div>
  );
}
