'use client';

import { useEffect, useMemo, useRef } from 'react';
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
  priceReason: z.string().optional(),
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
  const canEditPrice = isAdmin; // Manager uses the dedicated mark-free action instead

  // Track amount before "Pa pagesë" toggle so we can restore it on untoggle
  const previousAmount = useRef<number | undefined>(
    session?.amount != null ? Number(session.amount) : undefined,
  );

  // Total already allocated to this session (for credit-release warning)
  const existingAllocations = useMemo(() => {
    if (!session?.paymentAllocations) return 0;
    return (session.paymentAllocations as any[]).reduce((s: number, a: any) => s + Number(a.amount), 0);
  }, [session]);

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
    priceReason: '',
    notes: session?.notes || '',
    recommendations: session?.recommendations || '',
    status: session?.status || 'SCHEDULED',
  }), [session]);

  const form = useForm<FormData>({ resolver: zodResolver(schema), defaultValues });
  useEffect(() => {
    if (open) {
      form.reset(defaultValues);
      previousAmount.current = session?.amount != null ? Number(session.amount) : undefined;
    }
  }, [open, defaultValues, form, session]);

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
    mutationFn: async (d: FormData) => {
      const noPlan = !d.treatmentPlanId || d.treatmentPlanId === NO_PLAN;
      const originalAmount = session?.amount != null ? Number(session.amount) : undefined;
      const priceChanged = canEditPrice && d.amount !== undefined && d.amount !== originalAmount;

      // Price changes (for admin/manager) go through the dedicated endpoint
      // which handles allocation release and credit return atomically.
      if (priceChanged) {
        await sessionsApi.updatePrice(session.id, {
          amount: d.amount!,
          ...(d.priceReason ? { reason: d.priceReason } : {}),
        });
      }

      // Regular update for all other fields (never send amount here)
      return sessionsApi.update(session.id, {
        treatmentPlanId: noPlan ? null : d.treatmentPlanId,
        notes: d.notes || undefined,
        recommendations: d.recommendations || undefined,
        treatmentTypes: d.treatmentTypes,
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

            {hasNoPlan && !canEditPrice && (
              <p className="text-xs text-muted-foreground">Seancë pa plan trajtimi — nuk do të ndikojë në numërimin e seancave të një trajtimi.</p>
            )}

            {/* Price override — visible to ADMIN and MANAGER for any session */}
            {canEditPrice && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                <FormField control={form.control} name="amount" render={({ field }) => {
                  const isFree = field.value === 0;
                  const willReleaseCredit = isFree && existingAllocations > 0.005;
                  return (
                    <FormItem>
                      <FormLabel>Çmimi i seancës (€)</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number" step="0.01" min="0"
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) => {
                              const v = e.target.value === '' ? undefined : Number(e.target.value);
                              if (v !== undefined && v > 0) previousAmount.current = v;
                              field.onChange(e);
                            }}
                            className="flex-1"
                          />
                        </FormControl>
                        <Button
                          type="button"
                          size="sm"
                          variant={isFree ? 'default' : 'outline'}
                          className={isFree ? 'gradient-teal text-white border-0' : ''}
                          onClick={() => {
                            if (isFree) {
                              field.onChange(previousAmount.current ?? (session?.amount != null ? Number(session.amount) : 0));
                            } else {
                              previousAmount.current = field.value;
                              field.onChange(0);
                            }
                          }}
                        >
                          Pa pagesë
                        </Button>
                      </div>
                      {isFree && (
                        <p className="text-xs text-muted-foreground">Kjo seancë nuk do të krijojë borxh.</p>
                      )}
                      {willReleaseCredit && (
                        <p className="text-xs text-amber-600">
                          {formatCurrency(existingAllocations)} të paguara më parë do të kthehen në kredit të pacientit.
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  );
                }} />
                <FormField control={form.control} name="priceReason" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">Arsyeja e ndryshimit (opsionale)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="p.sh. Seancë falas, Zbritje, Kompensim..."
                        {...field}
                        className="h-8 text-sm"
                      />
                    </FormControl>
                  </FormItem>
                )} />
              </div>
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
