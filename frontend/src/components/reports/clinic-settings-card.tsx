'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clinicSettingsApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface ClinicSettingsCardProps {
  editable: boolean;
}

export function ClinicSettingsCard({ editable }: ClinicSettingsCardProps) {
  const queryClient = useQueryClient();
  const [hours, setHours] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['clinic-settings'],
    queryFn: () => clinicSettingsApi.get(),
  });
  const settings = (data as any)?.data;

  useEffect(() => {
    if (settings) setHours(String(settings.activeInClinicAutoExpireHours));
  }, [settings]);

  const mutation = useMutation({
    mutationFn: (h: number) => clinicSettingsApi.update(h),
    onSuccess: () => {
      toast.success('Konfigurimi u ruajt me sukses');
      queryClient.invalidateQueries({ queryKey: ['clinic-settings'] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Clock size={16} className="text-teal-600" />
          Konfigurimi i pranisë në klinikë
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Kthe pacientin joaktiv pas sa orësh?</label>
          <div className="flex items-center gap-2 mt-1">
            <Input
              type="number"
              min={1}
              max={48}
              value={hours}
              disabled={!editable}
              onChange={(e) => setHours(e.target.value)}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">orë</span>
          </div>
        </div>
        {editable && (
          <Button
            size="sm"
            className="gradient-teal text-white border-0"
            disabled={mutation.isPending || !hours}
            onClick={() => mutation.mutate(Number(hours))}
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
