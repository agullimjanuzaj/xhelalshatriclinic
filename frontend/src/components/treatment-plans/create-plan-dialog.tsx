'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { treatmentPlansApi, usersApi, patientsApi, treatmentTypesApi, complaintsApi, suggestionsApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { PatientCombobox } from '@/components/ui/patient-combobox';
import { GenerateNotesButton } from '@/components/treatment-plans/generate-notes-button';
import { useSuggestedConditions } from '@/hooks/use-suggested-conditions';
import { Loader2, Building2, RefreshCcw, Sparkles } from 'lucide-react';
import { formatCurrency, extractList } from '@/lib/utils';

const schema = z.object({
  patientId: z.string().uuid('Pacienti është i detyrueshëm'),
  diagnosis: z.string().optional(),
  complaints: z.array(z.string()).optional(),
  selectedDiagnoses: z.array(z.string()).optional(),
  treatmentTypes: z.array(z.string()).min(1, 'Zgjidh të paktën një lloj trajtimi'),
  totalSessions: z.coerce.number().min(1).max(100),
  sessionFee: z.coerce.number().min(0),
  manualTotal: z.boolean(),
  totalAmount: z.coerce.number().min(0).optional(),
  startDate: z.string().min(1, 'Data e fillimit është e detyrueshme'),
  assignedPhysiotherapistId: z.string().optional().or(z.literal('')),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface CreatePlanDialogProps {
  open: boolean;
  onClose: () => void;
  defaultPatientId?: string;
  plan?: any; // when provided, the dialog edits this plan instead of creating a new one
}

export function CreatePlanDialog({ open, onClose, defaultPatientId, plan }: CreatePlanDialogProps) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isAdmin = role === 'ADMIN';
  const isEdit = !!plan;

  // Manager and physiotherapist may not create or edit Kontrolla — only ADMIN.
  if (!isAdmin) return null;

  const { data: physiosData } = useQuery({
    queryKey: ['physiotherapists-select'],
    queryFn: () => usersApi.getAll({ role: 'PHYSIOTHERAPIST', limit: 200 }),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const physios = (physiosData as any)?.data || [];

  const { data: treatmentTypesData } = useQuery({
    queryKey: ['treatment-types', 'active'],
    queryFn: () => treatmentTypesApi.getAll({ activeOnly: true }),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const treatmentTypeOptions = extractList<{ id: string; name: string; isActive: boolean }>(treatmentTypesData);

  const { data: complaintsData } = useQuery({
    queryKey: ['complaints', 'active'],
    queryFn: () => complaintsApi.getAll({ activeOnly: true }),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const complaintOptions = extractList<{ id: string; name: string; suggestedConditions: { id: string; name: string }[] }>(complaintsData);

  const defaultValues = useMemo<FormData>(() => plan ? {
    patientId: plan.patientId,
    diagnosis: plan.diagnosis || '',
    complaints: plan.complaints || [],
    selectedDiagnoses: plan.selectedDiagnoses || [],
    treatmentTypes: plan.treatmentTypes || [],
    totalSessions: plan.totalSessions,
    sessionFee: Number(plan.sessionFee),
    manualTotal: false,
    totalAmount: Number(plan.totalAmount),
    startDate: plan.startDate ? new Date(plan.startDate).toISOString().slice(0, 10) : '',
    assignedPhysiotherapistId: plan.assignedPhysiotherapistId || '',
    notes: plan.notes || '',
  } : {
    patientId: defaultPatientId || '',
    diagnosis: '',
    complaints: [],
    selectedDiagnoses: [],
    treatmentTypes: [],
    totalSessions: 10,
    sessionFee: 20,
    manualTotal: false,
    totalAmount: undefined,
    startDate: new Date().toISOString().slice(0, 10),
    assignedPhysiotherapistId: '',
    notes: '',
  }, [plan, defaultPatientId]);

  const form = useForm<FormData>({ resolver: zodResolver(schema), defaultValues });

  // Tracks the previously-applied selectedDiagnoses set so the Diagnoza
  // sync effect below can diff "what changed" instead of overwriting the
  // whole field — that's what lets manually-typed diagnosis text survive
  // a complaint/diagnosis checkbox toggle.
  const prevSelectedDiagnosesRef = useRef<string[]>(defaultValues.selectedDiagnoses || []);

  useEffect(() => {
    if (open) {
      form.reset(defaultValues);
      prevSelectedDiagnosesRef.current = defaultValues.selectedDiagnoses || [];
    }
  }, [open, defaultValues, form]);

  // Branch is never picked manually — it always follows the selected patient.
  const watchedPatientId = form.watch('patientId');
  const { data: selectedPatientData } = useQuery({
    queryKey: ['patient-branch-lookup', watchedPatientId],
    queryFn: () => patientsApi.getOne(watchedPatientId),
    enabled: !!watchedPatientId,
  });
  const selectedPatient = (selectedPatientData as any)?.data;

  // Pricing defaults come from the patient's branch's single sessionPrice —
  // only pre-fill on creation, never overwrite figures already saved on an
  // existing plan.
  useEffect(() => {
    if (isEdit || !selectedPatient?.branch) return;
    form.setValue('sessionFee', Number(selectedPatient.branch.sessionPrice ?? 20));
  }, [isEdit, selectedPatient, form]);

  const watchedComplaints = form.watch('complaints') || [];
  const watchedSelectedDiagnoses = form.watch('selectedDiagnoses') || [];
  const watchedTypes = form.watch('treatmentTypes') || [];
  const watchedDiagnosis = form.watch('diagnosis') || '';
  const watchedNotes = form.watch('notes') || '';
  const totalSessions = form.watch('totalSessions') || 0;
  const sessionFee = form.watch('sessionFee') || 0;
  const manualTotal = form.watch('manualTotal');
  const computedTotal = totalSessions * sessionFee;

  // "Merr sugjerime" — same shared interaction the /sugjerime page uses for
  // "Zgjidh simptomat", and the same backend endpoint: POST
  // /suggestions/from-complaints. Complaints are stored on the form by name
  // (denormalized snapshot, same pattern as treatmentTypes), so the names
  // checked right now are resolved back to ids via complaintOptions before
  // the call — read with form.getValues (not the memoized watch value) so a
  // fast double-click never sends stale data.
  const fetchSuggestedConditions = useCallback(async () => {
    const currentComplaintNames: string[] = form.getValues('complaints') || [];
    const ids = complaintOptions.filter((o) => currentComplaintNames.includes(o.name)).map((o) => o.id);
    if (!ids.length) return [];
    const res: any = await suggestionsApi.fromComplaints(ids);
    const list = extractList<{ id: string; name: string }>(res);
    return list.map((c) => c.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complaintOptions]);

  const { loading: suggestionsLoading, results: suggestedConditions, fetch: fetchSuggestions } = useSuggestedConditions(fetchSuggestedConditions);

  // Every condition returned by "Merr sugjerime" starts checked — newly
  // returned ones are added to selectedDiagnoses (and therefore to Diagnoza
  // via the sync effect below); anything the user has since unchecked is
  // never force-rechecked by clicking the button again.
  useEffect(() => {
    if (suggestedConditions === null) return;
    const curDiag = form.getValues('selectedDiagnoses') || [];
    const toAdd = suggestedConditions.filter((d) => !curDiag.includes(d));
    if (toAdd.length) form.setValue('selectedDiagnoses', [...curDiag, ...toAdd]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedConditions]);

  // Keeps the free-text "Diagnoza" field in sync with checked suggested
  // conditions/diagnoses — same idea as the "Zgjidh simptomat" suggestion
  // flow on /sugjerime, but here the suggestions actually land in an
  // editable field instead of a read-only results list. Only the diff
  // (newly checked / newly unchecked) is applied, so any diagnosis text the
  // user typed by hand is never overwritten or wiped.
  useEffect(() => {
    const prev = prevSelectedDiagnosesRef.current;
    const curr = watchedSelectedDiagnoses;
    const added = curr.filter((d) => !prev.includes(d));
    const removed = prev.filter((d) => !curr.includes(d));
    if (added.length || removed.length) {
      const currentText = form.getValues('diagnosis') || '';
      let segments = currentText.split(',').map((s) => s.trim()).filter(Boolean);
      segments = segments.filter((s) => !removed.includes(s));
      for (const d of added) {
        if (!segments.includes(d)) segments.push(d);
      }
      form.setValue('diagnosis', segments.join(', '));
    }
    prevSelectedDiagnosesRef.current = curr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedSelectedDiagnoses]);

  const mutation = useMutation({
    mutationFn: (d: FormData) => {
      const payload = {
        ...d,
        assignedPhysiotherapistId: d.assignedPhysiotherapistId || undefined,
        startDate: new Date(d.startDate).toISOString(),
        totalAmount: d.manualTotal ? d.totalAmount : undefined,
        manualTotal: undefined,
      };
      return isEdit ? treatmentPlansApi.update(plan.id, payload) : treatmentPlansApi.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treatment-plans'] });
      queryClient.invalidateQueries({ queryKey: ['treatment-plans-physio'] });
      queryClient.invalidateQueries({ queryKey: ['patient'] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['patients-physio'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['payment-debts'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      queryClient.invalidateQueries({ queryKey: ['manager-stats'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
      toast.success(isEdit ? 'Kontrollëja u përditësua me sukses!' : 'Kontrollëja u krijua me sukses!');
      form.reset();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Ndrysho kontrollën' : 'Kontrollë e re'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
            {!defaultPatientId && !isEdit && (
              <FormField control={form.control} name="patientId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Pacienti</FormLabel>
                  <FormControl>
                    <PatientCombobox value={field.value} onChange={field.onChange} placeholder="Zgjidh pacientin" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
              <Building2 size={15} className="text-muted-foreground flex-shrink-0" />
              {selectedPatient?.branch?.name ? (
                <span>Dega: <span className="font-medium">{selectedPatient.branch.name}</span></span>
              ) : (
                <span className="text-muted-foreground">Zgjidh pacientin për të parë degën</span>
              )}
            </div>

            <FormField control={form.control} name="assignedPhysiotherapistId" render={({ field }) => (
              <FormItem>
                <FormLabel>Fizioterapeuti</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Zgjidh fizioterapeutin" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {physios.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            {/* Ankesat kryesore — dynamic complaints from admin-managed list */}
            {complaintOptions.length > 0 && (
              <FormField control={form.control} name="complaints" render={({ field }) => (
                <FormItem>
                  <FormLabel>Ankesat kryesore</FormLabel>
                  <div className="grid grid-cols-2 gap-2 border rounded-lg p-3 max-h-40 overflow-y-auto">
                    {complaintOptions.map((c) => (
                      <div key={c.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`complaint-${c.id}`}
                          checked={(field.value || []).includes(c.name)}
                          onCheckedChange={(checked) => {
                            const current = field.value || [];
                            const next = checked ? [...current, c.name] : current.filter((x) => x !== c.name);
                            field.onChange(next);

                            // Unchecking a complaint cleans up any of its
                            // diagnoses that no other still-checked complaint
                            // also suggests — but checking one no longer
                            // auto-adds anything; that now only happens via
                            // the explicit "Merr sugjerime" button below, to
                            // match the /sugjerime page's click-to-fetch flow.
                            if (!checked) {
                              const curDiag = form.getValues('selectedDiagnoses') || [];
                              const stillSuggested = new Set(
                                complaintOptions
                                  .filter((opt) => next.includes(opt.name))
                                  .flatMap((opt) => (opt.suggestedConditions || []).map((sc) => sc.name)),
                              );
                              const thisComplaintConditions = (c.suggestedConditions || []).map((sc: { name: string }) => sc.name);
                              const toRemove = new Set(thisComplaintConditions.filter((d: string) => !stillSuggested.has(d)));
                              form.setValue('selectedDiagnoses', curDiag.filter((d) => !toRemove.has(d)));
                            }
                          }}
                        />
                        <label htmlFor={`complaint-${c.id}`} className="text-sm cursor-pointer">{c.name}</label>
                      </div>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            {/* "Merr sugjerime" — same interaction as /sugjerime's "Zgjidh simptomat" */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-2 flex-1"
                disabled={!watchedComplaints.length || suggestionsLoading}
                onClick={() => fetchSuggestions()}
              >
                {suggestionsLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {suggestionsLoading ? 'Duke marrë sugjerimet...' : 'Merr sugjerime'}
              </Button>
              {suggestedConditions !== null && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Rifresko sugjerimet"
                  disabled={!watchedComplaints.length || suggestionsLoading}
                  onClick={() => fetchSuggestions()}
                >
                  <RefreshCcw size={14} />
                </Button>
              )}
            </div>

            {/* Gjendjet e sugjeruara — shown only after "Merr sugjerime" is clicked */}
            {!suggestionsLoading && suggestedConditions !== null && (
              <FormField control={form.control} name="selectedDiagnoses" render={({ field }) => (
                <FormItem>
                  <FormLabel>Gjendjet e sugjeruara</FormLabel>
                  {suggestedConditions.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">Nuk u gjet asnjë gjendje e sugjeruar</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-1.5 border rounded-lg p-3 bg-teal-50/50 max-h-40 overflow-y-auto">
                      {suggestedConditions.map((d) => (
                        <div key={d} className="flex items-center gap-2">
                          <Checkbox
                            id={`sugdiag-${d}`}
                            checked={(field.value || []).includes(d)}
                            onCheckedChange={(checked) => {
                              const current = field.value || [];
                              field.onChange(checked ? [...current, d] : current.filter((x) => x !== d));
                            }}
                          />
                          <label htmlFor={`sugdiag-${d}`} className="text-sm cursor-pointer">{d}</label>
                        </div>
                      ))}
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )} />
            )}

            <FormField control={form.control} name="diagnosis" render={({ field }) => (
              <FormItem>
                <FormLabel>Diagnoza</FormLabel>
                <FormControl><Textarea placeholder="Diagnoza/sugjerimi klinik" {...field} /></FormControl>
              </FormItem>
            )} />

            <FormField control={form.control} name="treatmentTypes" render={({ field }) => (
              <FormItem>
                <FormLabel>Llojet e trajtimit *</FormLabel>
                <div className="grid grid-cols-2 gap-2 border rounded-lg p-3">
                  {treatmentTypeOptions.map((type) => (
                    <div key={type.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`plan-type-${type.id}`}
                        checked={watchedTypes.includes(type.name)}
                        onCheckedChange={(checked) => {
                          const current = field.value || [];
                          field.onChange(checked ? [...current, type.name] : current.filter((t) => t !== type.name));
                        }}
                      />
                      <label htmlFor={`plan-type-${type.id}`} className="text-sm cursor-pointer">
                        {type.name}
                      </label>
                    </div>
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="totalSessions" render={({ field }) => (
                <FormItem>
                  <FormLabel>Seancat/trajtimet totale</FormLabel>
                  <FormControl><Input type="number" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="sessionFee" render={({ field }) => (
                <FormItem>
                  <FormLabel>Çmimi për trajtim/seancë (€)</FormLabel>
                  <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="manual-total"
                  checked={manualTotal}
                  onCheckedChange={(checked) => {
                    form.setValue('manualTotal', !!checked);
                    form.setValue('totalAmount', checked ? computedTotal : undefined);
                  }}
                />
                <label htmlFor="manual-total" className="text-sm cursor-pointer">Çmim total manual (special klinike)</label>
              </div>
              {manualTotal ? (
                <FormField control={form.control} name="totalAmount" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Çmimi total (€)</FormLabel>
                    <FormControl><Input type="number" step="0.01" {...field} value={field.value ?? ''} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              ) : (
                <p className="text-sm">Totali i llogaritur automatikisht: <span className="font-semibold">{formatCurrency(computedTotal)}</span></p>
              )}
            </div>

            <FormField control={form.control} name="startDate" render={({ field }) => (
              <FormItem>
                <FormLabel>Data e fillimit</FormLabel>
                <FormControl><Input type="date" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>Plani i tretmanit</FormLabel>
                  <GenerateNotesButton
                    diagnosis={watchedDiagnosis}
                    treatmentTypes={watchedTypes}
                    totalSessions={totalSessions}
                    existingNotes={watchedNotes}
                    complaints={watchedComplaints}
                    selectedDiagnoses={watchedSelectedDiagnoses}
                    onGenerated={(text) => form.setValue('notes', text)}
                  />
                </div>
                <FormControl><Textarea placeholder="Plani i tretmanit..." rows={4} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Anulo</Button>
              <Button type="submit" className="gradient-teal text-white border-0" disabled={mutation.isPending || !watchedPatientId}>
                {mutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
                {isEdit ? 'Ruaj ndryshimet' : 'Krijo kontrollën'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
