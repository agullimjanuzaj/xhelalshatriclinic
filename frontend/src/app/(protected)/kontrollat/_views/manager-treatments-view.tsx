'use client';

import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { treatmentPlansApi } from '@/lib/api';
import { useSession } from 'next-auth/react';
import { DataTable, Column } from '@/components/ui/data-table';
import { PaymentBadge } from '@/components/ui/payment-badge';
import { Badge } from '@/components/ui/badge';
import { getTreatmentTypeLabel } from '@/lib/utils';
import { getPatientDetailPath } from '@/lib/routes';
import { DocumentActions } from '@/components/shared/document-actions';
import { showTreatmentPlan, printTreatmentPlan, shareTreatmentPlan } from '@/lib/invoice';

export function ManagerTreatmentsView() {
  const { data: session } = useSession();
  const router = useRouter();
  const [page, setPage] = useState(1);

  const branchId = session?.user?.userBranches?.[0]?.branchId;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['treatment-plans', page, branchId],
    queryFn: () => treatmentPlansApi.getAll({ page, limit: 24, branchId }),
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
    { header: 'Seancat', accessor: (row) => <span className="text-sm font-medium">{row.completedSessions}/{row.totalSessions}</span> },
    { header: 'Pagesa', accessor: (row) => <PaymentBadge status={row.paymentStatus} /> },
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
          onShare={() => shareTreatmentPlan(row.id, row.patient?.firstName, row.patient?.lastName)}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Kontrollat</h1>
        <p className="text-sm text-muted-foreground">Kontrollat e degës suaj</p>
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
        onRowClick={(row: any) => router.push(`${getPatientDetailPath('MANAGER', row.patientId)}?tab=trajtimet`)}
      />
    </div>
  );
}
