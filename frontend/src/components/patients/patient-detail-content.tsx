'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { patientsApi, treatmentPlansApi, sessionsApi, paymentsApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PatientStatusBadge } from '@/components/ui/patient-status-badge';
import { SessionBadge } from '@/components/ui/session-badge';
import { PaymentBadge } from '@/components/ui/payment-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { CreatePlanDialog } from '@/components/treatment-plans/create-plan-dialog';
import { CreateSessionDialog } from '@/components/sessions/create-session-dialog';
import { EditSessionDialog } from '@/components/sessions/edit-session-dialog';
import { PaymentFormDialog } from '@/components/payments/payment-form-dialog';
import { PatientFormDialog } from '@/components/patients/patient-form-dialog';
import { downloadInvoicePdf, printInvoice, shareInvoiceHtml } from '@/lib/invoice';
import { shareText } from '@/lib/share';
import {
  formatDate, formatDateTime, formatCurrency, getGenderLabel, getTreatmentTypeLabel, formatActiveUntil,
} from '@/lib/utils';
import {
  ArrowLeft, Plus, Pencil, Trash2, Printer, Share2, Download,
  Building2, Phone, CheckCircle2, ExternalLink,
} from 'lucide-react';
import { ROUTES } from '@/lib/routes';
import { toast } from 'sonner';

const TAB_QUERY_PARAM_MAP: Record<string, string> = {
  pagesat: 'payments',
  borxhet: 'debts',
  trajtimet: 'treatments',
  seancat: 'sessions',
  keshilla: 'advice',
};
const TAB_TO_QUERY_PARAM: Record<string, string> = Object.fromEntries(
  Object.entries(TAB_QUERY_PARAM_MAP).map(([k, v]) => [v, k]),
);

export function PatientDetailContent({ id }: { id: string }) {
  const { data: authSession } = useSession();
  const role = authSession?.user?.role;
  const isAdmin = role === 'ADMIN';
  const isManager = role === 'MANAGER';
  const isPhysio = role === 'PHYSIOTHERAPIST';
  const canManagePatient = isAdmin || isManager;
  const canManageMoney = isAdmin || isManager;
  const canCreateSession = isAdmin || isPhysio;
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tabParam = searchParams.get('tab');
  const initialTab = (tabParam && TAB_QUERY_PARAM_MAP[tabParam]) || tabParam || 'overview';
  const [activeTab, setActiveTab] = useState(initialTab);
  const effectiveTab = isPhysio && ['payments', 'debts'].includes(activeTab) ? 'overview' : activeTab;

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const queryValue = TAB_TO_QUERY_PARAM[value];
    router.replace(queryValue ? `${pathname}?tab=${queryValue}` : pathname, { scroll: false });
  };

  const [showEditPatient, setShowEditPatient] = useState(false);
  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [editPlan, setEditPlan] = useState<any>(null);
  const [deletePlan, setDeletePlan] = useState<any>(null);
  const [showSessionDialog, setShowSessionDialog] = useState(false);
  const [editSession, setEditSession] = useState<any>(null);
  const [deleteSession, setDeleteSession] = useState<any>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentContext, setPaymentContext] = useState<{ planId?: string; sessionId?: string }>({});
  const [editPayment, setEditPayment] = useState<any>(null);
  const [deletePayment, setDeletePayment] = useState<any>(null);
  const [advice, setAdvice] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['patient', id],
    queryFn: () => patientsApi.getOne(id),
  });
  const patient = (data as any)?.data;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['patient', id] });
    queryClient.invalidateQueries({ queryKey: ['patients'] });
    queryClient.invalidateQueries({ queryKey: ['treatment-plans'] });
    queryClient.invalidateQueries({ queryKey: ['sessions'] });
    queryClient.invalidateQueries({ queryKey: ['payments'] });
    queryClient.invalidateQueries({ queryKey: ['payment-debts'] });
    queryClient.invalidateQueries({ queryKey: ['outstanding-balances'] });
    queryClient.invalidateQueries({ queryKey: ['plan-financials'] });
    queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    queryClient.invalidateQueries({ queryKey: ['manager-stats'] });
    queryClient.invalidateQueries({ queryKey: ['report-overview'] });
  };

  const deletePlanMutation = useMutation({
    mutationFn: (planId: string) => treatmentPlansApi.delete(planId),
    onSuccess: () => { toast.success('Trajtimi u fshi me sukses'); setDeletePlan(null); invalidateAll(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteSessionMutation = useMutation({
    mutationFn: (sessionId: string) => sessionsApi.delete(sessionId),
    onSuccess: () => { toast.success('Seanca u fshi me sukses'); setDeleteSession(null); invalidateAll(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deletePaymentMutation = useMutation({
    mutationFn: (paymentId: string) => paymentsApi.delete(paymentId),
    onSuccess: () => { toast.success('Pagesa u fshi dhe borxhi u përditësua'); setDeletePayment(null); invalidateAll(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (value: boolean) => patientsApi.setActiveInClinic(id, value),
    onSuccess: (res: any) => {
      const p = res?.data;
      if (p?.activeInClinic && p.activeInClinicSince && p.activeInClinicExpiresAt) {
        const hours = Math.round((new Date(p.activeInClinicExpiresAt).getTime() - new Date(p.activeInClinicSince).getTime()) / 3_600_000);
        toast.success(`Pacienti u shënua aktiv në klinikë për ${hours} orë.`);
      }
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const timeline = useMemo(() => {
    if (!patient) return [];
    const items: { date: string; label: string; icon: string }[] = [];
    items.push({ date: patient.createdAt, label: 'Pacienti u regjistrua', icon: '🆕' });
    for (const p of patient.treatmentPlans || []) {
      items.push({ date: p.createdAt, label: `U krijua trajtimi: ${(p.treatmentTypes || []).map(getTreatmentTypeLabel).join(', ') || 'Trajtim'}`, icon: '📋' });
    }
    for (const s of patient.sessions || []) {
      if (s.completedAt) items.push({ date: s.completedAt, label: `U kompletua seanca${s.sessionNumber ? ` #${s.sessionNumber}` : ''}`, icon: '✅' });
    }
    for (const p of patient.payments || []) {
      items.push({ date: p.createdAt, label: `U regjistrua pagesa ${formatCurrency(p.amount)} (${p.invoiceNumber})`, icon: '💳' });
    }
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [patient]);

  const generateAdvice = () => {
    if (!patient) return;
    const lastSession = (patient.sessions || []).find((s: any) => s.recommendations || s.painLevel);
    const lines: string[] = [];
    lines.push(`Përshëndetje ${patient.firstName},`);
    if (lastSession?.recommendations) {
      lines.push(lastSession.recommendations);
    } else {
      lines.push('Vazhdoni ushtrimet e rekomanduara nga fizioterapeuti 2 herë në ditë.');
    }
    if (lastSession?.painLevel && lastSession.painLevel >= 6) {
      lines.push('Shmangni ngritjen e peshave dhe aktivitetet e rënda për 48 orët e ardhshme.');
    }
    lines.push('Nëse dhimbja rritet ose vëreni shqetësim të pazakontë, kontaktoni klinikën.');
    lines.push('');
    const BRANCH_NAMES: Record<string, string> = { Istog: 'Fiziomed', Pejë: 'Biohit', Prishtinë: 'Kiromed' };
    const clinicName = (patient.branch?.city && BRANCH_NAMES[patient.branch.city]) || 'Xhelal Shatri Clinic';
    lines.push(`Faleminderit,\n${clinicName}`);
    setAdvice(lines.join('\n'));
  };

  const shareAdvice = () => {
    if (!advice) return;
    shareText(advice);
  };

  const printAdvice = () => {
    if (!advice) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open();
    // Set immediately — same reasoning as lib/invoice.ts's openHtmlInWindow:
    // the tab must never show "about:blank" as its title, even briefly.
    w.document.title = 'Këshilla';
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Këshilla</title>
      <style>body{font-family:Arial,sans-serif;padding:32px;white-space:pre-wrap;line-height:1.6}</style>
      </head><body>${advice.replace(/</g, '&lt;')}</body></html>`);
    w.document.close();
    w.onload = () => w.print();
  };

  if (isLoading) return <LoadingSkeleton type="cards" rows={4} />;
  if (!patient) return <p className="text-muted-foreground">Pacienti nuk u gjet</p>;

  const f = patient.financials;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href={ROUTES.patients}><ArrowLeft size={16} />Kthehu te pacientët</Link>
      </Button>

      {/* Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold">{patient.firstName} {patient.lastName}</h1>
                <PatientStatusBadge status={patient.status} />
                {patient.activeInClinic && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                    <CheckCircle2 size={12} />Aktiv në klinikë
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1"><Phone size={13} />{patient.phone}</span>
                <span className="flex items-center gap-1"><Building2 size={13} />{patient.branch?.name}</span>
                <span>{getGenderLabel(patient.gender)}</span>
              </p>
              {canManagePatient && (
                <div className="flex items-center gap-2 mt-3">
                  <Switch checked={patient.activeInClinic} onCheckedChange={(v) => toggleActiveMutation.mutate(v)} />
                  <span className="text-sm text-muted-foreground">Aktiv në klinikë tani</span>
                </div>
              )}
              {patient.activeInClinic && patient.activeInClinicSince && (
                <p className="text-xs text-muted-foreground mt-1">
                  Aktiv që nga {formatDateTime(patient.activeInClinicSince)} · {formatActiveUntil(patient.activeInClinicExpiresAt)}
                </p>
              )}
            </div>

            {!isPhysio && (
            <div className="flex flex-col items-end gap-1">
              <p className="text-xs text-muted-foreground">Borxhi aktual</p>
              <p className={`text-2xl font-bold ${f?.currentDebt > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(f?.currentDebt || 0)}</p>
              <p className="text-xs text-muted-foreground">Paguar deri tani: {formatCurrency(f?.totalPaidAmount || 0)}</p>
            </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            {canManagePatient && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowEditPatient(true)}>
                <Pencil size={13} />Ndrysho
              </Button>
            )}
            {canManagePatient && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowPlanDialog(true)}>
                <Plus size={13} />Shto Kontrollë
              </Button>
            )}
            {canCreateSession && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowSessionDialog(true)}>
                <Plus size={13} />Shto Trajtim
              </Button>
            )}
            {canManageMoney && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setPaymentContext({}); setShowPaymentDialog(true); }}>
                <Plus size={13} />Shto pagesë
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs value={effectiveTab} onValueChange={handleTabChange}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Përmbledhje</TabsTrigger>
          <TabsTrigger value="treatments">Kontrollat</TabsTrigger>
          <TabsTrigger value="sessions">Trajtimet</TabsTrigger>
          {!isPhysio && <TabsTrigger value="payments">Pagesat</TabsTrigger>}
          {!isPhysio && <TabsTrigger value="debts">Borxhet</TabsTrigger>}
          <TabsTrigger value="advice">Këshilla</TabsTrigger>
          <TabsTrigger value="timeline">Historiku</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {!isPhysio && (
          <Card>
            <CardHeader><CardTitle className="text-base">Përmbledhje financiare</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div><p className="text-muted-foreground">Vlera totale e trajtimeve</p><p className="font-semibold">{formatCurrency(f?.totalTreatmentValue || 0)}</p></div>
                <div><p className="text-muted-foreground">Vlera e seancave të kryera</p><p className="font-semibold">{formatCurrency(f?.currentEarnedAmount || 0)}</p></div>
                <div><p className="text-muted-foreground">Shuma e paguar</p><p className="font-semibold text-green-600">{formatCurrency(f?.totalPaidAmount || 0)}</p></div>
                <div><p className="text-muted-foreground">Borxhi aktual</p><p className="font-semibold text-red-600">{formatCurrency(f?.currentDebt || 0)}</p></div>
                <div><p className="text-muted-foreground">Balanca finale e mbetur</p><p className="font-semibold">{formatCurrency(f?.finalRemainingBalance || 0)}</p></div>
                {f?.prepaidAmount > 0 && (
                  <div><p className="text-muted-foreground">Parapagim</p><p className="font-semibold text-teal-600">{formatCurrency(f.prepaidAmount)}</p></div>
                )}
              </div>
              <div className="mt-4">
                <PaymentBadge status={f?.paymentStatus || 'UNPAID'} />
              </div>
            </CardContent>
          </Card>
          )}

          {patient.notes && (
            <Card>
              <CardHeader><CardTitle className="text-base">Shënime</CardTitle></CardHeader>
              <CardContent><p className="text-sm text-muted-foreground">{patient.notes}</p></CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TREATMENTS */}
        <TabsContent value="treatments" className="space-y-3 mt-4">
          {(patient.treatmentPlans || []).map((p: any) => (
            <Card key={p.id}>
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-medium text-sm">{(p.treatmentTypes || []).map(getTreatmentTypeLabel).join(', ') || 'Trajtim'}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Krijuar {formatDate(p.createdAt)} · {p.branch?.name || patient.branch?.name} · nga {p.createdByUser ? `${p.createdByUser.firstName} ${p.createdByUser.lastName}` : '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Fizioterapeuti: {p.assignedPhysiotherapist ? `${p.assignedPhysiotherapist.firstName} ${p.assignedPhysiotherapist.lastName}` : 'Pa fizioterapeut të caktuar'}
                    </p>
                  </div>
                  {!isPhysio && <PaymentBadge status={p.financials?.paymentStatus || p.paymentStatus} />}
                </div>

                <div className="w-full">
                  <div className="flex justify-between text-xs mb-1">
                    <span>{p.completedSessions}/{p.totalSessions} seanca</span>
                    <span className="text-muted-foreground">{p.totalSessions - p.completedSessions} mbetur</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-teal-500 rounded-full" style={{ width: `${Math.round((p.completedSessions / p.totalSessions) * 100)}%` }} />
                  </div>
                </div>

                {!isPhysio && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div><p className="text-muted-foreground text-xs">Çmimi/trajtim</p><p className="font-medium">{formatCurrency(p.sessionFee)}</p></div>
                  <div><p className="text-muted-foreground text-xs">Totali i kontrollës</p><p className="font-medium">{formatCurrency(p.financials?.totalTreatmentValue ?? p.totalAmount)}</p></div>
                  <div><p className="text-muted-foreground text-xs">Vlera e fituar</p><p className="font-medium">{formatCurrency(p.financials?.currentEarnedAmount || 0)}</p></div>
                  <div><p className="text-muted-foreground text-xs">Paguar</p><p className="font-medium text-green-600">{formatCurrency(p.financials?.totalPaidAmount ?? p.amountPaid)}</p></div>
                  <div><p className="text-muted-foreground text-xs">Borxh aktual</p><p className="font-medium text-red-600">{formatCurrency(p.financials?.currentDebt || 0)}</p></div>
                </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  {canCreateSession && (
                    <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => setShowSessionDialog(true)}>
                      <Plus size={12} />Shto Trajtim
                    </Button>
                  )}
                  {canManageMoney && (
                    <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => { setPaymentContext({ planId: p.id }); setShowPaymentDialog(true); }}>
                      <Plus size={12} />Shto pagesë
                    </Button>
                  )}
                  <Link href={ROUTES.treatmentDetail(p.id)}>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Shiko detajet">
                      <ExternalLink size={13} />
                    </Button>
                  </Link>
                  {canManagePatient && (
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setEditPlan(p)} title="Ndrysho">
                      <Pencil size={13} />
                    </Button>
                  )}
                  {isAdmin && (
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:text-red-600" onClick={() => setDeletePlan(p)} title="Fshi">
                      <Trash2 size={13} />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {!patient.treatmentPlans?.length && <p className="text-sm text-muted-foreground text-center py-10">Nuk ka kontrolla ende</p>}
        </TabsContent>

        {/* SESSIONS */}
        <TabsContent value="sessions" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {(patient.sessions || []).map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between px-4 py-3 gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-medium">{s.sessionNumber ? `Seanca #${s.sessionNumber}` : 'Pa plan trajtimi'} {s.treatmentPlan?.diagnosis ? `— ${s.treatmentPlan.diagnosis}` : ''}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(s.completedAt || s.createdAt)} · {(s.physiotherapist || s.completedByUser) ? `${(s.physiotherapist || s.completedByUser).firstName} ${(s.physiotherapist || s.completedByUser).lastName}` : 'Nuk është caktuar'}
                        {s.duration ? ` · ${s.duration} min` : ''}{s.painLevel ? ` · Dhimbje ${s.painLevel}/10` : ''}
                      </p>
                      {s.treatmentTypes?.length > 0 && <p className="text-xs text-muted-foreground mt-0.5">Llojet e trajtimit: {s.treatmentTypes.join(', ')}</p>}
                      {s.notes && <p className="text-xs text-muted-foreground mt-0.5">Shënim: {s.notes}</p>}
                      {s.recommendations && <p className="text-xs text-muted-foreground">Rekomandim: {s.recommendations}</p>}
                      {s.payment && <p className="text-xs text-teal-600 mt-0.5">Pagesa: {s.payment.invoiceNumber}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <SessionBadge status={s.status} />
                      {(isAdmin || (isPhysio && s.physiotherapist?.id === authSession?.user?.id)) && (
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setEditSession(s)} title="Ndrysho">
                          <Pencil size={13} />
                        </Button>
                      )}
                      {(isAdmin || (isPhysio && s.physiotherapist?.id === authSession?.user?.id && !s.payment)) && (
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:text-red-600" onClick={() => setDeleteSession(s)} title="Fshi">
                          <Trash2 size={13} />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {!patient.sessions?.length && <p className="text-sm text-muted-foreground px-4 py-10 text-center">Nuk ka trajtime</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PAYMENTS */}
        <TabsContent value="payments" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {(patient.payments || []).map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between px-4 py-3 gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-medium">{p.invoiceNumber} — {formatCurrency(p.amount)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(p.paidAt || p.createdAt)} · {p.paymentMethod} {p.treatmentPlan?.diagnosis ? `· ${p.treatmentPlan.diagnosis}` : ''} · nga {p.createdByUser ? `${p.createdByUser.firstName} ${p.createdByUser.lastName}` : '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <PaymentBadge status={p.status} />
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => downloadInvoicePdf(p.id, p.invoiceNumber)} title="Shkarko">
                        <Download size={13} />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => printInvoice(p.id)} title="Printo">
                        <Printer size={13} />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => shareInvoiceHtml(p.id, patient.firstName, patient.lastName)} title="Ndaj">
                        <Share2 size={13} />
                      </Button>
                      {canManageMoney && (
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setEditPayment(p)} title="Ndrysho">
                          <Pencil size={13} />
                        </Button>
                      )}
                      {canManageMoney && (
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:text-red-600" onClick={() => setDeletePayment(p)} title="Fshi/Anulo">
                          <Trash2 size={13} />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {!patient.payments?.length && <p className="text-sm text-muted-foreground px-4 py-10 text-center">Nuk ka pagesa</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DEBTS */}
        <TabsContent value="debts" className="space-y-3 mt-4">
          {(patient.treatmentPlans || []).filter((p: any) => (p.financials?.finalRemainingBalance || 0) > 0).map((p: any) => (
            <Card key={p.id}>
              <CardContent className="pt-5 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="font-medium text-sm">{(p.treatmentTypes || []).map(getTreatmentTypeLabel).join(', ') || 'Trajtim'}</p>
                  <p className="text-xs text-muted-foreground">{p.completedSessions}/{p.totalSessions} seanca · Totali {formatCurrency(p.financials?.totalTreatmentValue ?? p.totalAmount)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Borxhi aktual</p>
                  <p className="font-bold text-red-600">{formatCurrency(p.financials?.currentDebt || 0)}</p>
                  <p className="text-xs text-muted-foreground">Balanca finale: {formatCurrency(p.financials?.finalRemainingBalance || 0)}</p>
                </div>
                {canManageMoney && (
                  <Button size="sm" className="gap-1.5 gradient-teal text-white border-0" onClick={() => { setPaymentContext({ planId: p.id }); setShowPaymentDialog(true); }}>
                    <Plus size={13} />Regjistro pagesë
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
          {(patient.sessions || []).filter((s: any) => !s.treatmentPlanId && s.status === 'COMPLETED' && !s.isPaid).map((s: any) => (
            <Card key={s.id}>
              <CardContent className="pt-5 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="font-medium text-sm">Trajtim pa Kontrollë</p>
                  <p className="text-xs text-muted-foreground">Seancë e përfunduar · Çmimi: {formatCurrency(s.amount)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Borxhi aktual</p>
                  <p className="font-bold text-red-600">{formatCurrency(s.amount)}</p>
                </div>
                {canManageMoney && (
                  <Button size="sm" className="gap-1.5 gradient-teal text-white border-0" onClick={() => { setPaymentContext({ sessionId: s.id }); setShowPaymentDialog(true); }}>
                    <Plus size={13} />Regjistro pagesë
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
          {!(patient.treatmentPlans || []).some((p: any) => (p.financials?.finalRemainingBalance || 0) > 0) &&
           !(patient.sessions || []).some((s: any) => !s.treatmentPlanId && s.status === 'COMPLETED' && !s.isPaid) && (
            <p className="text-sm text-muted-foreground text-center py-10">Nuk ka borxhe të hapura</p>
          )}
        </TabsContent>

        {/* ADVICE */}
        <TabsContent value="advice" className="space-y-3 mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Këshilla për pacientin</CardTitle>
              <Button variant="outline" size="sm" onClick={generateAdvice}>Gjenero këshillë</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                rows={8}
                value={advice}
                onChange={(e) => setAdvice(e.target.value)}
                placeholder="Klikoni 'Gjenero këshillë' ose shkruani këshillën tuaj..."
              />
              <div className="flex gap-2">
                <Button size="sm" className="gap-1.5 gradient-teal text-white border-0" disabled={!advice} onClick={shareAdvice}>
                  <Share2 size={13} />Ndaj
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" disabled={!advice} onClick={printAdvice}>
                  <Printer size={13} />Printo
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TIMELINE */}
        <TabsContent value="timeline" className="mt-4">
          <Card>
            <CardContent className="pt-5">
              <div className="space-y-4">
                {timeline.map((item, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="text-lg leading-none">{item.icon}</span>
                    <div>
                      <p className="text-sm">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(item.date)}</p>
                    </div>
                  </div>
                ))}
                {!timeline.length && <p className="text-sm text-muted-foreground text-center py-10">Nuk ka aktivitet ende</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {showEditPatient && (
        <PatientFormDialog patient={patient} open={showEditPatient} onClose={() => setShowEditPatient(false)} onSuccess={() => { setShowEditPatient(false); invalidateAll(); }} />
      )}

      {showPlanDialog && (
        <CreatePlanDialog open={showPlanDialog} onClose={() => { setShowPlanDialog(false); invalidateAll(); }} defaultPatientId={id} />
      )}
      {editPlan && (
        <CreatePlanDialog open={!!editPlan} plan={editPlan} onClose={() => { setEditPlan(null); invalidateAll(); }} />
      )}
      <ConfirmDialog
        open={!!deletePlan}
        onOpenChange={(open) => !open && setDeletePlan(null)}
        title="Fshi trajtimin?"
        description="Seancat dhe pagesat ekzistuese nuk humbasin, vetëm trajtimi nuk do të shfaqet më si aktiv."
        onConfirm={() => deletePlan && deletePlanMutation.mutate(deletePlan.id)}
        isPending={deletePlanMutation.isPending}
      />

      {showSessionDialog && (
        <CreateSessionDialog open={showSessionDialog} onClose={() => { setShowSessionDialog(false); invalidateAll(); }} defaultPatientId={id} />
      )}
      {editSession && (
        <EditSessionDialog open={!!editSession} session={editSession} isAdmin={isAdmin} onClose={() => { setEditSession(null); invalidateAll(); }} />
      )}
      <ConfirmDialog
        open={!!deleteSession}
        onOpenChange={(open) => !open && setDeleteSession(null)}
        title="Fshi seancën?"
        description="A jeni i sigurt që dëshironi ta fshini këtë seancë?"
        onConfirm={() => deleteSession && deleteSessionMutation.mutate(deleteSession.id)}
        isPending={deleteSessionMutation.isPending}
      />

      {(showPaymentDialog || editPayment) && (
        <PaymentFormDialog
          open={showPaymentDialog || !!editPayment}
          payment={editPayment}
          defaultPatientId={id}
          defaultPlanId={paymentContext.planId}
          defaultSessionId={paymentContext.sessionId}
          onClose={() => { setShowPaymentDialog(false); setEditPayment(null); setPaymentContext({}); }}
          onSuccess={() => { setShowPaymentDialog(false); setEditPayment(null); setPaymentContext({}); invalidateAll(); }}
        />
      )}
      <ConfirmDialog
        open={!!deletePayment}
        onOpenChange={(open) => !open && setDeletePayment(null)}
        title="Fshi pagesën?"
        description="Pagesa do të anulohet dhe borxhi i lidhur do të rikthehet."
        onConfirm={() => deletePayment && deletePaymentMutation.mutate(deletePayment.id)}
        isPending={deletePaymentMutation.isPending}
      />
    </div>
  );
}
