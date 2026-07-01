'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { branchesApi } from '@/lib/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, MapPin, Users, Building2, Loader2 } from 'lucide-react';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { getDashboardPath } from '@/lib/routes';

const schema = z.object({
  name: z.string().min(2, 'Emri duhet të ketë minimum 2 karaktere'),
  city: z.string().min(2, 'Qyteti është i detyrueshëm'),
  address: z.string().min(5, 'Adresa duhet të ketë minimum 5 karaktere'),
  phone: z.string().optional(),
  sessionPrice: z.coerce.number().min(0, 'Duhet të jetë 0 ose më shumë'),
});

type FormData = z.infer<typeof schema>;

export default function BranchesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = session?.user?.role;

  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchesApi.getAll(),
    enabled: role === 'ADMIN',
  });
  const branches = (data as any)?.data || [];

  const form = useForm<FormData>({ resolver: zodResolver(schema) });

  const createMutation = useMutation({
    mutationFn: (d: FormData) => branchesApi.create(d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['branches'] }); setDialogOpen(false); form.reset(); toast.success('Dega u krijua me sukses!'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: FormData }) => branchesApi.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['branches'] }); setDialogOpen(false); setEditItem(null); form.reset(); toast.success('Dega u përditësua!'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => branchesApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['branches'] }); setDeleteId(null); toast.success('Dega u fshi!'); },
    onError: (e: Error) => toast.error(e.message),
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

  const openCreate = () => { setEditItem(null); form.reset({ name: '', city: '', address: '', phone: '', sessionPrice: 20 }); setDialogOpen(true); };
  const openEdit = (item: any) => {
    setEditItem(item);
    form.reset({
      name: item.name, city: item.city, address: item.address, phone: item.phone || '',
      sessionPrice: Number(item.sessionPrice ?? 20),
    });
    setDialogOpen(true);
  };

  const onSubmit = (d: FormData) => {
    if (editItem) updateMutation.mutate({ id: editItem.id, data: d });
    else createMutation.mutate(d);
  };

  const columns: Column<any>[] = [
    {
      header: 'Dega',
      accessor: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl gradient-teal flex items-center justify-center flex-shrink-0">
            <Building2 size={16} className="text-white" />
          </div>
          <div>
            <p className="font-medium text-sm">{row.name}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin size={10} /> {row.city}
            </p>
          </div>
        </div>
      ),
    },
    { header: 'Adresa', accessor: (row) => <span className="text-sm text-muted-foreground">{row.address}</span> },
    { header: 'Telefoni', accessor: (row) => row.phone || '—' },
    {
      header: 'Çmimi/trajtim',
      accessor: (row) => <span className="text-sm">{Number(row.sessionPrice ?? 20).toFixed(0)}€</span>,
    },
    {
      header: 'Stafi',
      accessor: (row) => (
        <Badge variant="secondary" className="gap-1">
          <Users size={10} /> {row._count?.userBranches || 0}
        </Badge>
      ),
    },
    {
      header: 'Pacientët',
      accessor: (row) => (
        <Badge variant="outline">{row._count?.patients || 0}</Badge>
      ),
    },
    {
      header: 'Veprimet',
      accessor: (row) => (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
            <Edit size={14} />
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(row.id)}>
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
          <h1 className="text-xl font-bold">Degët</h1>
          <p className="text-sm text-muted-foreground">Menaxho degët e klinikës</p>
        </div>
        <Button onClick={openCreate} className="gradient-teal text-white border-0 gap-2">
          <Plus size={16} /> Shto degë
        </Button>
      </div>

      {/* Stats — responsive: 1 col on mobile, 3 on lg */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {branches.map((b: any) => (
          <Card key={b.id} className="card-hover">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl gradient-teal flex items-center justify-center flex-shrink-0">
                  <Building2 size={18} className="text-white" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{b.name}</p>
                  <p className="text-xs text-muted-foreground">{b.city}</p>
                </div>
              </div>
              <div className="flex gap-6 mt-3 pt-3 border-t">
                <div>
                  <p className="text-lg font-bold text-teal-600">{b._count?.userBranches || 0}</p>
                  <p className="text-xs text-muted-foreground">Staf</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-blue-600">{b._count?.patients || 0}</p>
                  <p className="text-xs text-muted-foreground">Pacientë</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <DataTable columns={columns} data={branches} isLoading={isLoading} emptyMessage="Nuk ka degë" />

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? 'Ndrysho degën' : 'Shto degë të re'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Emri i degës</FormLabel>
                    <FormControl><Input placeholder="Prishtina" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="city" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Qyteti</FormLabel>
                    <FormControl><Input placeholder="Prishtina" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="address" render={({ field }) => (
                <FormItem>
                  <FormLabel>Adresa</FormLabel>
                  <FormControl><Input placeholder="Rruga, Nr." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefoni</FormLabel>
                  <FormControl><Input placeholder="+383 4X XXX XXX" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="sessionPrice" render={({ field }) => (
                <FormItem>
                  <FormLabel>Çmimi për trajtim/seancë (€)</FormLabel>
                  <FormControl><Input type="number" step="0.01" min="0" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Anulo</Button>
                <Button type="submit" className="gradient-teal text-white border-0" disabled={createMutation.isPending || updateMutation.isPending}>
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 size={14} className="mr-2 animate-spin" />}
                  {editItem ? 'Ruaj ndryshimet' : 'Krijo degën'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Alert */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fshi degën</AlertDialogTitle>
            <AlertDialogDescription>Jeni i sigurt që dëshironi të fshini këtë degë? Ky veprim nuk mund të kthehet prapa.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anulo</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Fshi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
