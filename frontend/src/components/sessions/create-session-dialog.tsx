'use client';

import { useEffect, useState } from 'react';
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
import { PatientCombobox } from '@/components/ui/patient-combobox';
import { TreatmentTypesChecklist } from '@/components/sessions/treatment-types-checklist';
import { GenerateRecommendationButton } from '@/components/sessions/generate-recommendation-button';
import { GenerateSessionNoteButton } from '@/components/sessions/generate-session-note-button';
import { Loader2 } from 'lucide-react';
import { getTreatmentTypeLabel, extractList, extractItem, formatCurrency } from '@/lib/utils';

const NO_PLAN = '__no_plan__';

const schema = z.object({
  patientId: z.string().uuid('Pacienti është i detyrueshëm'),
  treatmentPlanId: z.string().optional(),
  treatmentTypes: z.array(z.string()).default([]),
  scheduledAt: z.string().optional(),
  amount: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
  recommendations: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface CreateSessionDialogProps {
  open: boolean;
  onClose: () => void;
  defaultPatientId?: string;
}

export function CreateSessionDialog({ open, onClose, defaultPatientId }: CreateSessionDialogProps) {
  const queryClient = useQueryClient();
  const { data: authSession } = useSession();
  const role = authSession?.user?.role;
  const isPhysio = role === 'PHYSIOTHERAPIST';
  const isAdmin = role === 'ADMIN';
  const [patientId, setPatientId] = useState(defaultPatientId || '');

  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ['treatment-plans-for-session', patientId],
    queryFn: () => treatmentPlansApi.getAll({ patientId, limit: 50 }),
    enabled: !!patientId,
  });
  const plans = extractList<any>(plansData);
  const activePlans = plans.filter((p: any) => p.completedSessions < p.totalSessions);

  // Drives the automatic branch-based price for a session with no plan —
  // never a hardcoded global default.
  const { data: patientData } = useQuery({
    queryKey: ['patient-branch-lookup-session', patientId],
    queryFn: () => patientsApi.getOne(patientId),
    enabled: !!patientId,
  });
  const selectedPatient = extractItem<any>(patientData);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { patientId: defaultPatientId || '', treatmentPlanId: NO_PLAN, treatmentTypes: [], scheduledAt: '', amount: undefined, notes: '', recommendations: '' },
  });

  useEffect(() => { if (open) form.reset({ patientId: defaultPatientId || '', treatmentPlanId: NO_PLAN, treatmentTypes: [], scheduledAt: '', amount: undefined, notes: '', recommendations: '' }); }, [open, defaultPatientId, form]);

  const selectedPlanId = form.watch('treatmentPlanId');
  const selectedPlan = activePlans.find((p: any) => p.id === selectedPlanId);
  const watchedTypes = form.watch('treatmentTypes') || [];
  const watchedNotes = form.watch('notes') || '';
  const hasNoPlan = !selectedPlanId || selectedPlanId === NO_PLAN;

  // Auto-fill the branch's regular session price whenever there's no plan
  // selected — the branch is the single source of truth, never a hardcoded
  // number. Re-applies if the patient (and therefore branch) changes.
  useEffect(() => {
    if (hasNoPlan && selectedPatient?.branch?.sessionPrice != null) {
      form.setValue('amount', Number(selectedPatient.branch.sessionPrice));
    }
  }, [hasNoPlan, selectedPatient, form]);

  const mutation = useMutation({
    mutationFn: (d: FormData) => {
      const noPlan = !d.treatmentPlanId || d.treatmentPlanId === NO_PLAN;
      return sessionsApi.create({
        patientId: d.patientId,
        treatmentPlanId: noPlan ? undefined : d.treatmentPlanId,
        scheduledAt: d.scheduledAt ? new Date(d.scheduledAt).toISOString() : undefined,
        treatmentTypes: d.treatmentTypes,
        // Only a standalone (no-plan) session carries its own price — a
        // plan-linked session's amount is always computed server-side from
        // the plan's own fees.
        amount: noPlan ? d.amount : undefined,
        notes: d.notes || undefined,
        recommendations: d.recommendations || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Seanca u kompletua me sukses');
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['sessions-physio'] });
      queryClient.invalidateQueries({ queryKey: ['sessions-manager'] });
      queryClient.invalidateQueries({ queryKey: ['treatment-plans'] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['patient'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      queryClient.invalidateQueries({ queryKey: ['manager-stats'] });
      queryClient.invalidateQueries({ queryKey: ['physio-stats'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      form.reset();
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Seancë e re</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
            {!defaultPatientId && (
              <FormField control={form.control} name="patientId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Pacienti *</FormLabel>
                  <FormControl>
                    <PatientCombobox
                      value={field.value}
                      onChange={(v) => { field.onChange(v); setPatientId(v); form.setValue('treatmentPlanId', NO_PLAN); }}
                      placeholder="Zgjidh pacientin"
                      activeInClinicOnly={isPhysio}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            {patientId && (
              <FormField control={form.control} name="treatmentPlanId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Plani i trajtimit (opsionale)</FormLabel>
                  <Select
                    onValueChange={(v) => {
                      field.onChange(v);
                      // Picking a plan pre-checks its own treatment types —
                      // the physio can still add/remove before saving.
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
            )}

            {selectedPlan && (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
                <p>Seanca <span className="font-semibold">{selectedPlan.completedSessions + 1}</span> nga <span className="font-semibold">{selectedPlan.totalSessions}</span></p>
                <p className="text-muted-foreground">Mbetur: {selectedPlan.totalSessions - selectedPlan.completedSessions} seanca</p>
              </div>
            )}
            {patientId && hasNoPlan && (
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
                        Çmimi i marrë automatikisht nga dega {selectedPatient?.branch?.name ? `(${selectedPatient.branch.name})` : ''}: {formatCurrency(field.value ?? 0)}
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

            <FormField control={form.control} name="scheduledAt" render={({ field }) => (
              <FormItem>
                <FormLabel>Data dhe ora (opsionale)</FormLabel>
                <FormControl><Input type="datetime-local" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>Shënim i shkurtër</FormLabel>
                  <GenerateSessionNoteButton
                    treatmentTypes={watchedTypes}
                    complaints={selectedPlan?.complaints}
                    complaintDescription={selectedPlan?.complaintDescription}
                    diagnosis={selectedPlan?.diagnosis}
                    selectedDiagnoses={selectedPlan?.selectedDiagnoses}
                    planNotes={selectedPlan?.notes}
                    sessionNumber={selectedPlan ? selectedPlan.completedSessions + 1 : undefined}
                    totalSessions={selectedPlan?.totalSessions}
                    onGenerated={(text) => form.setValue('notes', text)}
                  />
                </div>
                <FormControl><Textarea placeholder="Si shkoi seanca..." rows={2} {...field} /></FormControl>
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
                <FormControl><Textarea placeholder="Rekomandime pas seancës..." rows={3} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Anulo</Button>
              <Button type="submit" disabled={mutation.isPending} className="gradient-teal text-white border-0">
                {mutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
                Regjistro seancën
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
