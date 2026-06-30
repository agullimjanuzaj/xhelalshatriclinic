'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { paymentsApi } from '@/lib/api';
import { getPatientDetailPath } from '@/lib/routes';
import { useSession } from 'next-auth/react';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { PaymentBadge } from '@/components/ui/payment-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatCurrency, formatDate, computeCurrentDebt } from '@/lib/utils';
import { Plus, Download, Printer, Share2, Pencil, Trash2 } from 'lucide-react';
import { PaymentFormDialog } from '@/components/payments/payment-form-dialog';
import { DebtsTable } from '@/components/payments/debts-table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { shareText, buildInvoiceShareText } from '@/lib/share';
import { downloadInvoicePdf, printInvoice } from '@/lib/invoice';
import { toast } from 'sonner';

export function ManagerPaymentsView({ initialTab = 'payments' }: { initialTab?: 'payments' | 'debts' } = {}) {
  const { data: session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const branchId = session?.user?.userBranches?.[0]?.branchId;
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editPayment, setEditPayment] = useState<any>(null);
  const [deletePayment, setDeletePayment] = useState<any>(null);
  const [debtPatientId, setDebtPatientId] = useState<string | undefined>();
  const [debtPlanId, setDebtPlanId] = useState<string | undefined>();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['payments-manager', page, branchId],
    queryFn: () => paymentsApi.getAll({ page, limit: 24, branchId }),
    enabled: !!branchId,
  });

  const payments = (data as any)?.data || [];
  const meta = (data as any)?.meta;

  const invalidateAfterChange = () => {
    queryClient.invalidateQueries({ queryKey: ['payments-manager'] });
    queryClient.invalidateQueries({ queryKey: ['payment-debts'] });
    queryClient.invalidateQueries({ queryKey: ['plan-financials'] });
    queryClient.invalidateQueries({ queryKey: ['treatment-plans'] });
    queryClient.invalidateQueries({ queryKey: ['outstanding-balances'] });
    queryClient.invalidateQueries({ queryKey: ['report-overview-manager'] });
    queryClient.invalidateQueries({ queryKey: ['manager-stats'] });
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => paymentsApi.delete(id),
    onSuccess: () => {
      toast.success('Pagesa u fshi dhe borxhi u përditësua');
      setDeletePayment(null);
      invalidateAfterChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const closeForm = () => { setShowForm(false); setEditPayment(null); setDebtPatientId(undefined); setDebtPlanId(undefined); };

  const columns = [
    {
      header: 'Nr. Faturës',
      accessor: (row: any) => <span className="font-mono text-sm font-medium">{row.invoiceNumber}</span>,
    },
    {
      header: 'Pacienti',
      accessor: (row: any) => (
        <div>
          <p className="font-medium text-sm">{row.patient?.firstName} {row.patient?.lastName}</p>
          <p className="text-xs text-muted-foreground">{row.patient?.phone}</p>
        </div>
      ),
    },
    {
      header: 'Shuma',
      accessor: (row: any) => <span className="font-bold">{formatCurrency(row.amount)}</span>,
    },
    {
      header: 'Statusi',
      accessor: (row: any) => <PaymentBadge status={row.status} />,
    },
    {
      header: 'Data',
      accessor: (row: any) => <span className="text-sm">{formatDate(row.paidAt || row.createdAt)}</span>,
    },
    {
      header: 'Veprimet',
      accessor: (row: any) => {
        const shareTextValue = buildInvoiceShareText({
          patientName: `${row.patient?.firstName || ''} ${row.patient?.lastName || ''}`.trim(),
          invoiceNumber: row.invoiceNumber,
          amount: Number(row.amount),
          branchName: row.branch?.name,
          currentDebt: row.treatmentPlan ? computeCurrentDebt(row.treatmentPlan) : undefined,
          paidAt: row.paidAt || row.createdAt,
        });
        return (
          <div className="flex gap-1" data-stop-row-click>
            <Button variant="ghost" size="sm" title="Shkarko PDF" onClick={() => downloadInvoicePdf(row.id, row.invoiceNumber)}>
              <Download size={14} />
            </Button>
            <Button variant="ghost" size="sm" title="Printo faturën" onClick={() => printInvoice(row.id)}>
              <Printer size={14} />
            </Button>
            <Button variant="ghost" size="sm" title="Ndaj" onClick={() => shareText(shareTextValue)}>
              <Share2 size={14} />
            </Button>
            <Button variant="ghost" size="sm" title="Ndrysho" onClick={() => setEditPayment(row)}>
              <Pencil size={14} />
            </Button>
            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-600" title="Fshi" onClick={() => setDeletePayment(row)}>
              <Trash2 size={14} />
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Pagesat</h1>
          <p className="text-sm text-muted-foreground">{meta?.total ?? 0} pagesa</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-2 gradient-teal text-white border-0">
          <Plus size={16} />Pagesë e re
        </Button>
      </div>

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="payments">Pagesat</TabsTrigger>
          <TabsTrigger value="debts">Borxhet</TabsTrigger>
        </TabsList>

        <TabsContent value="payments">
          <DataTable
            columns={columns}
            data={payments}
            isLoading={isLoading}
            isError={isError}
            errorMessage={(error as Error)?.message}
            pagination={meta}
            onPageChange={setPage}
            emptyMessage="Nuk ka pagesa"
            onRowClick={(row: any) => router.push(`${getPatientDetailPath('MANAGER', row.patientId)}?tab=pagesat`)}
          />
        </TabsContent>

        <TabsContent value="debts">
          <DebtsTable branchId={branchId} onRegisterPayment={(patientId, planId) => { setDebtPatientId(patientId); setDebtPlanId(planId); setShowForm(true); }} />
        </TabsContent>
      </Tabs>

      {(showForm || editPayment) && (
        <PaymentFormDialog
          open={showForm || !!editPayment}
          payment={editPayment}
          onClose={closeForm}
          onSuccess={() => { invalidateAfterChange(); closeForm(); }}
          defaultPatientId={debtPatientId}
          defaultPlanId={debtPlanId}
        />
      )}

      <ConfirmDialog
        open={!!deletePayment}
        onOpenChange={(open) => !open && setDeletePayment(null)}
        title="Fshi pagesën?"
        description={`Pagesa ${deletePayment?.invoiceNumber} (${deletePayment ? formatCurrency(deletePayment.amount) : ''}) do të anulohet dhe borxhi i lidhur do të rikthehet.`}
        onConfirm={() => deletePayment && deleteMutation.mutate(deletePayment.id)}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
