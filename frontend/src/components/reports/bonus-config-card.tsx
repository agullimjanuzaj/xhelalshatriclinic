'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clinicSettingsApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Coins } from 'lucide-react';
import { toast } from 'sonner';

interface BonusConfigCardProps {
  editable: boolean;
}

// Bonus configuration lives only here (Reports → "Bonuset") — never on the
// Branch form. A single clinic-wide €/trajtim rate, stored on ClinicSettings.
export function BonusConfigCard({ editable }: BonusConfigCardProps) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['clinic-settings'],
    queryFn: () => clinicSettingsApi.get(),
  });
  const settings = (data as any)?.data;

  useEffect(() => {
    if (settings) setAmount(String(settings.bonusPerCompletedSession ?? 0));
  }, [settings]);

  const mutation = useMutation({
    mutationFn: (v: number) => clinicSettingsApi.updateBonus(v),
    onSuccess: () => {
      toast.success('Bonusi u ruajt me sukses');
      queryClient.invalidateQueries({ queryKey: ['clinic-settings'] });
      queryClient.invalidateQueries({ queryKey: ['report-bonuses'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Coins size={16} className="text-teal-600" />
          Konfigurimi i bonusit
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Bonusi për çdo trajtim/seancë të kompletuar</label>
          <div className="flex items-center gap-2 mt-1">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              disabled={!editable}
              onChange={(e) => setAmount(e.target.value)}
              className="w-28"
            />
            <span className="text-sm text-muted-foreground">€</span>
          </div>
        </div>
        {editable && (
          <Button
            size="sm"
            className="gradient-teal text-white border-0"
            disabled={mutation.isPending || amount === ''}
            onClick={() => mutation.mutate(Number(amount))}
          >
            {mutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
            Ruaj
          </Button>
        )}
        {!editable && (
          <p className="text-xs text-muted-foreground pb-2">Vetëm administratori mund ta ndryshojë</p>
        )}
      </CardContent>
    </Card>
  );
}
