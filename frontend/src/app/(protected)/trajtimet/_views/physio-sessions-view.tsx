'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { sessionsApi } from '@/lib/api';
import { useSession } from 'next-auth/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DataTable, Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SessionBadge } from '@/components/ui/session-badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import { CheckCircle, CheckCircle2, Calendar, Loader2, Plus, Pencil, Trash2, X } from 'lucide-react';
import { CreateSessionDialog } from '@/components/sessions/create-session-dialog';
import { EditSessionDialog } from '@/components/sessions/edit-session-dialog';
import { TreatmentTypesChecklist } from '@/components/sessions/treatment-types-checklist';
import { GenerateRecommendationButton } from '@/components/sessions/generate-recommendation-button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DocumentActions } from '@/components/shared/document-actions';
import { showSessionReport, printSessionReport } from '@/lib/invoice';
import { buildSessionShareText } from '@/lib/share';

const completeSchema = z.object({
  notes: z.string().optional(),
  treatmentTypes: z.array(z.string()).default([]),
  recommendations: z.string().optional(),
});

type CompleteFormData = z.infer<typeof completeSchema>;
const completeDefaults: CompleteFormData = { notes: '', treatmentTypes: [], recommendations: '' };

export function PhysioSessionsView() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo = searchParams.get('dateTo') || '';
  const [page, setPage] = useState(1);
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editSession, setEditSession] = useState<any>(null);
  const [deleteSession, setDeleteSession] = useState<any>(null);

  const setDateParam = (key: 'dateFrom' | 'dateTo', value: string) => {
    setPage(1);
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value); else params.delete(key);
    router.replace(params.size ? `${pathname}?${params.toString()}` : pathname);
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['sessions-physio', page, dateFrom, dateTo, session?.user?.id],
    queryFn: () => sessionsApi.getAll({
      page, limit: 24, physiotherapistId: session?.user?.id,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo ? `${dateTo}T23:59:59` : undefined,
    }),
    enabled: !!session?.user?.id,
    placeholderData: keepPreviousData,
  });
  const sessions = (data as any)?.data || [];
  const meta = (data as any)?.meta;

  const form = useForm<CompleteFormData>({ resolver: zodResolver(completeSchema), defaultValues: completeDefaults });
  const watchedCompleteTypes = form.watch('treatmentTypes') || [];
  const watchedCompleteNotes = form.watch('notes') || '';

  const completeMutation = useMutation({
    mutationFn: ({ id, ...d }: { id: string } & CompleteFormData) => sessionsApi.complete(id, {
      notes: d.notes || undefined,
      treatmentTypes: d.treatmentTypes,
      recommendations: d.recommendations || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions-physio'] });
      setCompleteId(null);
      form.reset(completeDefaults);
      toast.success('Trajtimi u kompletua me sukses!');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => sessionsApi.delete(id),
    onSuccess: () => {
      toast.success('Trajtimi u fshi me sukses');
      setDeleteSession(null);
      queryClient.invalidateQueries({ queryKey: ['sessions-physio'] });
      queryClient.invalidateQueries({ queryKey: ['treatment-plans-physio'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns: Column<any>[] = [
    {
      header: 'Pacienti',
      accessor: (row) => (
        <div>
          <p className="font-medium text-sm">
            {row.patient?.firstName} {row.patient?.lastName}
          </p>
          <p className="text-xs text-muted-foreground">{row.sessionNumber ? `Trajtimi #${row.sessionNumber}` : 'Pa plan kontrolle'}</p>
        </div>
      ),
    },
    {
      header: 'Data',
      accessor: (row) => (
        <div className="flex items-center gap-2 text-sm">
          <Calendar size={14} className="text-muted-foreground" />
          {formatDate(row.scheduledAt || row.completedAt || row.createdAt)}
        </div>
      ),
    },
    { header: 'Statusi', accessor: (row) => <SessionBadge status={row.status} /> },
    {
      header: 'Paguar',
      accessor: (row) =>
        row.isPaid ? (
          <CheckCircle2 size={18} className="text-green-500" />
        ) : (
          <span className="h-2.5 w-2.5 rounded-full bg-red-500 inline-block" title="Papaguar" />
        ),
    },
    {
      header: 'Veprimet',
      accessor: (row) => (
        <div className="flex items-center gap-1">
          {row.status === 'SCHEDULED' && (
            <Button size="sm" className="gradient-teal text-white border-0 gap-1 h-8" onClick={() => { form.reset(completeDefaults); setCompleteId(row.id); }}>
              <CheckCircle size={12} />
              Kompletoje
            </Button>
          )}
          <DocumentActions
            onShow={() => showSessionReport(row.id)}
            onPrint={() => printSessionReport(row.id)}
            shareText={buildSessionShareText({
              patientName: `${row.patient?.firstName || ''} ${row.patient?.lastName || ''}`.trim(),
              sessionNumber: row.sessionNumber,
              totalSessions: row.treatmentPlan?.totalSessions,
              date: row.scheduledAt || row.completedAt || row.createdAt,
              physiotherapistName: (row.physiotherapist || row.completedByUser)
                ? `${(row.physiotherapist || row.completedByUser).firstName} ${(row.physiotherapist || row.completedByUser).lastName}`
                : undefined,
              treatmentTypes: row.treatmentTypes,
              notes: row.notes,
              recommendations: row.recommendations,
            })}
          />
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setEditSession(row)} title="Ndrysho">
            <Pencil size={14} />
          </Button>
          {!row.paymentId && (
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:text-red-600" onClick={() => setDeleteSession(row)} title="Fshi">
              <Trash2 size={14} />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Trajtimet e mia</h1>
          <p className="text-sm text-muted-foreground">Trajtimet e caktuara për ju</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2 gradient-teal text-white border-0 self-start sm:self-auto">
          <Plus size={16} />Trajtim i ri
        </Button>
      </div>

      {/* Date range filters — stacked on mobile */}
      <div className="flex gap-2 w-full sm:w-auto">
        <div className="flex-1 sm:flex-none">
          <label className="text-xs text-muted-foreground block mb-1">Prej</label>
          <div className="flex items-center gap-1">
            <Input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setDateParam('dateFrom', e.target.value)}
              className="w-full sm:w-36"
            />
            {dateFrom && (
              <button type="button" title="Pastro" onClick={() => setDateParam('dateFrom', '')}
                className="h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted">
                <X size={13} />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 sm:flex-none">
          <label className="text-xs text-muted-foreground block mb-1">Deri</label>
          <div className="flex items-center gap-1">
            <Input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateParam('dateTo', e.target.value)}
              className="w-full sm:w-36"
            />
            {dateTo && (
              <button type="button" title="Pastro" onClick={() => setDateParam('dateTo', '')}
                className="h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted">
                <X size={13} />
              </button>
            )}
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
        data={sessions}
        isLoading={isLoading}
        isError={isError}
        errorMessage={(error as Error)?.message}
        pagination={meta}
        onPageChange={setPage}
        emptyMessage="Nuk ka trajtime"
      />

      <Dialog open={!!completeId} onOpenChange={(open) => !open && setCompleteId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Kompletoni trajtimin</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((d) => completeId && completeMutation.mutate({ id: completeId, ...d }))}
              className="space-y-4"
            >
              <FormField control={form.control} name="treatmentTypes" render={() => (
                <FormItem>
                  <FormLabel>Llojet e trajtimit</FormLabel>
                  <TreatmentTypesChecklist value={watchedCompleteTypes} onChange={(v) => form.setValue('treatmentTypes', v)} />
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Shënim i shkurtër</FormLabel>
                  <FormControl><Textarea placeholder="Si shkoi trajtimi..." rows={2} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="recommendations" render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Rekomandime</FormLabel>
                    <GenerateRecommendationButton
                      notes={watchedCompleteNotes}
                      treatmentTypes={watchedCompleteTypes}
                      onGenerated={(text) => form.setValue('recommendations', text)}
                    />
                  </div>
                  <FormControl><Textarea placeholder="Rekomandime pas trajtimit..." rows={3} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCompleteId(null)}>Anulo</Button>
                <Button type="submit" disabled={completeMutation.isPending} className="gradient-teal text-white border-0">
                  {completeMutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
                  Kompletoje
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {showCreate && (
        <CreateSessionDialog open={showCreate} onClose={() => setShowCreate(false)} />
      )}

      {editSession && (
        <EditSessionDialog open={!!editSession} session={editSession} isAdmin={false} onClose={() => setEditSession(null)} />
      )}

      <ConfirmDialog
        open={!!deleteSession}
        onOpenChange={(open) => !open && setDeleteSession(null)}
        title="Fshi trajtimin?"
        description="A jeni i sigurt që dëshironi ta fshini këtë trajtim?"
        onConfirm={() => deleteSession && deleteMutation.mutate(deleteSession.id)}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
