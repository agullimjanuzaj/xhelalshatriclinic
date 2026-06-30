'use client';

import { useState } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { treatmentPlansApi } from '@/lib/api';
import { useSession } from 'next-auth/react';
import { DataTable, Column } from '@/components/ui/data-table';
import { PaymentBadge } from '@/components/ui/payment-badge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getTreatmentTypeLabel } from '@/lib/utils';
import { getPatientDetailPath } from '@/lib/routes';
import { Plus, Pencil } from 'lucide-react';
import { CreatePlanDialog } from '@/components/treatment-plans/create-plan-dialog';
import { DocumentActions } from '@/components/shared/document-actions';
import { showTreatmentPlan, printTreatmentPlan } from '@/lib/invoice';
import { buildTreatmentShareText } from '@/lib/share';

export function ManagerTreatmentsView() {
  const { data: session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [editPlan, setEditPlan] = useState<any>(null);

  const invalidateAfterChange = () => {
    queryClient.invalidateQueries({ queryKey: ['treatment-plans'] });
    queryClient.invalidateQueries({ queryKey: ['payment-debts'] });
    queryClient.invalidateQueries({ queryKey: ['outstanding-balances'] });
    queryClient.invalidateQueries({ queryKey: ['manager-stats'] });
  };

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
        <div className="flex items-center gap-1">
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
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" data-stop-row-click onClick={() => setEditPlan(row)} title="Ndrysho">
            <Pencil size={14} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Kontrollat</h1>
          <p className="text-sm text-muted-foreground">Kontrollat e degës suaj</p>
        </div>
        <Button onClick={() => setShowPlanDialog(true)} className="gap-2 gradient-teal text-white border-0">
          <Plus size={16} />Kontrollë e re
        </Button>
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
    </div>
  );
}
