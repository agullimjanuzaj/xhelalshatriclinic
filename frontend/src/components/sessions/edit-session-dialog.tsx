'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionsApi } from '@/lib/api';
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

const schema = z.object({
  notes: z.string().optional(),
  recommendations: z.string().optional(),
  treatmentTypes: z.array(z.string()).default([]),
  scheduledAt: z.string().optional(),
  status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
});

type FormData = z.infer<typeof schema>;

interface EditSessionDialogProps {
  open: boolean;
  onClose: () => void;
  session: any;
  isAdmin: boolean;
}

function toLocalInputValue(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EditSessionDialog({ open, onClose, session, isAdmin }: EditSessionDialogProps) {
  const queryClient = useQueryClient();
  const [priceAmount, setPriceAmount] = useState('');
  const [priceReason, setPriceReason] = useState('');

  useEffect(() => {
    if (open) { setPriceAmount(session?.amount != null ? String(session.amount) : ''); setPriceReason(''); }
  }, [open, session]);

  const invalidateFinancials = () => {
    queryClient.invalidateQueries({ queryKey: ['sessions'] });
    queryClient.invalidateQueries({ queryKey: ['sessions-physio'] });
    queryClient.invalidateQueries({ queryKey: ['sessions-manager'] });
    queryClient.invalidateQueries({ queryKey: ['treatment-plans'] });
    queryClient.invalidateQueries({ queryKey: ['patients'] });
    queryClient.invalidateQueries({ queryKey: ['payment-debts'] });
    queryClient.invalidateQueries({ queryKey: ['outstanding-balances'] });
    queryClient.invalidateQueries({ queryKey: ['report-overview'] });
  };

  const priceMutation = useMutation({
    mutationFn: () => sessionsApi.updatePrice(session.id, { amount: Number(priceAmount), reason: priceReason || undefined }),
    onSuccess: () => { toast.success('Çmimi i seancës u përditësua!'); invalidateFinancials(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const defaultValues = useMemo<FormData>(() => ({
    notes: session?.notes || '',
    recommendations: session?.recommendations || '',
    treatmentTypes: session?.treatmentTypes || [],
    scheduledAt: toLocalInputValue(session?.scheduledAt),
    status: session?.status || 'SCHEDULED',
  }), [session]);

  const form = useForm<FormData>({ resolver: zodResolver(schema), defaultValues });

  useEffect(() => { if (open) form.reset(defaultValues); }, [open, defaultValues, form]);

  const watchedTypes = form.watch('treatmentTypes') || [];
  const watchedNotes = form.watch('notes') || '';

  const mutation = useMutation({
    mutationFn: (d: FormData) => sessionsApi.update(session.id, {
      notes: d.notes || undefined,
      recommendations: d.recommendations || undefined,
      treatmentTypes: d.treatmentTypes,
      scheduledAt: d.scheduledAt ? new Date(d.scheduledAt).toISOString() : undefined,
      ...(isAdmin ? { status: d.status } : {}),
    }),
    onSuccess: () => {
      toast.success('Seanca u përditësua me sukses!');
      invalidateFinancials();
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
            <FormField control={form.control} name="scheduledAt" render={({ field }) => (
              <FormItem>
                <FormLabel>Data dhe ora</FormLabel>
                <FormControl><Input type="datetime-local" {...field} /></FormControl>
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

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Anulo</Button>
              <Button type="submit" disabled={mutation.isPending} className="gradient-teal text-white border-0">
                {mutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
                Ruaj ndryshimet
              </Button>
            </DialogFooter>
          </form>
        </Form>

        {isAdmin && (
          <div className="rounded-lg border bg-muted/40 p-3 space-y-2 mt-2">
            <p className="text-sm font-medium">Ndrysho çmimin e kësaj seance</p>
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="number" step="0.01" min="0" placeholder="Çmimi (€)"
                value={priceAmount} onChange={(e) => setPriceAmount(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                disabled={priceMutation.isPending || !priceAmount}
                onClick={() => priceMutation.mutate()}
              >
                {priceMutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
                Ruaj çmimin
              </Button>
            </div>
            <Textarea
              rows={2} placeholder="Arsyeja e ndryshimit (opsionale)"
              value={priceReason} onChange={(e) => setPriceReason(e.target.value)}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
