'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { paymentsApi, treatmentPlansApi, sessionsApi } from '@/lib/api';
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
import { Loader2 } from 'lucide-react';
import { formatCurrency, extractList, extractItem } from '@/lib/utils';

const NO_PLAN = '__no_plan__';

const schema = z.object({
  patientId: z.string().min(1, 'Pacienti është i detyrueshëm'),
  treatmentPlanId: z.string().optional(),
  sessionIds: z.array(z.string()).default([]),
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
  defaultSessionId?: string; // preselect a single session, e.g. from the "Paguaj" button on the Sessions table
  payment?: any; // when provided, the dialog edits this payment instead of creating a new one
}

export function PaymentFormDialog({ open, onClose, onSuccess, defaultPatientId, defaultPlanId, defaultSessionId, payment }: PaymentFormDialogProps) {
  const isEdit = !!payment;
  const [patientId, setPatientId] = useState(payment?.patientId || defaultPatientId || '');

  const { data: plansData } = useQuery({
    queryKey: ['treatment-plans-for-payment', patientId],
    queryFn: () => treatmentPlansApi.getAll({ patientId, limit: 50 }),
    enabled: !!patientId,
  });
  const plans = extractList<any>(plansData);

  const defaultValues = useMemo<FormData>(() => ({
    patientId: payment?.patientId || defaultPatientId || '',
    treatmentPlanId: payment?.treatmentPlanId || defaultPlanId || NO_PLAN,
    sessionIds: payment ? (payment.sessions || []).map((s: any) => s.id) : (defaultSessionId ? [defaultSessionId] : []),
    amount: payment ? Number(payment.amount) : (undefined as any),
    paymentMethod: payment?.paymentMethod || 'CASH',
    paymentType: payment?.paymentType || undefined,
    notes: payment?.notes || '',
  }), [payment, defaultPatientId, defaultPlanId, defaultSessionId]);

  const form = useForm<FormData>({ resolver: zodResolver(schema), defaultValues });

  useEffect(() => { if (open) { form.reset(defaultValues); setPatientId(payment?.patientId || defaultPatientId || ''); } }, [open, defaultValues, form, payment, defaultPatientId]);

  const treatmentPlanId = form.watch('treatmentPlanId');
  const selectedPlanId = treatmentPlanId && treatmentPlanId !== NO_PLAN ? treatmentPlanId : undefined;
  const selectedSessionIds = form.watch('sessionIds') || [];

  // Only completed-but-unpaid sessions are billable — once a payment marks a
  // session paid it should disappear from this picker on the next load.
  const { data: unpaidSessionsData } = useQuery({
    queryKey: ['unpaid-sessions', patientId, selectedPlanId],
    queryFn: () => sessionsApi.getAll({ patientId, treatmentPlanId: selectedPlanId, status: 'COMPLETED', isPaid: false, limit: 100 }),
    enabled: !!patientId,
  });
  // When editing, the sessions this payment already paid are (correctly)
  // excluded from the unpaid-sessions query above — but they still need to
  // appear in the picker, checked, so the user can see and unselect them.
  const unpaidSessions = useMemo(() => {
    const base = extractList<any>(unpaidSessionsData);
    if (!payment?.sessions?.length) return base;
    const extra = payment.sessions.filter((s: any) => !base.some((b: any) => b.id === s.id));
    return [...base, ...extra];
  }, [unpaidSessionsData, payment]);

  const { data: financialsData, isLoading: financialsLoading } = useQuery({
    queryKey: ['plan-financials', selectedPlanId],
    queryFn: () => paymentsApi.getPlanFinancials(selectedPlanId as string),
    enabled: !!selectedPlanId,
  });
  const financials = extractItem<any>(financialsData);

  // Recompute the amount from whichever sessions are checked — this is the
  // automatic total the spec calls for, not a one-off default. A manual
  // edit afterward is still possible (the field stays editable), but it
  // gets overwritten again the next time the selection changes.
  useEffect(() => {
    if (!selectedSessionIds.length) return;
    const total = selectedSessionIds.reduce((sum: number, id: string) => {
      const s = unpaidSessions.find((x: any) => x.id === id);
      return sum + (s?.amount ? Number(s.amount) : 0);
    }, 0);
    if (total > 0) form.setValue('amount', total);
  }, [selectedSessionIds, unpaidSessions, form]);

  const toggleSession = (id: string, checked: boolean) => {
    const current = form.getValues('sessionIds') || [];
    form.setValue('sessionIds', checked ? [...current, id] : current.filter((x) => x !== id));
  };

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const payload = {
        patientId: data.patientId,
        treatmentPlanId: selectedPlanId,
        sessionIds: data.sessionIds?.length ? data.sessionIds : undefined,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        paymentType: data.paymentType,
        notes: data.notes || undefined,
      };
      return isEdit ? paymentsApi.update(payment.id, payload) : paymentsApi.create(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Pagesa u përditësua me sukses!' : 'Pagesa u regjistrua me sukses!');
      onSuccess();
      form.reset();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Ndrysho pagesën' : 'Regjistro Pagesë të Re'}</DialogTitle>
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
                      onChange={(v) => { field.onChange(v); setPatientId(v); form.setValue('treatmentPlanId', NO_PLAN); form.setValue('sessionIds', []); }}
                      placeholder="Zgjidh pacientin"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            {patientId && (
              <FormField control={form.control} name="treatmentPlanId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Trajtimi (opsionale)</FormLabel>
                  <Select onValueChange={(v) => { field.onChange(v); form.setValue('sessionIds', []); }} value={field.value || NO_PLAN}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Zgjidh trajtimin" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_PLAN}>Pa trajtim specifik</SelectItem>
                      {plans.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.diagnosis || 'Trajtim'} — {p.completedSessions}/{p.totalSessions} seanca
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            {patientId && (
              <FormField control={form.control} name="sessionIds" render={() => (
                <FormItem>
                  <FormLabel>Seancat e papaguara (opsionale, mund të zgjedhësh disa)</FormLabel>
                  <div className="grid gap-2 border rounded-lg p-3 max-h-44 overflow-y-auto">
                    {unpaidSessions.map((s: any) => (
                      <div key={s.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`payment-session-${s.id}`}
                          checked={selectedSessionIds.includes(s.id)}
                          onCheckedChange={(checked) => toggleSession(s.id, !!checked)}
                        />
                        <label htmlFor={`payment-session-${s.id}`} className="text-sm cursor-pointer flex-1">
                          {s.sessionNumber ? `Seanca #${s.sessionNumber}` : 'Seancë'} — {formatCurrency(s.amount)}
                        </label>
                      </div>
                    ))}
                    {!unpaidSessions.length && (
                      <p className="text-sm text-muted-foreground text-center py-2">Nuk ka seanca të papaguara</p>
                    )}
                  </div>
                  {selectedSessionIds.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {selectedSessionIds.length} seanca të zgjedhura — totali llogaritet automatikisht më poshtë
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )} />
            )}

            {selectedPlanId && financialsLoading && (
              <p className="text-sm text-muted-foreground">Duke llogaritur borxhin...</p>
            )}
            {financials && (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Totali i trajtimit</span><span className="font-medium">{formatCurrency(financials.totalTreatmentValue)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Seanca të kryera</span><span className="font-medium">{financials.completedSessionsCount}/{financials.totalSessions}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Vlera e seancave të kryera</span><span className="font-medium">{formatCurrency(financials.currentEarnedAmount)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Shuma e paguar</span><span className="font-medium text-green-600">{formatCurrency(financials.totalPaidAmount)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Borxhi aktual</span><span className="font-semibold text-red-600">{formatCurrency(financials.currentDebt)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Balanca finale e mbetur</span><span className="font-medium">{formatCurrency(financials.finalRemainingBalance)}</span></div>
                {financials.prepaidAmount > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Parapagim</span><span className="font-medium text-teal-600">{formatCurrency(financials.prepaidAmount)}</span></div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="amount" render={({ field }) => (
                <FormItem>
                  <FormLabel>Shuma (€) *</FormLabel>
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
            </div>

            <FormField control={form.control} name="paymentType" render={({ field }) => (
              <FormItem>
                <FormLabel>Lloji i pagesës (opsionale)</FormLabel>
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

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Shënime</FormLabel>
                <FormControl><Textarea rows={2} {...field} /></FormControl>
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Anulo</Button>
              <Button type="submit" disabled={mutation.isPending} className="gradient-teal text-white border-0">
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
