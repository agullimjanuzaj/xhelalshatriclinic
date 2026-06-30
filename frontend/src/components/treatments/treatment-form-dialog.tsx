'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { treatmentsApi, patientsApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { getTreatmentTypeLabel, getSymptomLabel } from '@/lib/utils';

const TREATMENT_TYPES = [
  'DRY_NEEDLING', 'ELECTROTHERAPY', 'ULTRASOUND', 'LASER_THERAPY',
  'SHOCKWAVE_THERAPY', 'MANUAL_THERAPY', 'THERAPEUTIC_MASSAGE',
  'KINESIO_TAPING', 'THERAPEUTIC_EXERCISES', 'JOINT_MOBILIZATION',
];

const SYMPTOMS = [
  'NECK_PAIN', 'LOWER_BACK_PAIN', 'SHOULDER_PAIN', 'KNEE_PAIN',
  'LEG_NUMBNESS', 'ARM_NUMBNESS', 'LIMITED_MOBILITY', 'MUSCLE_WEAKNESS',
];

const schema = z.object({
  patientId: z.string().min(1, 'Pacienti është i detyrueshëm'),
  treatmentTypes: z.array(z.string()).min(1, 'Zgjidh të paktën një trajtim'),
  symptoms: z.array(z.string()).optional(),
  painLevel: z.number().min(1).max(10).optional(),
  duration: z.number().optional(),
  notes: z.string().optional(),
  recommendations: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface TreatmentFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultPatientId?: string;
}

export function TreatmentFormDialog({ open, onClose, onSuccess, defaultPatientId }: TreatmentFormDialogProps) {
  const { data: patientsData } = useQuery({
    queryKey: ['patients-select'],
    queryFn: () => patientsApi.getAll({ limit: 200 }),
  });
  const patients = (patientsData as any)?.data || [];

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      patientId: defaultPatientId || '',
      treatmentTypes: [],
      symptoms: [],
    },
  });

  const watchedTypes = form.watch('treatmentTypes') || [];
  const watchedSymptoms = form.watch('symptoms') || [];

  const mutation = useMutation({
    mutationFn: (data: FormData) => treatmentsApi.create(data),
    onSuccess: () => {
      toast.success('Trajtimi u regjistrua me sukses!');
      onSuccess();
      form.reset();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Regjistro Trajtim të Ri</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-5">
            {/* Patient */}
            <FormField control={form.control} name="patientId" render={({ field }) => (
              <FormItem>
                <FormLabel>Pacienti *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Zgjidh pacientin" /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {patients.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.firstName} {p.lastName} — {p.phone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            {/* Treatment types */}
            <FormField control={form.control} name="treatmentTypes" render={({ field }) => (
              <FormItem>
                <FormLabel>Llojet e trajtimit *</FormLabel>
                <div className="grid grid-cols-2 gap-2 border rounded-lg p-3">
                  {TREATMENT_TYPES.map((type) => (
                    <div key={type} className="flex items-center gap-2">
                      <Checkbox
                        id={`type-${type}`}
                        checked={watchedTypes.includes(type)}
                        onCheckedChange={(checked) => {
                          const current = field.value || [];
                          field.onChange(checked ? [...current, type] : current.filter((t) => t !== type));
                        }}
                      />
                      <label htmlFor={`type-${type}`} className="text-sm cursor-pointer">
                        {getTreatmentTypeLabel(type)}
                      </label>
                    </div>
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )} />

            {/* Symptoms */}
            <FormField control={form.control} name="symptoms" render={({ field }) => (
              <FormItem>
                <FormLabel>Simptomat (opsionale — për sugjerime automatike)</FormLabel>
                <div className="grid grid-cols-2 gap-2 border rounded-lg p-3">
                  {SYMPTOMS.map((s) => (
                    <div key={s} className="flex items-center gap-2">
                      <Checkbox
                        id={`sym-${s}`}
                        checked={watchedSymptoms.includes(s)}
                        onCheckedChange={(checked) => {
                          const current = field.value || [];
                          field.onChange(checked ? [...current, s] : current.filter((x) => x !== s));
                        }}
                      />
                      <label htmlFor={`sym-${s}`} className="text-sm cursor-pointer">{getSymptomLabel(s)}</label>
                    </div>
                  ))}
                </div>
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="painLevel" render={({ field }) => (
                <FormItem>
                  <FormLabel>Niveli i dhembjes (1-10)</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} max={10} placeholder="5"
                      {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || undefined)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="duration" render={({ field }) => (
                <FormItem>
                  <FormLabel>Kohëzgjatja (min)</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} placeholder="45"
                      {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || undefined)} />
                  </FormControl>
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Shënime</FormLabel>
                <FormControl><Textarea rows={2} placeholder="Observime..." {...field} /></FormControl>
              </FormItem>
            )} />

            <FormField control={form.control} name="recommendations" render={({ field }) => (
              <FormItem>
                <FormLabel>Rekomandime</FormLabel>
                <FormControl><Textarea rows={2} placeholder="Ushtrime në shtëpi, kujdes..." {...field} /></FormControl>
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Anulo</Button>
              <Button type="submit" disabled={mutation.isPending} className="gradient-teal text-white border-0">
                {mutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
                Regjistro trajtimin
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
