'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { paymentsApi } from '@/lib/api';
import { getPatientDetailPath } from '@/lib/routes';
import { DataTable } from '@/components/ui/data-table';
import { SearchInput } from '@/components/ui/search-input';
import { Button } from '@/components/ui/button';
import { PaymentBadge } from '@/components/ui/payment-badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Plus, Download, Printer, Share2, Pencil, Trash2 } from 'lucide-react';
import { PaymentFormDialog } from '@/components/payments/payment-form-dialog';
import { DebtsTable } from '@/components/payments/debts-table';
import { downloadInvoicePdf, printInvoice, shareInvoiceHtml } from '@/lib/invoice';
import { toast } from 'sonner';

export function AdminPaymentsView({ initialTab = 'payments' }: { initialTab?: 'payments' | 'debts' } = {}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editPayment, setEditPayment] = useState<any>(null);
  const [deletePayment, setDeletePayment] = useState<any>(null);
  const [debtPatientId, setDebtPatientId] = useState<string | undefined>();
  const [debtPlanId, setDebtPlanId] = useState<string | undefined>();
  const [debtSessionId, setDebtSessionId] = useState<string | undefined>();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['payments', page, search],
    queryFn: () => paymentsApi.getAll({ page, limit: 24, search }),
  });

  const payments = (data as any)?.data || [];
  const meta = (data as any)?.meta;

  const invalidateAfterChange = () => {
    queryClient.invalidateQueries({ queryKey: ['payments'] });
    queryClient.invalidateQueries({ queryKey: ['payment-debts'] });
    queryClient.invalidateQueries({ queryKey: ['plan-financials'] });
    queryClient.invalidateQueries({ queryKey: ['treatment-plans'] });
    queryClient.invalidateQueries({ queryKey: ['outstanding-balances'] });
    queryClient.invalidateQueries({ queryKey: ['report-overview'] });
    queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    queryClient.invalidateQueries({ queryKey: ['patients'] });
    queryClient.invalidateQueries({ queryKey: ['patient'] });
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

  const closeForm = () => { setShowForm(false); setEditPayment(null); setDebtPatientId(undefined); setDebtPlanId(undefined); setDebtSessionId(undefined); };

  const columns = [
    {
      header: 'Nr. Faturës',
      accessor: (row: any) => (
        <span className="font-mono text-sm font-medium">{row.invoiceNumber}</span>
      ),
    },
    {
      header: 'Pacienti',
      accessor: (row: any) => (
        <div>
          <p className="text-sm font-medium">{row.patient?.firstName} {row.patient?.lastName}</p>
          <p className="text-xs text-muted-foreground">{row.patient?.phone}</p>
        </div>
      ),
    },
    {
      header: 'Dega',
      accessor: (row: any) => <span className="text-sm">{row.branch?.name}</span>,
    },
    {
      header: 'Shuma',
      accessor: (row: any) => (
        <span className="font-bold text-sm">{formatCurrency(row.amount)}</span>
      ),
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
      accessor: (row: any) => (
        <div className="flex items-center gap-1" data-stop-row-click>
          <Button variant="ghost" size="sm" onClick={() => downloadInvoicePdf(row.id, row.invoiceNumber)} title="Shkarko faturën PDF">
            <Download size={14} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => printInvoice(row.id)} title="Printo faturën">
            <Printer size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => shareInvoiceHtml(row.id, row.patient?.firstName, row.patient?.lastName)}
            title="Ndaj"
          >
            <Share2 size={14} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditPayment(row)} title="Ndrysho">
            <Pencil size={14} />
          </Button>
          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-600" onClick={() => setDeletePayment(row)} title="Fshi">
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Pagesat</h1>
          <p className="text-sm text-muted-foreground">{meta?.total ?? 0} pagesa gjithsej</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-2 gradient-teal text-white border-0 w-full sm:w-auto">
          <Plus size={16} />Pagesë e re
        </Button>
      </div>

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="payments">Pagesat</TabsTrigger>
          <TabsTrigger value="debts">Borxhet</TabsTrigger>
        </TabsList>

        <TabsContent value="payments" className="space-y-4">
          <SearchInput
            placeholder="Kërko pagesat..."
            onChange={setSearch}
            className="w-full max-w-xs"
          />

          <DataTable
            columns={columns}
            data={payments}
            isLoading={isLoading}
            isError={isError}
            errorMessage={(error as Error)?.message}
            pagination={meta}
            onPageChange={setPage}
            emptyMessage="Nuk ka pagesa"
            onRowClick={(row: any) => router.push(`${getPatientDetailPath('ADMIN', row.patientId)}?tab=pagesat`)}
          />
        </TabsContent>

        <TabsContent value="debts">
          <DebtsTable onRegisterPayment={(patientId, planId, sessionId) => { setDebtPatientId(patientId); setDebtPlanId(planId || undefined); setDebtSessionId(sessionId); setShowForm(true); }} />
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
          defaultSessionId={debtSessionId}
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
