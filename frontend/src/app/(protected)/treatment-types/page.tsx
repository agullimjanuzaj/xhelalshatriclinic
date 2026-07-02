'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { treatmentTypesApi } from '@/lib/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Loader2 } from 'lucide-react';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { getDashboardPath } from '@/lib/routes';
import { extractList } from '@/lib/utils';

const schema = z.object({
  name: z.string().min(2, 'Emri duhet të ketë minimum 2 karaktere'),
  description: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function TreatmentTypesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = session?.user?.role;

  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<any>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['treatment-types'],
    queryFn: () => treatmentTypesApi.getAll(),
    enabled: role === 'ADMIN',
  });
  const types = extractList<{ id: string; name: string; description?: string; isActive: boolean }>(data);

  const form = useForm<FormData>({ resolver: zodResolver(schema) });

  // Invalidate every query keyed off 'treatment-types' (covers both this
  // page's ['treatment-types'] list and the create/edit dialog's
  // ['treatment-types', 'active'] options list), plus the plans that embed
  // type names so any renamed/deactivated type is reflected everywhere.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['treatment-types'] });
    queryClient.invalidateQueries({ queryKey: ['treatment-plans'] });
  };

  const createMutation = useMutation({
    mutationFn: (d: FormData) => treatmentTypesApi.create(d),
    onSuccess: () => { invalidate(); setDialogOpen(false); form.reset(); toast.success('Lloji i trajtimit u shtua!'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<FormData> & { isActive?: boolean } }) => treatmentTypesApi.update(id, data),
    onSuccess: () => { invalidate(); setDialogOpen(false); setEditItem(null); form.reset(); toast.success('Lloji i trajtimit u përditësua!'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => treatmentTypesApi.delete(id),
    onSuccess: () => { invalidate(); setDeleteId(null); toast.success('Lloji i trajtimit u fshi!'); },
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

  const openCreate = () => { setEditItem(null); form.reset({ name: '', description: '' }); setDialogOpen(true); };
  const openEdit = (item: any) => { setEditItem(item); form.reset({ name: item.name, description: item.description || '' }); setDialogOpen(true); };

  const onSubmit = (d: FormData) => {
    if (editItem) updateMutation.mutate({ id: editItem.id, data: d });
    else createMutation.mutate(d);
  };

  const columns: Column<any>[] = [
    { header: 'Emri', accessor: (row) => <span className="font-medium text-sm">{row.name}</span> },
    { header: 'Përshkrimi', accessor: (row) => <span className="text-sm text-muted-foreground">{row.description || '—'}</span> },
    {
      header: 'Statusi',
      accessor: (row) => (
        <div className="flex items-center gap-2">
          <Switch
            checked={row.isActive}
            onCheckedChange={(checked) => updateMutation.mutate({ id: row.id, data: { isActive: checked } })}
          />
          <Badge variant={row.isActive ? 'default' : 'secondary'}>{row.isActive ? 'Aktiv' : 'Joaktiv'}</Badge>
        </div>
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Llojet e Trajtimeve</h1>
          <p className="text-sm text-muted-foreground">Menaxho llojet e trajtimit të disponueshme në klinikë</p>
        </div>
        <Button onClick={openCreate} className="gradient-teal text-white border-0 gap-2 w-full sm:w-auto">
          <Plus size={16} /> Shto lloj trajtimi
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={types}
        isLoading={isLoading}
        isError={isError}
        errorMessage={(error as Error)?.message}
        emptyMessage="Nuk ka lloje trajtimi"
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? 'Ndrysho llojin e trajtimit' : 'Lloj i ri trajtimi'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Emri</FormLabel>
                  <FormControl><Input placeholder="Terapi Manuale" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Përshkrimi</FormLabel>
                  <FormControl><Textarea placeholder="Përshkrim opsional..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Anulo</Button>
                <Button type="submit" className="gradient-teal text-white border-0" disabled={createMutation.isPending || updateMutation.isPending}>
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 size={14} className="mr-2 animate-spin" />}
                  {editItem ? 'Ruaj ndryshimet' : 'Krijo'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fshi llojin e trajtimit</AlertDialogTitle>
            <AlertDialogDescription>Jeni i sigurt që dëshironi të fshini këtë lloj trajtimi? Ky veprim nuk mund të kthehet prapa.</AlertDialogDescription>
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
