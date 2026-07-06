'use client';

import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { sessionsApi } from '@/lib/api';
import { ROUTES } from '@/lib/routes';
import { formatDate, formatCurrency, getTreatmentTypeLabel } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SessionBadge } from '@/components/ui/session-badge';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { printSessionReport, shareSessionReport } from '@/lib/invoice';
import { toast } from 'sonner';
import {
  ArrowLeft, Printer, Share2, User, Phone, Building2,
  Calendar, FileText, MessageSquare, Stethoscope,
  CheckCircle2, XCircle, CreditCard, Loader2, ClipboardCheck,
} from 'lucide-react';

const completeSchema = z.object({
  notes: z.string().optional(),
  painLevel: z.string().optional(),
  duration: z.string().optional(),
  recommendations: z.string().optional(),
});
type CompleteFormData = z.infer<typeof completeSchema>;

function SectionCard({ title, icon, children }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-widest">
        {icon}{title}
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs text-muted-foreground min-w-[110px] pt-0.5 shrink-0">{label}</span>
      <span className="text-sm font-medium flex-1 break-words">{value ?? '—'}</span>
    </div>
  );
}

export default function SessionDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: authSession } = useSession();
  const role = authSession?.user?.role;
  const userId = authSession?.user?.id;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['session-detail-page', id],
    queryFn: () => sessionsApi.getOne(id),
    retry: false,
  });

  // API interceptor already extracts response.data — `data` IS the session object directly
  const session = data as any;
  const patient = session?.patient;
  const physio = session?.physiotherapist || session?.completedByUser;

  const form = useForm<CompleteFormData>({
    resolver: zodResolver(completeSchema),
    defaultValues: { notes: '', painLevel: '', duration: '', recommendations: '' },
  });

  const completeMutation = useMutation({
    mutationFn: (d: CompleteFormData) =>
      sessionsApi.complete(id, {
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
      router.push(ROUTES.sessions);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canComplete =
    session?.status !== 'COMPLETED' &&
    (role === 'ADMIN' ||
      (role === 'PHYSIOTHERAPIST' && session?.physiotherapistId === userId));

  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(ROUTES.sessions);
    }
  };

  return (
    <div className="min-h-full -m-4 lg:-m-6 flex flex-col">

      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b px-4 lg:px-6 py-3 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            onClick={goBack}
            aria-label="Kthehu"
          >
            <ArrowLeft size={18} />
          </Button>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">Trajtim</p>
            {!isLoading && patient && (
              <p className="text-xs text-muted-foreground truncate">
                {patient.firstName} {patient.lastName}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 sm:w-auto sm:px-3 gap-1.5"
            onClick={() => printSessionReport(id)}
          >
            <Printer size={15} />
            <span className="hidden sm:inline text-xs">Printo</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 sm:w-auto sm:px-3 gap-1.5"
            onClick={() => shareSessionReport(id, patient?.firstName, patient?.lastName)}
          >
            <Share2 size={15} />
            <span className="hidden sm:inline text-xs">Ndaj</span>
          </Button>
        </div>
      </div>

      {/* Page content */}
      <div className="flex-1 p-4 lg:p-6">
        {isLoading ? (
          <div className="space-y-4 max-w-[1200px] mx-auto">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border p-4 space-y-3">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))}
          </div>
        ) : isError || !session ? (
          <div className="text-center py-20 space-y-4">
            <p className="text-muted-foreground">Trajtimi nuk u gjet ose nuk keni qasje.</p>
            <Button variant="outline" onClick={() => router.push(ROUTES.sessions)}>
              Kthehu te trajtimet
            </Button>
          </div>
        ) : (
          <div className="max-w-[1200px] mx-auto space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* ── Left column ────────────────────────────────── */}
              <div className="space-y-4">

                {/* Session info */}
                <SectionCard title="Informacioni i trajtimit" icon={<User size={13} />}>
                  <div className="space-y-2">
                    <InfoRow
                      label="Pacienti"
                      value={`${patient?.firstName || ''} ${patient?.lastName || ''}`.trim() || null}
                    />
                    {patient?.phone && (
                      <InfoRow
                        label="Telefoni"
                        value={
                          <a
                            href={`tel:${patient.phone}`}
                            className="flex items-center gap-1 hover:text-teal-600 transition-colors"
                          >
                            <Phone size={12} className="text-muted-foreground" />
                            {patient.phone}
                          </a>
                        }
                      />
                    )}
                    <InfoRow
                      label="Dega"
                      value={session.branch?.name ? (
                        <span className="flex items-center gap-1">
                          <Building2 size={12} className="text-muted-foreground" />
                          {session.branch.name}
                        </span>
                      ) : null}
                    />
                    {physio && (
                      <InfoRow
                        label="Fizioterapeuti"
                        value={`${physio.firstName} ${physio.lastName}`}
                      />
                    )}
                    <InfoRow
                      label="Data"
                      value={
                        <span className="flex items-center gap-1">
                          <Calendar size={12} className="text-muted-foreground" />
                          {formatDate(session.completedAt || session.scheduledAt || session.createdAt)}
                        </span>
                      }
                    />
                    {session.sessionNumber && session.treatmentPlan && (
                      <InfoRow
                        label="Progresi"
                        value={`Seanca ${session.sessionNumber} nga ${session.treatmentPlan.totalSessions}`}
                      />
                    )}
                  </div>
                </SectionCard>

                {/* Status & payment */}
                <SectionCard title="Statusi & Pagesa" icon={<CreditCard size={13} />}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <SessionBadge status={session.status} />
                    {session.isPaid ? (
                      <span className="flex items-center gap-1 text-sm text-green-600 font-medium">
                        <CheckCircle2 size={14} />Paguar
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-sm text-orange-500 font-medium">
                        <XCircle size={14} />Pa paguar
                      </span>
                    )}
                    {session.amount != null && (
                      <span className="ml-auto text-base font-bold">
                        {formatCurrency(session.amount)}
                      </span>
                    )}
                  </div>
                  {session.duration && (
                    <InfoRow label="Kohëzgjatja" value={`${session.duration} min`} />
                  )}
                  {session.painLevel && (
                    <InfoRow label="Niveli i dhimbjes" value={`${session.painLevel}/10`} />
                  )}
                </SectionCard>

              </div>

              {/* ── Right column ───────────────────────────────── */}
              <div className="space-y-4">

                {/* Treatment types */}
                {session.treatmentTypes?.length > 0 && (
                  <SectionCard title="Llojet e trajtimit" icon={<Stethoscope size={13} />}>
                    <div className="flex flex-wrap gap-1.5">
                      {session.treatmentTypes.map((t: string) => (
                        <Badge key={t} variant="outline" className="text-xs">
                          {getTreatmentTypeLabel(t)}
                        </Badge>
                      ))}
                    </div>
                  </SectionCard>
                )}

                {/* Notes */}
                {session.notes && (
                  <SectionCard title="Shënim i shkurtër" icon={<FileText size={13} />}>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{session.notes}</p>
                  </SectionCard>
                )}

                {/* Recommendations */}
                {session.recommendations && (
                  <SectionCard title="Rekomandimet" icon={<MessageSquare size={13} />}>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {session.recommendations}
                    </p>
                  </SectionCard>
                )}
              </div>
            </div>

            {/* Complete session form — full width, shown only if authorized */}
            {canComplete && (
              <div className="rounded-xl border bg-card p-4 sm:p-5 space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  <ClipboardCheck size={13} />
                  Kompletoni trajtimin
                </div>
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit((d) => completeMutation.mutate(d))}
                    className="space-y-4"
                  >
                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Shënim i shkurtër</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Si shkoi trajtimi..." rows={3} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="painLevel"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Niveli i dhimbjes (1-10)</FormLabel>
                            <FormControl>
                              <Input type="number" min={1} max={10} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="duration"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Kohëzgjatja (min)</FormLabel>
                            <FormControl>
                              <Input type="number" min={1} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="recommendations"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Rekomandime</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Rekomandime pas trajtimit..."
                              rows={3}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-end gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => router.push(ROUTES.sessions)}
                      >
                        Anulo
                      </Button>
                      <Button
                        type="submit"
                        disabled={completeMutation.isPending}
                        className="gradient-teal text-white border-0"
                      >
                        {completeMutation.isPending && (
                          <Loader2 size={14} className="mr-2 animate-spin" />
                        )}
                        Kompletoje
                      </Button>
                    </div>
                  </form>
                </Form>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
