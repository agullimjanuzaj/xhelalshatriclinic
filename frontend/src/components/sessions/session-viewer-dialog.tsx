'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { sessionsApi } from '@/lib/api';
import { DialogPortal, DialogOverlay } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SessionBadge } from '@/components/ui/session-badge';
import { formatDate, formatCurrency, getTreatmentTypeLabel } from '@/lib/utils';
import {
  X, Printer, Share2, User, Phone, Building2,
  Calendar, FileText, Activity, MessageSquare, Stethoscope,
  CheckCircle2, XCircle, CreditCard,
} from 'lucide-react';

interface SessionViewerDialogProps {
  sessionId: string | null;
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

export function SessionViewerDialog({ sessionId, onClose, onPrint, onShare }: SessionViewerDialogProps) {
  const { data: session, isLoading } = useQuery({
    queryKey: ['session-detail', sessionId],
    queryFn: () => sessionsApi.getOne(sessionId!),
    enabled: !!sessionId,
  }) as { data: any; isLoading: boolean };

  const patient = session?.patient;
  const physio = session?.physiotherapist || session?.completedByUser;

  return (
    <DialogPrimitive.Root open={!!sessionId} onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] w-[calc(100%-1rem)] max-w-[1100px] max-h-[90dvh] bg-background border shadow-xl sm:rounded-2xl overflow-hidden flex flex-col duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
        >
          {/* Sticky header */}
          <div className="flex items-center justify-between px-4 py-3 sm:px-6 border-b bg-background/95 backdrop-blur shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full gradient-teal flex items-center justify-center shrink-0">
                <Activity size={15} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">
                  {isLoading ? '…' : patient ? `${patient.firstName} ${patient.lastName}` : 'Trajtim'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {session?.sessionNumber ? `Seanca #${session.sessionNumber}` : 'Raport trajtimi'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onPrint} title="Printo">
                <Printer size={15} />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onShare} title="Ndaj">
                <Share2 size={15} />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 ml-1" onClick={onClose} title="Mbyll">
                <X size={16} />
              </Button>
            </div>
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
            ) : session ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Left column */}
                <div className="space-y-4">

                  {/* Patient + session info */}
                  <SectionCard title="Informacioni i seancës" icon={<User size={14} />}>
                    <div className="space-y-2">
                      <InfoRow
                        label="Pacienti"
                        value={`${patient?.firstName || ''} ${patient?.lastName || ''}`.trim()}
                      />
                      {patient?.phone && (
                        <InfoRow
                          label="Telefoni"
                          value={
                            <a href={`tel:${patient.phone}`} className="flex items-center gap-1 hover:text-teal-600">
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
                    </div>
                  </SectionCard>

                  {/* Status + financials */}
                  <SectionCard title="Statusi & Pagesa" icon={<CreditCard size={14} />}>
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
                      {session.amount && (
                        <span className="ml-auto text-base font-bold">{formatCurrency(session.amount)}</span>
                      )}
                    </div>
                    {session.duration && (
                      <InfoRow label="Kohëzgjatja" value={`${session.duration} min`} />
                    )}
                    {session.painLevel && (
                      <InfoRow label="Niveli i dhimbjes" value={`${session.painLevel}/10`} />
                    )}
                    {session.sessionNumber && session.treatmentPlan && (
                      <InfoRow
                        label="Progresi"
                        value={`Seanca ${session.sessionNumber} nga ${session.treatmentPlan.totalSessions}`}
                      />
                    )}
                  </SectionCard>

                </div>

                {/* Right column */}
                <div className="space-y-4">

                  {/* Treatment types */}
                  {session.treatmentTypes?.length > 0 && (
                    <SectionCard title="Llojet e trajtimit" icon={<Stethoscope size={14} />}>
                      <div className="flex flex-wrap gap-1.5">
                        {session.treatmentTypes.map((t: string) => (
                          <Badge key={t} variant="outline" className="text-xs">{getTreatmentTypeLabel(t)}</Badge>
                        ))}
                      </div>
                    </SectionCard>
                  )}

                  {/* Session notes */}
                  {session.notes && (
                    <SectionCard title="Shënim i shkurtër" icon={<FileText size={14} />}>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{session.notes}</p>
                    </SectionCard>
                  )}

                  {/* Recommendations */}
                  {session.recommendations && (
                    <SectionCard title="Rekomandimet" icon={<MessageSquare size={14} />}>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{session.recommendations}</p>
                    </SectionCard>
                  )}

                  {/* No content fallback for right column */}
                  {!session.treatmentTypes?.length && !session.notes && !session.recommendations && (
                    <div className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
                      Nuk ka shënime të tjera
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                Seanca nuk u gjet
              </div>
            )}
          </div>

          {/* Mobile sticky footer */}
          <div className="sm:hidden border-t px-4 py-3 flex gap-2 bg-background shrink-0">
            <Button variant="outline" className="flex-1 gap-2" onClick={onClose}>
              <X size={14} />Mbyll
            </Button>
            <Button variant="outline" className="flex-1 gap-2" onClick={onPrint}>
              <Printer size={14} />Printo
            </Button>
            <Button variant="outline" className="flex-1 gap-2" onClick={onShare}>
              <Share2 size={14} />Ndaj
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
