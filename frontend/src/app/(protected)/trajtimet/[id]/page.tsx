'use client';

import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { sessionsApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SessionBadge } from '@/components/ui/session-badge';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime } from '@/lib/utils';
import { toast } from 'sonner';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { getSessionsPath } from '@/lib/routes';

const completeSchema = z.object({
  notes: z.string().optional(),
  painLevel: z.string().optional(),
  duration: z.string().optional(),
  recommendations: z.string().optional(),
});

type CompleteFormData = z.infer<typeof completeSchema>;
const completeDefaults: CompleteFormData = { notes: '', painLevel: '', duration: '', recommendations: '' };

export default function SessionDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: authSession } = useSession();
  const role = authSession?.user?.role;
  const userId = authSession?.user?.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ['session', id],
    queryFn: () => sessionsApi.getOne(id),
    retry: false,
  });
  const sessionData = (data as any)?.data;

  const form = useForm<CompleteFormData>({ resolver: zodResolver(completeSchema), defaultValues: completeDefaults });

  const completeMutation = useMutation({
    mutationFn: (d: CompleteFormData) => sessionsApi.complete(id, {
      notes: d.notes || undefined,
      painLevel: d.painLevel ? Number(d.painLevel) : undefined,
      duration: d.duration ? Number(d.duration) : undefined,
      recommendations: d.recommendations || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['sessions-physio'] });
      queryClient.invalidateQueries({ queryKey: ['sessions-manager'] });
      queryClient.invalidateQueries({ queryKey: ['treatment-plans'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
      toast.success('Trajtimi u kompletua me sukses!');
      router.push(getSessionsPath(role));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <LoadingSkeleton type="cards" rows={3} />;

  if (error || !sessionData) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-muted-foreground">Trajtimi nuk u gjet ose nuk keni qasje.</p>
        <Button asChild>
          <Link href={getSessionsPath(role)}>Kthehu te trajtimet</Link>
        </Button>
      </div>
    );
  }

  const canComplete =
    sessionData.status !== 'COMPLETED' &&
    (role === 'ADMIN' || (role === 'PHYSIOTHERAPIST' && sessionData.physiotherapistId === userId));

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href={getSessionsPath(role)}><ArrowLeft size={16} />Kthehu te trajtimet</Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>{sessionData.sessionNumber ? `Trajtimi #${sessionData.sessionNumber}` : 'Trajtim pa plan kontrolle'}</span>
            <SessionBadge status={sessionData.status} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="text-muted-foreground">Pacienti:</span> {sessionData.patient?.firstName} {sessionData.patient?.lastName}</p>
          <p><span className="text-muted-foreground">Dega:</span> {sessionData.branch?.name}</p>
          <p><span className="text-muted-foreground">Fizioterapeuti:</span> {(sessionData.physiotherapist || sessionData.completedByUser) ? `${(sessionData.physiotherapist || sessionData.completedByUser).firstName} ${(sessionData.physiotherapist || sessionData.completedByUser).lastName}` : 'Nuk është caktuar'}</p>
          <p><span className="text-muted-foreground">Data:</span> {sessionData.scheduledAt ? formatDateTime(sessionData.scheduledAt) : 'Pa datë/orë'}</p>
          {sessionData.treatmentPlan && (
            <p>
              <span className="text-muted-foreground">Plani:</span>{' '}
              {sessionData.treatmentPlan.completedSessions}/{sessionData.treatmentPlan.totalSessions} trajtime
              {' '}({sessionData.treatmentPlan.totalSessions - sessionData.treatmentPlan.completedSessions} mbetur)
            </p>
          )}
          {sessionData.notes && <p><span className="text-muted-foreground">Shënime:</span> {sessionData.notes}</p>}
          {sessionData.painLevel && <p><span className="text-muted-foreground">Niveli i dhimbjes:</span> {sessionData.painLevel}/10</p>}
          {sessionData.duration && <p><span className="text-muted-foreground">Kohëzgjatja:</span> {sessionData.duration} min</p>}
          {sessionData.recommendations && <p><span className="text-muted-foreground">Rekomandime:</span> {sessionData.recommendations}</p>}
        </CardContent>
      </Card>

      {canComplete && (
        <Card>
          <CardHeader><CardTitle className="text-base">Kompletoni trajtimin</CardTitle></CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((d) => completeMutation.mutate(d))} className="space-y-4">
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shënim i shkurtër</FormLabel>
                    <FormControl><Textarea placeholder="Si shkoi trajtimi..." rows={2} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="painLevel" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Niveli i dhimbjes (1-10)</FormLabel>
                      <FormControl><Input type="number" min={1} max={10} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="duration" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kohëzgjatja (min)</FormLabel>
                      <FormControl><Input type="number" min={1} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="recommendations" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rekomandime</FormLabel>
                    <FormControl><Textarea placeholder="Rekomandime pas trajtimit..." rows={2} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => router.push(getSessionsPath(role))}>Anulo</Button>
                  <Button type="submit" disabled={completeMutation.isPending} className="gradient-teal text-white border-0">
                    {completeMutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
                    Kompletoje
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
