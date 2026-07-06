'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { patientsApi, branchesApi } from '@/lib/api';
import { sanitizeForm } from '@/lib/sanitize-form';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { ROUTES } from '@/lib/routes';

const schema = z.object({
  firstName: z.string().min(1, 'Emri është i detyrueshëm'),
  lastName: z.string().min(1, 'Mbiemri është i detyrueshëm'),
  phone: z.string().min(1, 'Numri i telefonit është i detyrueshëm'),
  address: z.string().optional(),
  birthDate: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE']).optional(),
  notes: z.string().optional(),
  branchId: z.string().min(1, 'Dega është e detyrueshme'),
});

type FormData = z.infer<typeof schema>;

export default function NewPatientPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  const role = session?.user?.role;
  const isManager = role === 'MANAGER';
  const managerBranchId = session?.user?.userBranches?.[0]?.branchId;
  const managerBranchName = session?.user?.userBranches?.[0]?.branch?.name;

  const { data: branchesData } = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchesApi.getAll(),
    staleTime: 5 * 60_000,
    enabled: !isManager,
  });
  const branches = (branchesData as any)?.data || [];

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { branchId: '' },
  });

  // Session is async — form initializes before it loads. Once we have the
  // manager's branch, inject it so the field is never submitted empty.
  useEffect(() => {
    if (isManager && managerBranchId) {
      form.setValue('branchId', managerBranchId, { shouldValidate: true });
    }
  }, [isManager, managerBranchId, form]);

  const mutation = useMutation({
    mutationFn: (data: FormData) => patientsApi.create(sanitizeForm(data)),
    onSuccess: () => {
      toast.success('Pacienti u regjistrua me sukses!');
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      router.push(ROUTES.patients);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={ROUTES.patients}><ArrowLeft size={16} />Kthehu</Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold text-foreground">Regjistro Pacient të Ri</h1>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Të dhënat e pacientit</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="firstName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Emri *</FormLabel>
                    <FormControl><Input placeholder="Agron" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="lastName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mbiemri *</FormLabel>
                    <FormControl><Input placeholder="Hasani" {...field} /></FormControl>
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

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="birthDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data e lindjes</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
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
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="address" render={({ field }) => (
                <FormItem>
                  <FormLabel>Adresa</FormLabel>
                  <FormControl><Input placeholder="Rr. Nënë Tereza, Prishtinë" {...field} /></FormControl>
                </FormItem>
              )} />

              {isManager ? (
                // Manager's branch is always their own — shown read-only so
                // they know which branch the patient will be registered to.
                <FormItem>
                  <FormLabel>Dega</FormLabel>
                  <Input value={managerBranchName || 'Duke ngarkuar...'} disabled className="bg-muted" />
                </FormItem>
              ) : (
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
              )}

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Shënime</FormLabel>
                  <FormControl><Textarea placeholder="Shënime shtesë..." rows={3} {...field} /></FormControl>
                </FormItem>
              )} />

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" asChild>
                  <Link href={ROUTES.patients}>Anulo</Link>
                </Button>
                <Button
                  type="submit"
                  disabled={mutation.isPending || (isManager && !managerBranchId)}
                  className="gradient-teal text-white border-0"
                >
                  {mutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
                  Regjistro pacientin
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
