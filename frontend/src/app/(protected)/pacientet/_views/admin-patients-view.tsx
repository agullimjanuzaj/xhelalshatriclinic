'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { patientsApi, branchesApi } from '@/lib/api';
import { DataTable } from '@/components/ui/data-table';
import { SearchInput } from '@/components/ui/search-input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDate, getGenderLabel, formatActiveUntil } from '@/lib/utils';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PatientFormDialog } from '@/components/patients/patient-form-dialog';
import { PatientStatusBadge } from '@/components/ui/patient-status-badge';
import { getPatientDetailPath } from '@/lib/routes';

const ALL = '__all__';

export function AdminPatientsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [branchId, setBranchId] = useState('');
  const [activeInClinic, setActiveInClinic] = useState(searchParams.get('activeInClinic') || '');
  const [status, setStatus] = useState('');
  const [editPatient, setEditPatient] = useState<any>(null);
  const [deletePatient, setDeletePatient] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: branchesData } = useQuery({ queryKey: ['branches'], queryFn: () => branchesApi.getAll(), staleTime: 5 * 60_000 });
  const branches = (branchesData as any)?.data || [];

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['patients', page, search, branchId, activeInClinic, status],
    queryFn: () => patientsApi.getAll({
      page, limit: 24, search,
      branchId: branchId || undefined,
      activeInClinic: activeInClinic || undefined,
      status: status || undefined,
    }),
    placeholderData: keepPreviousData,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => patientsApi.delete(id),
    onSuccess: () => {
      toast.success('Pacienti u fshi me sukses');
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      setDeletePatient(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) => patientsApi.setActiveInClinic(id, value),
    onSuccess: (res: any) => {
      const p = res?.data;
      if (p?.activeInClinic && p.activeInClinicSince && p.activeInClinicExpiresAt) {
        const hours = Math.round((new Date(p.activeInClinicExpiresAt).getTime() - new Date(p.activeInClinicSince).getTime()) / 3_600_000);
        toast.success(`Pacienti u shënua aktiv në klinikë për ${hours} orë.`);
      }
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const patients = (data as any)?.data || [];
  const meta = (data as any)?.meta;

  const columns = [
    {
      header: 'Emri dhe Mbiemri',
      accessor: (row: any) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full gradient-teal flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {row.firstName[0]}{row.lastName[0]}
          </div>
          <div>
            <p className="font-medium text-sm">{row.firstName} {row.lastName}</p>
            <p className="text-xs text-muted-foreground">{row.phone}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Dega',
      accessor: (row: any) => (
        <Badge variant="outline">{row.branch?.name}</Badge>
      ),
    },
    {
      header: 'Gjinia',
      accessor: (row: any) => <span className="text-sm">{getGenderLabel(row.gender)}</span>,
    },
    {
      header: 'Data e lindjes',
      accessor: (row: any) => <span className="text-sm">{formatDate(row.birthDate)}</span>,
    },
    {
      header: 'Seancat',
      accessor: (row: any) => (
        <span className="text-sm font-medium">{row._count?.sessions ?? 0}</span>
      ),
    },
    {
      header: 'Statusi',
      accessor: (row: any) => <PatientStatusBadge status={row.status} />,
    },
    {
      header: 'Aktiv në klinikë',
      accessor: (row: any) => (
        <div data-stop-row-click className="flex items-center gap-2">
          <Switch
            checked={row.activeInClinic}
            onCheckedChange={(v) => toggleActiveMutation.mutate({ id: row.id, value: v })}
          />
          {row.activeInClinic && row.activeInClinicExpiresAt && (
            <span className="text-xs text-muted-foreground">{formatActiveUntil(row.activeInClinicExpiresAt)}</span>
          )}
        </div>
      ),
    },
    {
      header: 'Veprimet',
      accessor: (row: any) => (
        <div className="flex items-center gap-1" data-stop-row-click>
          <Button variant="ghost" size="sm" onClick={() => { setEditPatient(row); setShowForm(true); }}>
            <Edit size={14} />
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeletePatient(row)}>
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Pacientët</h1>
          <p className="text-sm text-muted-foreground">{meta?.total ?? 0} pacientë gjithsej</p>
        </div>
        <Button onClick={() => { setEditPatient(null); setShowForm(true); }} className="gap-2 gradient-teal text-white border-0">
          <Plus size={16} />Pacient i ri
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <SearchInput
          placeholder="Kërko pacientë..."
          onChange={(v) => { setSearch(v); setPage(1); }}
          className="w-full max-w-xs"
        />
        <Select value={branchId || ALL} onValueChange={(v) => { setBranchId(v === ALL ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Dega" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Të gjitha degët</SelectItem>
            {branches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={activeInClinic || ALL} onValueChange={(v) => { setActiveInClinic(v === ALL ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Aktiv në klinikë" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Të gjithë</SelectItem>
            <SelectItem value="true">Aktivë në klinikë</SelectItem>
            <SelectItem value="false">Jo aktivë</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status || ALL} onValueChange={(v) => { setStatus(v === ALL ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Statusi" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Të gjitha statuset</SelectItem>
            <SelectItem value="IN_TREATMENT">Në trajtim</SelectItem>
            <SelectItem value="COMPLETED">I përfunduar</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={patients}
        isLoading={isLoading}
        isError={isError}
        errorMessage={(error as Error)?.message}
        pagination={meta}
        onPageChange={setPage}
        emptyMessage="Nuk ka pacientë"
        onRowClick={(row: any) => router.push(getPatientDetailPath('ADMIN', row.id))}
      />

      {/* Patient Form Dialog */}
      {showForm && (
        <PatientFormDialog
          patient={editPatient}
          open={showForm}
          onClose={() => { setShowForm(false); setEditPatient(null); }}
          onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['patients'] }); setShowForm(false); }}
        />
      )}

      <ConfirmDialog
        open={!!deletePatient}
        onOpenChange={(open) => !open && setDeletePatient(null)}
        title="Fshi pacientin?"
        description={`Jeni të sigurt që doni të fshini ${deletePatient?.firstName} ${deletePatient?.lastName}? Ky veprim nuk mund të zhbëhet.`}
        onConfirm={() => deletePatient && deleteMutation.mutate(deletePatient.id)}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
