'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionsApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface MarkFreeConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  session: any; // session object with id, amount, patient, etc.
  patientId?: string;
}

export function MarkFreeConfirmDialog({ open, onClose, session, patientId }: MarkFreeConfirmDialogProps) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');

  const currentPrice = session?.amount != null ? Number(session.amount) : 0;
  const existingAllocations = (session?.paymentAllocations as any[] | undefined)?.reduce(
    (s: number, a: any) => s + Number(a.amount), 0,
  ) ?? 0;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['sessions'] });
    queryClient.invalidateQueries({ queryKey: ['sessions-physio'] });
    queryClient.invalidateQueries({ queryKey: ['sessions-manager'] });
    queryClient.invalidateQueries({ queryKey: ['treatment-plans'] });
    queryClient.invalidateQueries({ queryKey: ['plan-financials'] });
    queryClient.invalidateQueries({ queryKey: ['patients'] });
    queryClient.invalidateQueries({ queryKey: ['patient'] });
    queryClient.invalidateQueries({ queryKey: ['payment-debts'] });
    queryClient.invalidateQueries({ queryKey: ['outstanding-balances'] });
    queryClient.invalidateQueries({ queryKey: ['report-overview'] });
    queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    queryClient.invalidateQueries({ queryKey: ['manager-stats'] });
    queryClient.invalidateQueries({ queryKey: ['physio-stats'] });
  };

  const mutation = useMutation({
    mutationFn: () => sessionsApi.markFree(session.id, reason ? { reason } : undefined),
    onSuccess: () => {
      toast.success('Seanca u bë pa pagesë me sukses!');
      invalidateAll();
      setReason('');
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleClose = () => {
    if (mutation.isPending) return;
    setReason('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Bëje seancën pa pagesë?</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border bg-muted/40 p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Çmimi aktual</span>
              <span className="font-medium">{formatCurrency(currentPrice)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Çmimi i ri</span>
              <span className="font-semibold text-teal-600">0 €</span>
            </div>
          </div>

          {existingAllocations > 0.005 && (
            <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded p-2">
              {formatCurrency(existingAllocations)} të paguara më parë do të kthehen automatikisht si kredit i pacientit.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Ky ndryshim ndikon vetëm te kjo seancë. Çmimi i seancave të tjera nuk do të ndryshojë.
          </p>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Arsyeja (opsionale)</Label>
            <Input
              placeholder="p.sh. Seancë falas, Zbritje, Kompensim..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-8 text-sm"
              disabled={mutation.isPending}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
            Anulo
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="gradient-teal text-white border-0"
          >
            {mutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
            Po, bëje pa pagesë
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
