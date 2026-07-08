'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { paymentsApi } from '@/lib/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { PaymentBadge } from '@/components/ui/payment-badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { CreditCard } from 'lucide-react';
import { getPatientDetailPath } from '@/lib/routes';

interface DebtsTableProps {
  branchId?: string;
  onRegisterPayment: (patientId: string, planId: string | null, sessionId?: string) => void;
}

export function DebtsTable({ branchId, onRegisterPayment }: DebtsTableProps) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [branchId]);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['payment-debts', branchId, page],
    queryFn: () => paymentsApi.getDebts(branchId, page, 24),
  });
  const debts = (data as any)?.data || [];
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
    { header: 'Dega', accessor: (row) => <span className="text-sm">{row.branch?.name || '—'}</span> },
    { header: 'Totali i trajtimit', accessor: (row) => <span className="text-sm">{formatCurrency(row.totalTreatmentValue)}</span> },
    { header: 'Vlera e kryer', accessor: (row) => <span className="text-sm">{formatCurrency(row.currentEarnedAmount)}</span> },
    { header: 'Paguar', accessor: (row) => <span className="text-sm text-green-600">{formatCurrency(row.totalPaidAmount)}</span> },
    { header: 'Borxhi aktual', accessor: (row) => <span className="font-semibold text-sm text-red-600">{formatCurrency(row.currentDebt)}</span> },
    { header: 'Balanca finale', accessor: (row) => <span className="text-sm">{formatCurrency(row.finalRemainingBalance)}</span> },
    { header: 'Statusi', accessor: (row) => <PaymentBadge status={row.paymentStatus} /> },
    { header: 'Pagesa e fundit', accessor: (row) => <span className="text-sm text-muted-foreground">{row.lastPaymentAt ? formatDate(row.lastPaymentAt) : '—'}</span> },
    {
      header: 'Veprimet',
      accessor: (row) => (
        <div data-stop-row-click>
          <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => onRegisterPayment(row.patient.id, row.planId, row.sessionId || undefined)}>
            <CreditCard size={13} />Regjistro pagesë
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={debts}
      isLoading={isLoading}
      isError={isError}
      errorMessage={(error as Error)?.message}
      emptyMessage="Nuk ka borxhe të hapura"
      onRowClick={(row: any) => router.push(`${getPatientDetailPath('ADMIN', row.patient.id)}?tab=borxhet`)}
      pagination={meta}
      onPageChange={setPage}
    />
  );
}
