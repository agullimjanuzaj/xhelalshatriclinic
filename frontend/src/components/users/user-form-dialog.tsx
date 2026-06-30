'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi, branchesApi } from '@/lib/api';
import { sanitizeForm } from '@/lib/sanitize-form';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';

const usernameField = z
  .string()
  .min(3, 'Emri i përdoruesit duhet të ketë të paktën 3 karaktere')
  .regex(/^[a-zA-Z0-9_.-]+$/, 'Lejohen vetëm shkronja, numra, _, . dhe -');

const baseFields = {
  username: usernameField,
  firstName: z.string().min(1, 'Emri është i detyrueshëm'),
  lastName: z.string().min(1, 'Mbiemri është i detyrueshëm'),
  phone: z.string().optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'PHYSIOTHERAPIST'] as const),
  branchIds: z.array(z.string()).optional(),
};

const createSchema = z.object({
  ...baseFields,
  password: z
    .string()
    .min(8, 'Fjalëkalimi duhet të ketë të paktën 8 karaktere')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
      message: 'Fjalëkalimi duhet të përmbajë shkronja të mëdha, të vogla dhe numra',
    }),
});

const editSchema = z.object({
  ...baseFields,
  username: usernameField.optional(),
  password: z
    .string()
    .min(8, 'Fjalëkalimi duhet të ketë të paktën 8 karaktere')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
      message: 'Fjalëkalimi duhet të përmbajë shkronja të mëdha, të vogla dhe numra',
    })
    .optional()
    .or(z.literal('')),
});

type CreateFormData = z.infer<typeof createSchema>;
type EditFormData = z.infer<typeof editSchema>;
type FormData = CreateFormData | EditFormData;

interface UserFormDialogProps {
  user?: any;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function UserFormDialog({ user, open, onClose, onSuccess }: UserFormDialogProps) {
  const isEdit = !!user;
  const queryClient = useQueryClient();

  const { data: branchesData } = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchesApi.getAll(),
  staleTime: 5 * 60_000,
  });
  const branches = (branchesData as any)?.data || [];

  const defaultBranchIds = user?.userBranches?.map((ub: any) => ub.branchId) || [];

  const form = useForm<FormData>({
    resolver: zodResolver(isEdit ? editSchema : createSchema),
    defaultValues: {
      username: user?.username || '',
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      password: '',
      phone: user?.phone || '',
      role: user?.role || 'PHYSIOTHERAPIST',
      branchIds: defaultBranchIds,
    },
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const payload = sanitizeForm(data);
      payload.branchIds = (data as any).branchIds ?? [];
      return isEdit ? usersApi.update(user.id, payload) : usersApi.create(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Përdoruesi u përditësua!' : 'Përdoruesi u krijua!');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['managers'] });
      queryClient.invalidateQueries({ queryKey: ['physiotherapists'] });
      onSuccess();
      form.reset();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const watchedBranchIds = form.watch('branchIds') || [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edito Përdoruesin' : 'Krijo Përdorues të Ri'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
            <FormField control={form.control} name="username" render={({ field }) => (
              <FormItem>
                <FormLabel>Emri i përdoruesit {!isEdit && '*'}</FormLabel>
                <FormControl>
                  <Input
                    placeholder="p.sh. fizio_arta"
                    autoComplete="username"
                    disabled={isEdit}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="firstName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Emri *</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="lastName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Mbiemri *</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="password" render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {isEdit ? 'Fjalëkalimi i ri (lini bosh për të mos ndryshuar)' : 'Fjalëkalimi *'}
                </FormLabel>
                <FormControl>
                  <Input type="password" placeholder="Minimum 8 karaktere" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefoni</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel>Roli *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ADMIN">Administrator</SelectItem>
                      <SelectItem value="MANAGER">Menaxher</SelectItem>
                      <SelectItem value="PHYSIOTHERAPIST">Fizioterapist</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="branchIds" render={({ field }) => (
              <FormItem>
                <FormLabel>Degët</FormLabel>
                <div className="space-y-2 border rounded-lg p-3">
                  {branches.length === 0 && (
                    <p className="text-xs text-muted-foreground">Duke ngarkuar degët...</p>
                  )}
                  {branches.map((b: any) => (
                    <div key={b.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`branch-${b.id}`}
                        checked={watchedBranchIds.includes(b.id)}
                        onCheckedChange={(checked) => {
                          const current = field.value || [];
                          field.onChange(
                            checked ? [...current, b.id] : current.filter((id) => id !== b.id),
                          );
                        }}
                      />
                      <label htmlFor={`branch-${b.id}`} className="text-sm cursor-pointer">{b.name}</label>
                    </div>
                  ))}
                </div>
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Anulo</Button>
              <Button type="submit" disabled={mutation.isPending} className="gradient-teal text-white border-0">
                {mutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
                {isEdit ? 'Ruaj' : 'Krijo'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
