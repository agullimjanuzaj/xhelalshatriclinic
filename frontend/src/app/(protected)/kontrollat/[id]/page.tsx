'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { treatmentPlansApi } from '@/lib/api';
import { ROUTES } from '@/lib/routes';
import { formatDate, formatCurrency, getTreatmentTypeLabel } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PaymentBadge } from '@/components/ui/payment-badge';
import { printTreatmentPlan, shareTreatmentPlan } from '@/lib/invoice';
import {
  ArrowLeft, Printer, Share2, User, Phone, Building2,
  HeartPulse, Stethoscope, FileText, Calendar,
  CheckCircle2, Circle,
} from 'lucide-react';

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

export default function TreatmentPlanDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['treatment-plan-detail', id],
    queryFn: () => treatmentPlansApi.getOne(id),
    retry: false,
  });

  // API interceptor extracts response.data (HTTP body), but the global
  // TransformInterceptor wraps every response as { success, data } — so the
  // actual plan object is one level deeper at .data.
  const plan = (data as any)?.data;
  const patient = plan?.patient;
  const allSessions = plan?.sessions || [];

  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(ROUTES.treatments);
    }
  };

  return (
    // -m-4 lg:-m-6 undoes the parent <main> padding so header can be truly full-width
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
            <p className="text-sm font-semibold leading-tight">Kontrollë</p>
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
            onClick={() => printTreatmentPlan(id)}
          >
            <Printer size={15} />
            <span className="hidden sm:inline text-xs">Printo</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 sm:w-auto sm:px-3 gap-1.5"
            onClick={() => shareTreatmentPlan(id, patient?.firstName, patient?.lastName)}
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
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-xl border p-4 space-y-3">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))}
          </div>
        ) : isError || !plan ? (
          <div className="text-center py-20 space-y-4">
            <p className="text-muted-foreground">Kontrolla nuk u gjet ose nuk keni qasje.</p>
            <Button variant="outline" onClick={() => router.push(ROUTES.treatments)}>
              Kthehu te kontrollat
            </Button>
          </div>
        ) : (
          <div className="max-w-[1200px] mx-auto space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* ── Left column ────────────────────────────────── */}
              <div className="space-y-4">

                {/* Patient info */}
                <SectionCard title="Informacioni i pacientit" icon={<User size={13} />}>
                  <div className="space-y-2">
                    <InfoRow
                      label="Emri"
                      value={`${patient?.firstName || ''} ${patient?.lastName || ''}`.trim() || null}
                    />
                    <InfoRow
                      label="Telefoni"
                      value={patient?.phone ? (
                        <a
                          href={`tel:${patient.phone}`}
                          className="flex items-center gap-1 hover:text-teal-600 transition-colors"
                        >
                          <Phone size={12} className="text-muted-foreground" />
                          {patient.phone}
                        </a>
                      ) : null}
                    />
                    <InfoRow
                      label="Dega"
                      value={plan.branch?.name ? (
                        <span className="flex items-center gap-1">
                          <Building2 size={12} className="text-muted-foreground" />
                          {plan.branch.name}
                        </span>
                      ) : null}
                    />
                    <InfoRow label="Data e fillimit" value={formatDate(plan.startDate)} />
                    {plan.endDate && (
                      <InfoRow label="Data e mbarimit" value={formatDate(plan.endDate)} />
                    )}
                    {plan.assignedPhysiotherapist && (
                      <InfoRow
                        label="Fizioterapeuti"
                        value={`${plan.assignedPhysiotherapist.firstName} ${plan.assignedPhysiotherapist.lastName}`}
                      />
                    )}
                    <InfoRow label="Pagesa" value={<PaymentBadge status={plan.paymentStatus} />} />
                  </div>
                </SectionCard>

                {/* Complaints */}
                {(plan.complaints?.length > 0 || plan.complaintDescription) && (
                  <SectionCard title="Ankesat kryesore" icon={<HeartPulse size={13} />}>
                    {plan.complaints?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {plan.complaints.map((c: string) => (
                          <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
                        ))}
                      </div>
                    )}
                    {plan.complaintDescription && (
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {plan.complaintDescription}
                      </p>
                    )}
                  </SectionCard>
                )}

                {/* Suggested conditions */}
                {plan.selectedDiagnoses?.length > 0 && (
                  <SectionCard title="Gjendja e sugjeruar" icon={<Stethoscope size={13} />}>
                    <div className="flex flex-wrap gap-1.5">
                      {plan.selectedDiagnoses.map((d: string) => (
                        <Badge
                          key={d}
                          className="text-xs bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800"
                        >
                          {d}
                        </Badge>
                      ))}
                    </div>
                    {plan.diagnosis && (
                      <p className="text-sm text-muted-foreground mt-1">{plan.diagnosis}</p>
                    )}
                  </SectionCard>
                )}

                {/* Diagnosis only */}
                {!plan.selectedDiagnoses?.length && plan.diagnosis && (
                  <SectionCard title="Diagnoza" icon={<Stethoscope size={13} />}>
                    <p className="text-sm">{plan.diagnosis}</p>
                  </SectionCard>
                )}
              </div>

              {/* ── Right column ───────────────────────────────── */}
              <div className="space-y-4">

                {/* Treatment plan */}
                <SectionCard title="Plani i trajtimit" icon={<FileText size={13} />}>
                  {plan.treatmentTypes?.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">Llojet e trajtimit</p>
                      <div className="flex flex-wrap gap-1.5">
                        {plan.treatmentTypes.map((t: string) => (
                          <Badge key={t} variant="outline" className="text-xs">
                            {getTreatmentTypeLabel(t)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <div className="rounded-lg bg-muted/50 p-3 text-center">
                      <p className="text-2xl font-bold text-teal-600">
                        {plan.completedSessions}/{plan.totalSessions}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">Seanca</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3 text-center">
                      <p className="text-xl font-bold">
                        {formatCurrency(plan.amountPaid || 0)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        / {formatCurrency(plan.totalAmount || 0)}
                      </p>
                    </div>
                  </div>

                  <InfoRow label="Çmimi/seancë" value={formatCurrency(plan.sessionFee || 0)} />

                  {plan.notes && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Shënimet e planit</p>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{plan.notes}</p>
                    </div>
                  )}
                </SectionCard>

                {/* Sessions timeline */}
                {allSessions.length > 0 && (
                  <SectionCard title="Historiku i seancave" icon={<Calendar size={13} />}>
                    <div className="space-y-0">
                      {allSessions.map((s: any, idx: number) => (
                        <div
                          key={s.id}
                          className="flex items-start gap-3 py-2.5 border-b last:border-0"
                        >
                          <div className="mt-0.5 shrink-0">
                            {s.status === 'COMPLETED' ? (
                              <CheckCircle2 size={15} className="text-teal-500" />
                            ) : (
                              <Circle size={15} className="text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">
                              Seanca #{s.sessionNumber || (allSessions.length - idx)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(s.completedAt || s.scheduledAt || s.createdAt)}
                              {s.physiotherapist &&
                                ` · ${s.physiotherapist.firstName} ${s.physiotherapist.lastName}`}
                            </p>
                          </div>
                          {s.amount != null && (
                            <span className="text-xs font-medium text-muted-foreground shrink-0">
                              {formatCurrency(s.amount)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
