'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { treatmentPlansApi } from '@/lib/api';
import { DialogPortal, DialogOverlay } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatCurrency, getTreatmentTypeLabel } from '@/lib/utils';
import {
  X, Printer, Share2, User, Phone, Building2, Stethoscope,
  ClipboardList, CheckCircle2, Circle, Calendar, FileText,
  HeartPulse, ArrowLeft,
} from 'lucide-react';

interface PlanViewerDialogProps {
  planId: string | null;
  onClose: () => void;
  onPrint: () => void;
  onShare: () => Promise<void>;
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs text-muted-foreground min-w-[90px] pt-0.5">{label}</span>
      <span className="text-sm font-medium flex-1">{value || '—'}</span>
    </div>
  );
}

export function PlanViewerDialog({ planId, onClose, onPrint, onShare }: PlanViewerDialogProps) {
  const { data: plan, isLoading } = useQuery({
    queryKey: ['treatment-plan-detail', planId],
    queryFn: () => treatmentPlansApi.getOne(planId!),
    enabled: !!planId,
  }) as { data: any; isLoading: boolean };

  const patient = plan?.patient;
  const allSessions = plan?.sessions || [];

  return (
    <DialogPrimitive.Root open={!!planId} onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className={[
            // Mobile-first: fullscreen sheet (inset-0 covers 100% width + height)
            'fixed inset-0 z-50 bg-background flex flex-col overflow-hidden',
            // Desktop: centered dialog with rounded corners
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2',
            'sm:w-[90vw] sm:max-w-[1100px] sm:h-[90vh] sm:rounded-2xl sm:border sm:shadow-xl',
            // Animation — mobile: slide up from bottom
            'duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
            // Animation — desktop: cancel slide, use zoom instead
            'sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=closed]:slide-out-to-bottom-0',
            'sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95',
          ].join(' ')}
        >
          {/* Sticky header */}
          <div className="flex items-center justify-between px-4 py-3 sm:px-6 border-b bg-background shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <ArrowLeft size={18} className="text-muted-foreground shrink-0" />
              <span className="text-sm font-semibold truncate">Kontrolla</span>
            </div>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={onClose} title="Mbyll">
              <X size={18} />
            </Button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-xl border p-4 space-y-3">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ))}
              </div>
            ) : plan ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Left column */}
                <div className="space-y-4">

                  {/* Patient info */}
                  <SectionCard title="Informacioni i pacientit" icon={<User size={14} />}>
                    <div className="space-y-2">
                      <InfoRow
                        label="Emri"
                        value={`${patient?.firstName || ''} ${patient?.lastName || ''}`.trim()}
                      />
                      <InfoRow
                        label="Telefoni"
                        value={patient?.phone ? (
                          <a href={`tel:${patient.phone}`} className="flex items-center gap-1 hover:text-teal-600">
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
                      {plan.assignedPhysiotherapist && (
                        <InfoRow
                          label="Fizioterapeuti"
                          value={`${plan.assignedPhysiotherapist.firstName} ${plan.assignedPhysiotherapist.lastName}`}
                        />
                      )}
                    </div>
                  </SectionCard>

                  {/* Complaints */}
                  {(plan.complaints?.length > 0 || plan.complaintDescription) && (
                    <SectionCard title="Ankesat kryesore" icon={<HeartPulse size={14} />}>
                      {plan.complaints?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {plan.complaints.map((c: string) => (
                            <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
                          ))}
                        </div>
                      )}
                      {plan.complaintDescription && (
                        <p className="text-sm text-muted-foreground leading-relaxed mt-2">
                          {plan.complaintDescription}
                        </p>
                      )}
                    </SectionCard>
                  )}

                  {/* Suggested diagnoses */}
                  {plan.selectedDiagnoses?.length > 0 && (
                    <SectionCard title="Gjendja e sugjeruar" icon={<Stethoscope size={14} />}>
                      <div className="flex flex-wrap gap-1.5">
                        {plan.selectedDiagnoses.map((d: string) => (
                          <Badge key={d} className="text-xs bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800">
                            {d}
                          </Badge>
                        ))}
                      </div>
                      {plan.diagnosis && (
                        <p className="text-sm text-muted-foreground mt-2">{plan.diagnosis}</p>
                      )}
                    </SectionCard>
                  )}

                  {/* Diagnosis only */}
                  {!plan.selectedDiagnoses?.length && plan.diagnosis && (
                    <SectionCard title="Diagnoza" icon={<Stethoscope size={14} />}>
                      <p className="text-sm">{plan.diagnosis}</p>
                    </SectionCard>
                  )}
                </div>

                {/* Right column */}
                <div className="space-y-4">

                  {/* Treatment plan details */}
                  <SectionCard title="Plani i trajtimit" icon={<FileText size={14} />}>
                    {plan.treatmentTypes?.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1.5">Llojet e trajtimit</p>
                        <div className="flex flex-wrap gap-1.5">
                          {plan.treatmentTypes.map((t: string) => (
                            <Badge key={t} variant="outline" className="text-xs">{getTreatmentTypeLabel(t)}</Badge>
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
                        <p className="text-2xl font-bold">
                          {formatCurrency(plan.amountPaid || 0)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          / {formatCurrency(plan.totalAmount || 0)}
                        </p>
                      </div>
                    </div>
                    <InfoRow label="Çmimi/seancë" value={formatCurrency(plan.sessionFee || 0)} />
                    {plan.notes && (
                      <div className="mt-1">
                        <p className="text-xs text-muted-foreground mb-1">Shënimet</p>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{plan.notes}</p>
                      </div>
                    )}
                  </SectionCard>

                  {/* Sessions timeline */}
                  {allSessions.length > 0 && (
                    <SectionCard title="Seancat" icon={<Calendar size={14} />}>
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {allSessions.map((s: any, idx: number) => (
                          <div key={s.id} className="flex items-start gap-3 py-2 border-b last:border-0">
                            <div className="mt-0.5 shrink-0">
                              {s.status === 'COMPLETED' ? (
                                <CheckCircle2 size={16} className="text-teal-500" />
                              ) : (
                                <Circle size={16} className="text-muted-foreground" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">Seanca #{s.sessionNumber || (allSessions.length - idx)}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatDate(s.completedAt || s.scheduledAt || s.createdAt)}
                                {s.physiotherapist && ` · ${s.physiotherapist.firstName} ${s.physiotherapist.lastName}`}
                              </p>
                            </div>
                            {s.amount && (
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
            ) : (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                Plani nuk u gjet
              </div>
            )}
          </div>

          {/* Sticky footer — always visible */}
          <div className="border-t px-4 py-3 flex gap-2 bg-background shrink-0">
            <Button variant="outline" className="flex-1 gap-2" onClick={onPrint}>
              <Printer size={14} />Printo
            </Button>
            <Button variant="outline" className="flex-1 gap-2" onClick={onShare}>
              <Share2 size={14} />Ndaj
            </Button>
            <Button variant="outline" className="flex-1 gap-2" onClick={onClose}>
              <X size={14} />Mbyll
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
