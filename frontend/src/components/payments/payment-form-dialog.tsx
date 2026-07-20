'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { paymentsApi, treatmentPlansApi, sessionsApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PatientCombobox } from '@/components/ui/patient-combobox';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, AlertCircle, ChevronRight } from 'lucide-react';
import { formatCurrency, formatDate, extractList, extractItem } from '@/lib/utils';

// Client-side FIFO: distributes `amount` across unpaid sessions (oldest first).
function computeSessionFIFO(
  amount: number,
  sessions: { id: string; remainingAmount: number }[],
): Map<string, number> {
  const result = new Map<string, number>();
  let remaining = amount;
  for (const s of sessions) {
    if (remaining < 0.005) break;
    const debt = Math.max(0, s.remainingAmount);
    if (debt < 0.005) continue;
    const allocated = Math.min(remaining, debt);
    result.set(s.id, Math.round(allocated * 100) / 100);
    remaining -= allocated;
  }
  return result;
}

const schema = z.object({
  patientId: z.string().min(1, 'Pacienti është i detyrueshëm'),
  amount: z.coerce
    .number({ invalid_type_error: 'Shuma duhet të jetë numër' })
    .min(0.01, 'Shuma duhet të jetë pozitive'),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CARD']).default('CASH'),
  paymentType: z.enum(['FULL_TREATMENT', 'PARTIAL', 'PER_SESSION', 'DEBT_PAYMENT']).optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface PaymentFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultPatientId?: string;
  defaultPlanId?: string;
  /** Pre-selects a specific session and pre-fills its remaining amount. */
  defaultSessionId?: string;
  payment?: any;
}

export function PaymentFormDialog({
  open,
  onClose,
  onSuccess,
  defaultPatientId,
  defaultPlanId,
  defaultSessionId,
  payment,
}: PaymentFormDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = !!payment;

  const [patientId, setPatientId] = useState(payment?.patientId || defaultPatientId || '');
  const [planId, setPlanId] = useState(payment?.treatmentPlanId || defaultPlanId || '');
  // null = auto-FIFO; Map<sessionId, amount> = manual overrides
  const [manualAllocs, setManualAllocs] = useState<Map<string, number> | null>(null);
  const idempotencyKeyRef = useRef<string | undefined>(undefined);

  const defaultValues = useMemo<FormData>(() => ({
    patientId: payment?.patientId || defaultPatientId || '',
    amount: payment ? Number(payment.amount) : (undefined as any),
    paymentMethod: payment?.paymentMethod || 'CASH',
    paymentType: payment?.paymentType || undefined,
    notes: payment?.notes || '',
  }), [payment, defaultPatientId]);

  const form = useForm<FormData>({ resolver: zodResolver(schema), defaultValues });

  useEffect(() => {
    if (open) {
      form.reset(defaultValues);
      setPatientId(payment?.patientId || defaultPatientId || '');
      setPlanId(payment?.treatmentPlanId || defaultPlanId || '');
      setManualAllocs(null);
      idempotencyKeyRef.current = isEdit ? undefined : crypto.randomUUID();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Load plans for the patient (to choose which plan to pay for)
  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ['payment-form-plans', patientId],
    queryFn: () => treatmentPlansApi.getAll({ patientId, limit: 100 }),
    enabled: !!patientId && !isEdit,
    staleTime: 30_000,
  });
  const plans = extractList<any>(plansData);

  // Load sessions for the selected plan
  const { data: planSessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ['payment-plan-sessions', planId],
    queryFn: () => paymentsApi.getPlanSessions(planId),
    enabled: !!planId && !isEdit,
    staleTime: 0,
  });
  const planSessionsRaw = extractItem<{ sessions: any[]; credit: number; currentDebt: number; plan: any }>(planSessionsData);
  const planSessions = planSessionsRaw?.sessions ?? [];
  const planCredit = Number(planSessionsRaw?.credit ?? 0);
  const planCurrentDebt = Number(planSessionsRaw?.currentDebt ?? 0);
  const planInfo = planSessionsRaw?.plan;

  // Standalone session (no plan): fetch session info for pre-filling
  const isStandaloneSession = !!defaultSessionId && !defaultPlanId && !isEdit;
  const { data: sessionInfoData, isLoading: sessionInfoLoading } = useQuery({
    queryKey: ['payment-session-info', defaultSessionId],
    queryFn: () => paymentsApi.getSessionInfo(defaultSessionId!),
    enabled: isStandaloneSession,
    staleTime: 0,
  });
  const standaloneSession = extractItem<{
    id: string; amount: number; paidAmount: number; remainingAmount: number; isPaid: boolean;
  }>(sessionInfoData);

  // Auto-select plan when there's exactly one, or when defaultPlanId is set
  useEffect(() => {
    if (isEdit || !patientId || plansLoading) return;
    if (defaultPlanId) { setPlanId(defaultPlanId); return; }
    const activePlans = plans.filter((p: any) => p.isActive !== false);
    if (activePlans.length === 1) setPlanId(activePlans[0].id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plansLoading, patientId]);

  // Pre-fill amount for defaultSessionId (plan session)
  useEffect(() => {
    if (!defaultSessionId || !planSessions.length || isEdit) return;
    const session = planSessions.find((s: any) => s.id === defaultSessionId);
    if (session && session.remainingAmount > 0 && !form.getValues('amount')) {
      form.setValue('amount', session.remainingAmount);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planSessions, defaultSessionId]);

  // Pre-fill amount for standalone session (no plan)
  useEffect(() => {
    if (!isStandaloneSession || !standaloneSession || isEdit) return;
    if (!form.getValues('amount') && standaloneSession.remainingAmount > 0) {
      form.setValue('amount', standaloneSession.remainingAmount);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standaloneSession]);

  // Pre-fill amount when plan has debt and amount is empty
  useEffect(() => {
    if (!planId || isEdit || form.getValues('amount')) return;
    if (planCurrentDebt > 0) form.setValue('amount', planCurrentDebt);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planCurrentDebt, planId]);

  const watchedAmount = form.watch('amount');
  const effectiveAmount = Number(watchedAmount) || 0;

  // Reset manual allocations when amount changes
  useEffect(() => { setManualAllocs(null); }, [watchedAmount]);

  // FIFO allocation preview
  const autoAllocs = useMemo((): Map<string, number> => {
    if (!effectiveAmount || !planSessions.length) return new Map();
    if (defaultSessionId) {
      // When paying a specific session, only allocate to it
      const session = planSessions.find((s: any) => s.id === defaultSessionId);
      if (!session) return new Map();
      const alloc = Math.min(effectiveAmount, session.remainingAmount);
      return alloc > 0.005 ? new Map([[defaultSessionId, alloc]]) : new Map();
    }
    return computeSessionFIFO(effectiveAmount, planSessions);
  }, [effectiveAmount, planSessions, defaultSessionId]);

  const activeAllocs = manualAllocs ?? autoAllocs;
  const totalAllocated = [...activeAllocs.values()].reduce((s, v) => s + v, 0);
  const planCreditAfter = Math.max(0, Math.round((planCredit + effectiveAmount - totalAllocated) * 100) / 100);

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const payload: any = {
        patientId: data.patientId,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        paymentType: data.paymentType || undefined,
        notes: data.notes || undefined,
        idempotencyKey: isEdit ? undefined : idempotencyKeyRef.current,
      };
      if (planId) payload.treatmentPlanId = planId;

      if (!isEdit && isStandaloneSession && defaultSessionId && data.amount > 0.005) {
        // Standalone session: allocate the full payment to this specific session.
        payload.sessionAllocations = [{ sessionId: defaultSessionId, amount: data.amount }];
      } else if (!isEdit && manualAllocs && manualAllocs.size > 0) {
        // Manual override for plan sessions
        payload.sessionAllocations = [...manualAllocs.entries()]
          .filter(([, amt]) => amt > 0.005)
          .map(([sessionId, amount]) => ({ sessionId, amount }));
      }

      return isEdit
        ? paymentsApi.update(payment.id, payload)
        : paymentsApi.create(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Pagesa u përditësua!' : 'Pagesa u regjistrua me sukses!');
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['payment-debts'] });
      queryClient.invalidateQueries({ queryKey: ['outstanding-balances'] });
      queryClient.invalidateQueries({ queryKey: ['plan-financials'] });
      queryClient.invalidateQueries({ queryKey: ['treatment-plans'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['patient'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      queryClient.invalidateQueries({ queryKey: ['manager-stats'] });
      queryClient.invalidateQueries({ queryKey: ['report-overview'] });
      queryClient.invalidateQueries({ queryKey: ['payment-form-plans', patientId] });
      queryClient.invalidateQueries({ queryKey: ['payment-plan-sessions', planId] });
      onSuccess();
      form.reset();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const setManualAlloc = (sessionId: string, amount: number) => {
    const base = new Map(manualAllocs ?? autoAllocs);
    base.set(sessionId, Math.max(0, Math.round(amount * 100) / 100));
    setManualAllocs(base);
  };

  const isManual = manualAllocs !== null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="sm:max-w-lg h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col gap-0 p-0"
        style={{ borderRadius: 'var(--radius)' }}
      >
        {/* Header — fixed */}
        <DialogHeader className="px-4 sm:px-6 py-4 border-b shrink-0">
          <DialogTitle className="text-base">
            {isEdit ? 'Ndrysho pagesën' : 'Regjistro Pagesë të Re'}
          </DialogTitle>
        </DialogHeader>

        {/* Scrollable body */}
        <Form {...form}>
          <form
            id="payment-form"
            onSubmit={form.handleSubmit((d) => mutation.mutate(d))}
            className="flex flex-col flex-1 min-h-0"
          >
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 space-y-4">

              {/* Patient */}
              {!defaultPatientId && (
                <FormField control={form.control} name="patientId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pacienti *</FormLabel>
                    <FormControl>
                      <PatientCombobox
                        value={field.value}
                        onChange={(v) => {
                          field.onChange(v);
                          setPatientId(v);
                          setPlanId('');
                          setManualAllocs(null);
                          form.setValue('amount', undefined as any);
                        }}
                        placeholder="Zgjidh pacientin"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              {/* Plan selector — shown when patient has multiple plans and no defaultPlanId */}
              {!isEdit && patientId && !defaultPlanId && plans.length > 1 && (
                <FormItem>
                  <FormLabel>Kontrollë</FormLabel>
                  {plansLoading ? (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Loader2 size={12} className="animate-spin" /> Duke ngarkuar...
                    </p>
                  ) : (
                    <Select value={planId} onValueChange={(v) => { setPlanId(v); setManualAllocs(null); form.setValue('amount', undefined as any); }}>
                      <SelectTrigger className="w-full text-sm min-h-[44px]">
                        <SelectValue placeholder="Zgjidh kontrollën" />
                      </SelectTrigger>
                      <SelectContent>
                        {plans.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>
                            <span className="truncate">{p.diagnosis || p.treatmentTypes?.[0] || 'Kontrollë'}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {p.completedSessions}/{p.totalSessions} seanca
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormItem>
              )}

              {/* Plan info bar */}
              {!isEdit && planId && planInfo && (
                <div className="rounded-lg bg-muted/40 border px-3 py-2 text-sm space-y-0.5">
                  <p className="font-medium truncate">{planInfo.diagnosis || planInfo.treatmentTypes?.[0] || 'Kontrollë'}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{planInfo.completedSessions}/{planInfo.totalSessions} seanca</span>
                    <span>Çmimi: {formatCurrency(planInfo.sessionFee)}/seancë</span>
                    {planCredit > 0.005 && (
                      <span className="text-teal-600 dark:text-teal-400 font-medium">
                        Kredit: {formatCurrency(planCredit)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Standalone session info */}
              {isStandaloneSession && sessionInfoLoading && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Loader2 size={13} className="animate-spin" /> Duke ngarkuar seancën...
                </p>
              )}
              {isStandaloneSession && standaloneSession && !sessionInfoLoading && (
                <div className="rounded-lg bg-muted/40 border px-3 py-2 text-sm space-y-0.5">
                  <p className="font-medium">Seancë pa plan</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    <span>Çmimi: {formatCurrency(standaloneSession.amount)}</span>
                    {standaloneSession.paidAmount > 0.005 && (
                      <span className="text-green-600 dark:text-green-400">
                        Paguar: {formatCurrency(standaloneSession.paidAmount)}
                      </span>
                    )}
                    <span className="font-medium text-destructive">
                      Mbetet: {formatCurrency(standaloneSession.remainingAmount)}
                    </span>
                  </div>
                </div>
              )}

              {/* Amount */}
              <FormField control={form.control} name="amount" render={({ field }) => (
                <FormItem>
                  <FormLabel>Shuma e pagesës (€) *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className="text-base min-h-[44px]"
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value === '' ? '' : e.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Sessions — shown when a plan is selected */}
              {!isEdit && planId && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <FormLabel className="text-sm">Seancat e kontrollës</FormLabel>
                    {isManual && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setManualAllocs(null)}
                      >
                        Resetëso FIFO
                      </Button>
                    )}
                  </div>

                  {sessionsLoading && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5 py-2">
                      <Loader2 size={13} className="animate-spin" /> Duke ngarkuar seancat...
                    </p>
                  )}

                  {!sessionsLoading && planSessions.length === 0 && (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground text-center">
                      {planCredit > 0.005
                        ? `Nuk ka seanca të papaguara. Krediti aktual: ${formatCurrency(planCredit)}.`
                        : 'Nuk ka seanca të kryera ende për këtë kontrollë.'}
                    </div>
                  )}

                  {!sessionsLoading && planSessions.length > 0 && effectiveAmount <= 0 && (
                    <p className="text-xs text-muted-foreground py-1">
                      Shkruaj shumën për të parë alokimet automatike.
                    </p>
                  )}

                  {!sessionsLoading && planSessions.length > 0 && effectiveAmount > 0 && (
                    <div className="space-y-2">
                      {planSessions.map((session: any) => {
                        const alloc = activeAllocs.get(session.id) ?? 0;
                        const afterAlloc = Math.max(0, session.remainingAmount - alloc);
                        const isFullyCovered = session.isPaid || (alloc >= session.remainingAmount - 0.005 && session.remainingAmount > 0.005);

                        return (
                          <div
                            key={session.id}
                            className={`rounded-lg border p-3 space-y-1.5 text-sm transition-colors ${
                              isFullyCovered ? 'border-green-200 dark:border-green-900 bg-green-50/30 dark:bg-green-950/20' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">
                                Seanca #{session.sessionNumber ?? '—'}
                              </span>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {session.completedAt ? formatDate(session.completedAt) : '—'}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>Çmimi</span>
                              <span>{formatCurrency(session.amount)}</span>
                            </div>

                            {session.paidAmount > 0.005 && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Paguar deri tani</span>
                                <span className="text-green-600 dark:text-green-400 font-medium">
                                  {formatCurrency(session.paidAmount)}
                                </span>
                              </div>
                            )}

                            {session.isPaid ? (
                              <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                                <CheckCircle2 size={12} />
                                Paguar plotësisht
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">Mbetet pa paguar</span>
                                  <span className="font-medium text-destructive">
                                    {formatCurrency(session.remainingAmount)}
                                  </span>
                                </div>

                                {alloc > 0.005 && (
                                  <div className="flex items-center gap-2 pt-1.5 border-t">
                                    <span className="text-xs text-muted-foreground shrink-0">Alokohen:</span>
                                    {isManual ? (
                                      <Input
                                        type="number"
                                        inputMode="decimal"
                                        step="0.01"
                                        min="0"
                                        max={session.remainingAmount}
                                        className="h-7 text-xs w-24 px-2"
                                        value={alloc || ''}
                                        onChange={(e) => setManualAlloc(session.id, Number(e.target.value))}
                                      />
                                    ) : (
                                      <button
                                        type="button"
                                        className="text-xs font-semibold text-primary hover:underline cursor-pointer bg-transparent border-none p-0"
                                        onClick={() => setManualAllocs(new Map(autoAllocs))}
                                        title="Kliko për ndryshim manual"
                                      >
                                        {formatCurrency(alloc)}
                                      </button>
                                    )}
                                    {isFullyCovered ? (
                                      <span className="text-xs text-green-600 dark:text-green-400 font-medium ml-auto">
                                        ✓ plotësisht
                                      </span>
                                    ) : afterAlloc > 0.005 ? (
                                      <span className="text-xs text-amber-600 dark:text-amber-400 ml-auto">
                                        mbeten {formatCurrency(afterAlloc)}
                                      </span>
                                    ) : null}
                                  </div>
                                )}

                                {alloc < 0.005 && (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <AlertCircle size={12} />
                                    Nuk mbulohet nga kjo pagesë
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}

                      {/* Summary row */}
                      <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Totali i alokuar në seanca</span>
                          <span className="font-medium">{formatCurrency(totalAllocated)}</span>
                        </div>
                        {planCreditAfter > 0.005 && (
                          <div className="flex justify-between">
                            <span className="text-teal-600 dark:text-teal-400">
                              Kredit i planit pas pagesës
                            </span>
                            <span className="font-semibold text-teal-600 dark:text-teal-400">
                              +{formatCurrency(planCreditAfter)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* No plan — general credit (only when NOT a standalone session payment) */}
              {!isEdit && patientId && !planId && !isStandaloneSession && effectiveAmount > 0 && !plansLoading && (
                <div className="rounded-lg border border-dashed bg-muted/20 p-3 text-sm text-center text-muted-foreground">
                  {formatCurrency(effectiveAmount)} do të ruhen si bilanc/kredit i pacientit
                </div>
              )}

              {/* Payment method + type */}
              <div className="flex flex-col sm:flex-row gap-3">
                <FormField control={form.control} name="paymentMethod" render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Mënyra e pagesës</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="CASH">Para në dorë</SelectItem>
                        <SelectItem value="BANK_TRANSFER">Transfer bankar</SelectItem>
                        <SelectItem value="CARD">Kartë</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />

                <FormField control={form.control} name="paymentType" render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Lloji (opsionale)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl>
                        <SelectTrigger className="min-h-[44px]">
                          <SelectValue placeholder="Zgjidh llojin" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="FULL_TREATMENT">Trajtimi i plotë</SelectItem>
                        <SelectItem value="PARTIAL">Pagesë e pjesshme</SelectItem>
                        <SelectItem value="PER_SESSION">Sipas seancës</SelectItem>
                        <SelectItem value="DEBT_PAYMENT">Pagesë borxhi</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Shënime</FormLabel>
                  <FormControl>
                    <Textarea rows={2} className="resize-none" {...field} />
                  </FormControl>
                </FormItem>
              )} />
            </div>

            {/* Footer — sticky */}
            <div className="px-4 sm:px-6 py-4 border-t bg-background shrink-0 flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
              >
                Anulo
              </Button>
              <Button
                type="submit"
                form="payment-form"
                disabled={mutation.isPending}
                className="flex-1 gradient-teal text-white border-0 min-h-[44px]"
              >
                {mutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
                {isEdit ? 'Ruaj ndryshimet' : 'Regjistro pagesën'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
