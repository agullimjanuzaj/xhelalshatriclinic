'use client';

import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { patientsApi } from '@/lib/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatDate, getGenderLabel } from '@/lib/utils';
import { Search, Phone } from 'lucide-react';
import { getPatientDetailPath } from '@/lib/routes';

const ASSIGNED_ROW = 'border-l-[3px] border-l-teal-500 bg-teal-50/40 dark:bg-teal-950/20';

export function PhysioPatientsView() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['patients-physio', page, search],
    queryFn: () => patientsApi.getAll({ page, limit: 24, search: search || undefined }),
    placeholderData: keepPreviousData,
  });
  const patients = (data as any)?.data || [];
  const meta = (data as any)?.meta;

  const columns: Column<any>[] = [
    {
      header: 'Pacienti',
      accessor: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl gradient-teal flex items-center justify-center text-white text-sm font-bold">
            {row.firstName?.[0]}{row.lastName?.[0]}
          </div>
          <div>
            <p className="font-medium text-sm">{row.firstName} {row.lastName}</p>
            <p className="text-xs text-muted-foreground">{formatDate(row.birthDate)}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Kontakti',
      accessor: (row) => (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Phone size={12} />
          {row.phone}
        </div>
      ),
    },
    {
      header: 'Gjinia',
      accessor: (row) => <Badge variant="outline">{getGenderLabel(row.gender)}</Badge>,
    },
    {
      header: 'Planet aktive',
      accessor: (row) => (
        <Badge variant={row._count?.treatmentPlans > 0 ? 'default' : 'secondary'}>
          {row._count?.treatmentPlans || 0} plan
        </Badge>
      ),
    },
    {
      header: 'Dega',
      accessor: (row) => <span className="text-sm text-muted-foreground">{row.branch?.name || '—'}</span>,
    },
    {
      header: 'Aktiv në klinikë',
      accessor: (row) => row.activeInClinic
        ? <Badge className="bg-teal-100 text-teal-700 border-teal-200">Aktiv</Badge>
        : <span className="text-xs text-muted-foreground">—</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Pacientët</h1>
      </div>

      <div className="relative max-w-xs">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Kërko pacient..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="pl-9"
        />
      </div>

      <DataTable
        columns={columns}
        data={patients}
        isLoading={isLoading}
        pagination={meta}
        onPageChange={setPage}
        emptyMessage="Nuk ka pacientë"
        onRowClick={(row: any) => router.push(getPatientDetailPath('PHYSIOTHERAPIST', row.id))}
        rowClassName={(row: any) => row.hasMyPlan ? ASSIGNED_ROW : undefined}
      />
    </div>
  );
}
