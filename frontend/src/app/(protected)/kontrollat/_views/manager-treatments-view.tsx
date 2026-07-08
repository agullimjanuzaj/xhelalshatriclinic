'use client';

import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { treatmentPlansApi } from '@/lib/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { PaymentBadge } from '@/components/ui/payment-badge';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ClearableDateInput } from '@/components/ui/clearable-date-input';
import { getTreatmentTypeLabel, formatDate } from '@/lib/utils';
import { Search } from 'lucide-react';
import { getPatientDetailPath, ROUTES } from '@/lib/routes';
import { DocumentActions } from '@/components/shared/document-actions';
import { printTreatmentPlan, shareTreatmentPlan } from '@/lib/invoice';

export function ManagerTreatmentsView() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [page, setPage] = useState(1);

  const branchId = session?.user?.userBranches?.[0]?.branchId;
  const [search, setSearch] = useState('');
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo = searchParams.get('dateTo') || '';

  const setDateParam = (key: 'dateFrom' | 'dateTo', value: string) => {
    setPage(1);
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value); else params.delete(key);
    router.replace(params.size ? `${pathname}?${params.toString()}` : pathname);
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['treatment-plans', page, branchId, search, dateFrom, dateTo],
    queryFn: () => treatmentPlansApi.getAll({
      page, limit: 24,
      branchId,
      search: search || undefined,
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
        <p className="text-sm text-muted-foreground">Kontrollat e degës suaj</p>
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
        <div className="flex gap-2 w-full sm:w-auto md:w-auto">
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
        onRowClick={(row: any) => router.push(`${getPatientDetailPath('MANAGER', row.patientId)}?tab=trajtimet`)}
      />

    </div>
  );
}
