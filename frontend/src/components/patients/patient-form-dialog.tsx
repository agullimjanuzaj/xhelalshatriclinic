'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { patientsApi, branchesApi } from '@/lib/api';
import { sanitizeForm } from '@/lib/sanitize-form';
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
import { Loader2 } from 'lucide-react';

const schema = z.object({
  firstName: z.string().min(1, 'Emri është i detyrueshëm'),
  lastName: z.string().min(1, 'Mbiemri është i detyrueshëm'),
  phone: z.string().min(1, 'Numri i telefonit është i detyrueshëm'),
  address: z.string().optional(),
  birthDate: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE']).optional(),
  notes: z.string().optional(),
  branchId: z.string().min(1, 'Dega është e detyrueshme'),
  // activeInClinic is managed via the dedicated toggle in the patient list,
  // not through this general edit form — prevents inconsistent state updates.
  activeInClinic: z.boolean().optional(),
});

type FormData = z.infer<typeof schema>;

interface PatientFormDialogProps {
  patient?: any;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function PatientFormDialog({ patient, open, onClose, onSuccess }: PatientFormDialogProps) {
  const isEdit = !!patient;

  const { data: branchesData } = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchesApi.getAll(),
  staleTime: 5 * 60_000,
  });
  const branches = (branchesData as any)?.data || [];

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: patient?.firstName || '',
      lastName: patient?.lastName || '',
      phone: patient?.phone || '',
      address: patient?.address || '',
      birthDate: patient?.birthDate ? patient.birthDate.split('T')[0] : '',
      gender: patient?.gender || undefined,
      notes: patient?.notes || '',
      branchId: patient?.branchId || '',
      activeInClinic: patient?.activeInClinic ?? true,
    },
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const payload = sanitizeForm(data);
      // activeInClinic is managed via the dedicated patient-list toggle —
      // strip it from the general edit payload to avoid corrupting state.
      if (isEdit) delete (payload as any).activeInClinic;
      return isEdit ? patientsApi.update(patient.id, payload) : patientsApi.create(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Pacienti u përditësua!' : 'Pacienti u regjistrua!');
      onSuccess();
      form.reset();
    },
    onError: (err: Error) => toast.error(err.message || 'Ndodhi një gabim gjatë ruajtjes'),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edito Pacientin' : 'Regjistro Pacient të Ri'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="firstName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Emri *</FormLabel>
                  <FormControl><Input placeholder="Emri" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="lastName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Mbiemri *</FormLabel>
                  <FormControl><Input placeholder="Mbiemri" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="phone" render={({ field }) => (
              <FormItem>
                <FormLabel>Numri i telefonit *</FormLabel>
                <FormControl><Input placeholder="+383 44 123 456" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="birthDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Data e lindjes</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="gender" render={({ field }) => (
                <FormItem>
                  <FormLabel>Gjinia</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Zgjidh" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="MALE">Mashkull</SelectItem>
                      <SelectItem value="FEMALE">Femër</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="address" render={({ field }) => (
              <FormItem>
                <FormLabel>Adresa</FormLabel>
                <FormControl><Input placeholder="Rr. Nënë Tereza, Prishtinë" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="branchId" render={({ field }) => (
              <FormItem>
                <FormLabel>Dega *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Zgjidh degën" /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {branches.map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            {!isEdit && (
              <FormField control={form.control} name="activeInClinic" render={({ field }) => (
                <FormItem className="flex items-center gap-2 rounded-lg border p-3">
                  <FormControl>
                    <Checkbox checked={!!field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0 cursor-pointer">Aktiv në klinikë tani (pacienti është fizikisht në klinikë)</FormLabel>
                </FormItem>
              )} />
            )}

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Shënime</FormLabel>
                <FormControl>
                  <Textarea placeholder="Shënime shtesë..." rows={3} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Anulo</Button>
              <Button type="submit" disabled={mutation.isPending} className="gradient-teal text-white border-0">
                {mutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
                {isEdit ? 'Ruaj ndryshimet' : 'Regjistro pacientin'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
