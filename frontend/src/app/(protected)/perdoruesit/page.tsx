'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { usersApi } from '@/lib/api';
import { DataTable } from '@/components/ui/data-table';
import { SearchInput } from '@/components/ui/search-input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getRoleLabel } from '@/lib/utils';
import { Plus, Edit, Trash2, Power } from 'lucide-react';
import { toast } from 'sonner';
import { UserFormDialog } from '@/components/users/user-form-dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { getDashboardPath } from '@/lib/routes';

const roleColors: Record<string, string> = {
  ADMIN: 'bg-purple-100 text-purple-700 border-purple-200',
  MANAGER: 'bg-blue-100 text-blue-700 border-blue-200',
  PHYSIOTHERAPIST: 'bg-teal-100 text-teal-700 border-teal-200',
};

export default function UsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = session?.user?.role;

  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [editUser, setEditUser] = useState<any>(null);
  const [deleteUser, setDeleteUser] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['users', page, search],
    queryFn: () => usersApi.getAll({ page, limit: 20, search }),
    enabled: role === 'ADMIN',
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => {
      toast.success('Përdoruesi u fshi me sukses');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDeleteUser(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => usersApi.toggleActive(id),
    onSuccess: () => {
      toast.success('Statusi u ndryshua');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (status === 'loading') return <LoadingSkeleton rows={6} />;

  if (role !== 'ADMIN') {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-muted-foreground">Nuk keni qasje në këtë faqe.</p>
        <Button onClick={() => router.push(getDashboardPath(role))}>Kthehu në panel</Button>
      </div>
    );
  }

  const users = (data as any)?.data || [];
  const meta = (data as any)?.meta;

  const columns = [
    {
      header: 'Emri',
      accessor: (row: any) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full gradient-teal flex items-center justify-center text-white text-xs font-bold">
            {row.firstName[0]}{row.lastName[0]}
          </div>
          <div>
            <p className="font-medium text-sm">{row.firstName} {row.lastName}</p>
            <p className="text-xs text-muted-foreground">@{row.username}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Roli',
      accessor: (row: any) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${roleColors[row.role] || ''}`}>
          {getRoleLabel(row.role)}
        </span>
      ),
    },
    {
      header: 'Degët',
      accessor: (row: any) => (
        <div className="flex gap-1 flex-wrap">
          {(row.userBranches || []).map((ub: any) => (
            <Badge key={ub.id} variant="outline" className="text-xs">{ub.branch?.name}</Badge>
          ))}
          {!row.userBranches?.length && <span className="text-muted-foreground text-xs">—</span>}
        </div>
      ),
    },
    {
      header: 'Telefoni',
      accessor: (row: any) => <span className="text-sm">{row.phone || '—'}</span>,
    },
    {
      header: 'Statusi',
      accessor: (row: any) => (
        <Badge variant={row.isActive ? 'default' : 'secondary'}>
          {row.isActive ? 'Aktiv' : 'Joaktiv'}
        </Badge>
      ),
    },
    {
      header: 'Veprimet',
      accessor: (row: any) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => { setEditUser(row); setShowForm(true); }}>
            <Edit size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleMutation.mutate(row.id)}
            title={row.isActive ? 'Çaktivizo' : 'Aktivizo'}
          >
            <Power size={14} className={row.isActive ? 'text-green-500' : 'text-muted-foreground'} />
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteUser(row)}>
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
          <h1 className="text-xl font-bold text-foreground">Përdoruesit</h1>
          <p className="text-sm text-muted-foreground">{meta?.total ?? 0} përdorues gjithsej</p>
        </div>
        <Button onClick={() => { setEditUser(null); setShowForm(true); }} className="gap-2 gradient-teal text-white border-0">
          <Plus size={16} />Përdorues i ri
        </Button>
      </div>

      <SearchInput placeholder="Kërko sipas emrit, mbiemrit ose username..." onChange={setSearch} className="w-full max-w-xs" />

      <DataTable
        columns={columns}
        data={users}
        isLoading={isLoading}
        pagination={meta}
        onPageChange={setPage}
        emptyMessage="Nuk ka përdorues"
      />

      {showForm && (
        <UserFormDialog
          user={editUser}
          open={showForm}
          onClose={() => { setShowForm(false); setEditUser(null); }}
          onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['users'] }); setShowForm(false); }}
        />
      )}

      <AlertDialog open={!!deleteUser} onOpenChange={() => setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fshi përdoruesin?</AlertDialogTitle>
            <AlertDialogDescription>
              Jeni të sigurt që doni të fshini {deleteUser?.firstName} {deleteUser?.lastName}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anulo</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate(deleteUser.id)}
            >
              Fshi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
