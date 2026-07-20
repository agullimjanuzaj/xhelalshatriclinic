'use client';

import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { sessionsApi, treatmentPlansApi, patientsApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { TreatmentTypesChecklist } from '@/components/sessions/treatment-types-checklist';
import { GenerateRecommendationButton } from '@/components/sessions/generate-recommendation-button';
import { GenerateSessionNoteButton } from '@/components/sessions/generate-session-note-button';
import { Loader2 } from 'lucide-react';
import { getTreatmentTypeLabel, extractList, extractItem, formatCurrency } from '@/lib/utils';

const NO_PLAN = '__no_plan__';

const schema = z.object({
  treatmentPlanId: z.string().optional(),
  treatmentTypes: z.array(z.string()).default([]),
  amount: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
  recommendations: z.string().optional(),
  status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
});

type FormData = z.infer<typeof schema>;

interface EditSessionDialogProps {
  open: boolean;
  onClose: () => void;
  session: any;
  isAdmin: boolean;
}

export function EditSessionDialog({ open, onClose, session, isAdmin }: EditSessionDialogProps) {
  const queryClient = useQueryClient();
  const { data: authSession } = useSession();
  const patientId: string = session?.patientId || '';

  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ['treatment-plans-for-session', patientId],
    queryFn: () => treatmentPlansApi.getAll({ patientId, limit: 50 }),
    enabled: !!patientId && open,
  });
  const plans = extractList<any>(plansData);
  const activePlans = plans.filter((p: any) => p.completedSessions < p.totalSessions);

  const { data: patientData } = useQuery({
    queryKey: ['patient-branch-lookup-session', patientId],
    queryFn: () => patientsApi.getOne(patientId),
    enabled: !!patientId && open,
  });
  const selectedPatient = extractItem<any>(patientData);

  const defaultValues = useMemo<FormData>(() => ({
    treatmentPlanId: session?.treatmentPlanId || NO_PLAN,
    treatmentTypes: session?.treatmentTypes || [],
    amount: session?.amount != null ? Number(session.amount) : undefined,
    notes: session?.notes || '',
    recommendations: session?.recommendations || '',
    status: session?.status || 'SCHEDULED',
  }), [session]);

  const form = useForm<FormData>({ resolver: zodResolver(schema), defaultValues });
  useEffect(() => { if (open) form.reset(defaultValues); }, [open, defaultValues, form]);

  const selectedPlanId = form.watch('treatmentPlanId');
  const selectedPlan = activePlans.find((p: any) => p.id === selectedPlanId);
  const watchedTypes = form.watch('treatmentTypes') || [];
  const watchedNotes = form.watch('notes') || '';
  const hasNoPlan = !selectedPlanId || selectedPlanId === NO_PLAN;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['sessions'] });
    queryClient.invalidateQueries({ queryKey: ['sessions-physio'] });
    queryClient.invalidateQueries({ queryKey: ['sessions-manager'] });
    queryClient.invalidateQueries({ queryKey: ['treatment-plans'] });
    queryClient.invalidateQueries({ queryKey: ['plan-financials'] });
    queryClient.invalidateQueries({ queryKey: ['patients'] });
    queryClient.invalidateQueries({ queryKey: ['patient'] });
    queryClient.invalidateQueries({ queryKey: ['payment-debts'] });
    queryClient.invalidateQueries({ queryKey: ['outstanding-balances'] });
    queryClient.invalidateQueries({ queryKey: ['report-overview'] });
    queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    queryClient.invalidateQueries({ queryKey: ['manager-stats'] });
    queryClient.invalidateQueries({ queryKey: ['physio-stats'] });
  };

  const mutation = useMutation({
    mutationFn: (d: FormData) => {
      const noPlan = !d.treatmentPlanId || d.treatmentPlanId === NO_PLAN;
      return sessionsApi.update(session.id, {
        // Always send treatmentPlanId so the backend can disconnect it when null
        treatmentPlanId: noPlan ? null : d.treatmentPlanId,
        notes: d.notes || undefined,
        recommendations: d.recommendations || undefined,
        treatmentTypes: d.treatmentTypes,
        amount: noPlan ? d.amount : undefined,
        ...(isAdmin ? { status: d.status } : {}),
      });
    },
    onSuccess: () => {
      toast.success('Seanca u përditësua me sukses!');
      invalidateAll();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ndrysho seancën</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
            {session?.patient && (
              <div>
                <p className="text-sm font-medium mb-1">Pacienti</p>
                <p className="text-sm text-muted-foreground">{session.patient.firstName} {session.patient.lastName}</p>
              </div>
            )}

            <FormField control={form.control} name="treatmentPlanId" render={({ field }) => (
              <FormItem>
                <FormLabel>Plani i trajtimit (opsionale)</FormLabel>
                <Select
                  onValueChange={(v) => {
                    field.onChange(v);
                    const plan = activePlans.find((p: any) => p.id === v);
                    if (plan?.treatmentTypes?.length) form.setValue('treatmentTypes', plan.treatmentTypes);
                  }}
                  value={field.value || NO_PLAN}
                  disabled={plansLoading}
                >
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Zgjidh trajtimin" /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NO_PLAN}>Pa plan trajtimi</SelectItem>
                    {activePlans.map((p: any) => {
                      const typeLabel = p.treatmentTypes?.[0] ? getTreatmentTypeLabel(p.treatmentTypes[0]) : (p.diagnosis || 'Trajtim');
                      return (
                        <SelectItem key={p.id} value={p.id}>
                          {typeLabel} — {p.completedSessions}/{p.totalSessions} të kryera, {p.totalSessions - p.completedSessions} mbetur
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            {selectedPlan && (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
                <p>Seanca <span className="font-semibold">{selectedPlan.completedSessions + 1}</span> nga <span className="font-semibold">{selectedPlan.totalSessions}</span></p>
                <p className="text-muted-foreground">Mbetur: {selectedPlan.totalSessions - selectedPlan.completedSessions} seanca</p>
              </div>
            )}

            {hasNoPlan && (
              <>
                <p className="text-xs text-muted-foreground">Seancë pa plan trajtimi — nuk do të ndikojë në numërimin e seancave të një trajtimi.</p>
                <FormField control={form.control} name="amount" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Çmimi i seancës (€)</FormLabel>
                    <FormControl>
                      <Input
                        type="number" step="0.01" min="0"
                        {...field}
                        value={field.value ?? ''}
                        disabled={!isAdmin}
                      />
                    </FormControl>
                    {!isAdmin && (
                      <p className="text-xs text-muted-foreground">
                        Çmimi i degës {selectedPatient?.branch?.name ? `(${selectedPatient.branch.name})` : ''}: {formatCurrency(field.value ?? 0)}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )} />
              </>
            )}

            <FormField control={form.control} name="treatmentTypes" render={() => (
              <FormItem>
                <FormLabel>Llojet e trajtimit</FormLabel>
                <TreatmentTypesChecklist value={watchedTypes} onChange={(v) => form.setValue('treatmentTypes', v)} />
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>Shënim i shkurtër</FormLabel>
                  <GenerateSessionNoteButton
                    treatmentTypes={watchedTypes}
                    onGenerated={(text) => form.setValue('notes', text)}
                  />
                </div>
                <FormControl><Textarea autoResize rows={2} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="recommendations" render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>Rekomandime</FormLabel>
                  <GenerateRecommendationButton
                    notes={watchedNotes}
                    treatmentTypes={watchedTypes}
                    onGenerated={(text) => form.setValue('recommendations', text)}
                  />
                </div>
                <FormControl><Textarea autoResize rows={3} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {isAdmin && (
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Statusi</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="SCHEDULED">Planifikuar</SelectItem>
                      <SelectItem value="COMPLETED">Kompletuar</SelectItem>
                      <SelectItem value="CANCELLED">Anuluar</SelectItem>
                      <SelectItem value="NO_SHOW">Nuk u paraqit</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Anulo</Button>
              <Button type="submit" disabled={mutation.isPending} className="gradient-teal text-white border-0">
                {mutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
                Ruaj ndryshimet
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
