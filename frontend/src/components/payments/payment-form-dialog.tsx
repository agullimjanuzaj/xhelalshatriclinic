'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { paymentsApi } from '@/lib/api';
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
import { Loader2, Wand2 } from 'lucide-react';
import { formatCurrency, extractItem } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Client-side FIFO allocation — mirrors backend logic.
// Distributes `amount` across `plans` (oldest first) up to each plan's
// finalRemainingBalance. Returns allocations and any unallocated surplus.
// ---------------------------------------------------------------------------
function computeFIFO(
  amount: number,
  plans: any[],
): { allocations: { treatmentPlanId: string; amount: number }[]; unallocated: number } {
  const sorted = [...plans].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const allocations: { treatmentPlanId: string; amount: number }[] = [];
  let remaining = amount;

  for (const plan of sorted) {
    if (remaining < 0.005) break;
    const debt = Math.max(0, plan.finalRemainingBalance ?? 0);
    if (debt < 0.005) continue;
    const allocated = Math.min(remaining, debt);
    allocations.push({
      treatmentPlanId: plan.id,
      amount: Math.round(allocated * 100) / 100,
    });
    remaining -= allocated;
  }

  return { allocations, unallocated: Math.max(0, Math.round(remaining * 100) / 100) };
}

// Client-side plan financials (matches backend computePlanFinancials)
function planDebt(plan: any): number {
  const totalAmount = Number(plan.totalAmount ?? 0);
  const amountPaid = Number(plan.amountPaid ?? 0);
  return Math.max(0, totalAmount - amountPaid);
}

// ---------------------------------------------------------------------------

const schema = z.object({
  patientId: z.string().min(1, 'Pacienti është i detyrueshëm'),
  amount: z.coerce.number({ invalid_type_error: 'Shuma duhet të jetë numër' }).min(0.01, 'Shuma duhet të jetë pozitive'),
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
  /** @deprecated session-level preselection is no longer supported; prop accepted for compat only */
  defaultSessionId?: string;
  payment?: any;
}

export function PaymentFormDialog({
  open, onClose, onSuccess, defaultPatientId, defaultPlanId, payment,
}: PaymentFormDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = !!payment;
  const [patientId, setPatientId] = useState(payment?.patientId || defaultPatientId || '');
  // null = FIFO auto mode; array = user manually adjusted allocations
  const [manualAllocations, setManualAllocations] = useState<{ treatmentPlanId: string; amount: number }[] | null>(null);
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
      setManualAllocations(null);
      idempotencyKeyRef.current = isEdit ? undefined : crypto.randomUUID();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fetch unpaid plans + patient balance from dedicated endpoint
  const { data: unpaidData, isLoading: unpaidLoading } = useQuery({
    queryKey: ['payment-unpaid-plans', patientId],
    queryFn: () => paymentsApi.getUnpaidPlans(patientId),
    enabled: !!patientId && !isEdit,
  });
  const unpaidResult = extractItem<{ plans: any[]; patientBalance: number }>(unpaidData);
  const unpaidPlans: any[] = unpaidResult?.plans ?? [];
  const patientBalance: number = unpaidResult?.patientBalance ?? 0;

  // When patient is set and there's exactly one unpaid plan, pre-fill amount with its debt
  useEffect(() => {
    if (isEdit || !patientId || unpaidLoading) return;
    if (unpaidPlans.length === 1 && !form.getValues('amount')) {
      const debt = planDebt(unpaidPlans[0]);
      if (debt > 0) form.setValue('amount', debt);
    }
    // If a defaultPlanId is set, pre-fill with that plan's debt
    if (defaultPlanId && !form.getValues('amount')) {
      const plan = unpaidPlans.find((p) => p.id === defaultPlanId);
      if (plan) form.setValue('amount', planDebt(plan));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unpaidLoading, patientId]);

  const watchedAmount = form.watch('amount');
  const effectiveAmount = Number(watchedAmount) || 0;

  // Compute FIFO allocations from the current amount (auto mode)
  const autoResult = useMemo(
    () => computeFIFO(effectiveAmount, unpaidPlans),
    [effectiveAmount, unpaidPlans],
  );

  // The allocations to send to backend (manual overrides auto)
  const activeAllocations = manualAllocations ?? autoResult.allocations;
  const totalAllocated = activeAllocations.reduce((s, a) => s + a.amount, 0);
  const unallocated = Math.max(0, Math.round((effectiveAmount - totalAllocated) * 100) / 100);

  // When amount changes, reset to auto mode so FIFO re-runs
  useEffect(() => {
    setManualAllocations(null);
  }, [watchedAmount]);

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
      // Only send allocations if there are any unpaid plans (otherwise backend stores as pure credit)
      if (!isEdit && activeAllocations.length > 0) {
        payload.allocations = activeAllocations;
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
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['patient'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      queryClient.invalidateQueries({ queryKey: ['manager-stats'] });
      queryClient.invalidateQueries({ queryKey: ['report-overview'] });
      queryClient.invalidateQueries({ queryKey: ['payment-unpaid-plans'] });
      onSuccess();
      form.reset();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Manual allocation change for a single plan
  const setManualAlloc = (treatmentPlanId: string, amount: number) => {
    const base = manualAllocations ?? autoResult.allocations;
    const updated = base.map((a) =>
      a.treatmentPlanId === treatmentPlanId ? { ...a, amount: Math.max(0, amount) } : a,
    );
    // Add if not present
    if (!updated.find((a) => a.treatmentPlanId === treatmentPlanId)) {
      updated.push({ treatmentPlanId, amount: Math.max(0, amount) });
    }
    setManualAllocations(updated);
  };

  const isManual = manualAllocations !== null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Ndrysho pagesën' : 'Regjistro Pagesë të Re'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">

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
                        setManualAllocations(null);
                        form.setValue('amount', undefined as any);
                      }}
                      placeholder="Zgjidh pacientin"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            {/* Amount */}
            <FormField control={form.control} name="amount" render={({ field }) => (
              <FormItem>
                <FormLabel>Shuma e pagesës (€) *</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value === '' ? '' : e.target.value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Balance info */}
            {!isEdit && patientId && patientBalance > 0 && (
              <div className="rounded-lg border bg-teal-50 dark:bg-teal-950/20 border-teal-200 dark:border-teal-800 p-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-teal-700 dark:text-teal-400">Bilanc ekzistues i pacientit</span>
                  <span className="font-semibold text-teal-700 dark:text-teal-400">{formatCurrency(patientBalance)}</span>
                </div>
                {effectiveAmount > 0 && (
                  <div className="flex justify-between items-center mt-1 pt-1 border-t border-teal-200 dark:border-teal-800">
                    <span className="text-teal-600 dark:text-teal-500">Totali i disponueshëm (bilanc + pagesë)</span>
                    <span className="font-semibold text-teal-600 dark:text-teal-500">{formatCurrency(patientBalance + effectiveAmount)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Unpaid plans — FIFO allocation UI */}
            {!isEdit && patientId && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <FormLabel className="text-sm">Trajtimet e papaguara</FormLabel>
                  {unpaidPlans.length > 0 && isManual && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => setManualAllocations(null)}
                    >
                      <Wand2 size={12} />
                      Resetëso FIFO
                    </Button>
                  )}
                </div>

                {unpaidLoading && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Loader2 size={12} className="animate-spin" /> Duke ngarkuar trajtimet...
                  </p>
                )}

                {!unpaidLoading && unpaidPlans.length === 0 && (
                  <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground text-center">
                    {patientBalance > 0
                      ? 'Nuk ka trajtime të papaguara — pagesa do të ruhet si bilanc i pacientit.'
                      : 'Nuk ka trajtime të papaguara — pagesa do të regjistrohet si bilanc/kredit.'}
                  </div>
                )}

                {!unpaidLoading && unpaidPlans.length > 0 && effectiveAmount <= 0 && (
                  <p className="text-xs text-muted-foreground">Shkruaj shumën për të parë alokimet automatike.</p>
                )}

                {!unpaidLoading && unpaidPlans.length > 0 && effectiveAmount > 0 && (
                  <div className="rounded-lg border divide-y text-sm">
                    {unpaidPlans.map((plan) => {
                      const debt = planDebt(plan);
                      const alloc = activeAllocations.find((a) => a.treatmentPlanId === plan.id);
                      const allocAmount = alloc?.amount ?? 0;
                      const planLabel = plan.diagnosis || plan.treatmentTypes?.[0] || 'Trajtim';
                      return (
                        <div key={plan.id} className="p-3 space-y-1.5">
                          <div className="flex justify-between items-start">
                            <span className="font-medium truncate max-w-[60%]">{planLabel}</span>
                            <span className="text-muted-foreground text-xs whitespace-nowrap">
                              Borxh: <strong>{formatCurrency(debt)}</strong>
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground text-xs shrink-0">Alokohen:</span>
                            {isManual ? (
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                max={debt}
                                className="h-7 text-xs w-28"
                                value={allocAmount || ''}
                                onChange={(e) => setManualAlloc(plan.id, Number(e.target.value))}
                              />
                            ) : (
                              <button
                                type="button"
                                className="text-xs font-semibold text-primary hover:underline cursor-pointer bg-transparent border-none p-0"
                                onClick={() => {
                                  setManualAllocations(autoResult.allocations.map((a) => ({ ...a })));
                                }}
                                title="Kliko për ta ndryshuar manualisht"
                              >
                                {formatCurrency(allocAmount)}
                              </button>
                            )}
                            {allocAmount >= debt - 0.005 && allocAmount > 0 && (
                              <span className="text-xs text-green-600 dark:text-green-400">✓ paguhet plotësisht</span>
                            )}
                            {allocAmount > 0 && allocAmount < debt - 0.005 && (
                              <span className="text-xs text-amber-600 dark:text-amber-400">pjesërisht</span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Unallocated surplus */}
                    <div className="p-3 bg-muted/30">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Totali i alokuar</span>
                        <span className="font-medium">{formatCurrency(totalAllocated)}</span>
                      </div>
                      {unallocated > 0.005 && (
                        <div className="flex justify-between text-xs mt-1">
                          <span className="text-teal-600 dark:text-teal-400">Tepricë → bilanc i pacientit</span>
                          <span className="font-semibold text-teal-600 dark:text-teal-400">+{formatCurrency(unallocated)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Pure credit payment (no plans or no allocations) */}
                {!unpaidLoading && effectiveAmount > 0 && activeAllocations.length === 0 && (
                  <div className="rounded-lg border border-dashed bg-muted/20 p-3 text-sm text-center text-muted-foreground">
                    {formatCurrency(effectiveAmount)} do të ruhen si bilanc/kredit i pacientit
                  </div>
                )}
              </div>
            )}

            {/* Payment method + type */}
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="paymentMethod" render={({ field }) => (
                <FormItem>
                  <FormLabel>Mënyra e pagesës</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
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
                <FormItem>
                  <FormLabel>Lloji (opsionale)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ''}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Zgjidh llojin" /></SelectTrigger>
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
                <FormControl><Textarea rows={2} {...field} /></FormControl>
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Anulo</Button>
              <Button
                type="submit"
                disabled={mutation.isPending}
                className="gradient-teal text-white border-0"
              >
                {mutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
                {isEdit ? 'Ruaj ndryshimet' : 'Regjistro pagesën'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
