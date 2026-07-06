'use client';

import { useMutation } from '@tanstack/react-query';
import { treatmentPlansApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';
import { extractItem } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  complaints: string[];
  category?: string;
  onGenerated: (text: string) => void;
}

export function GenerateComplaintDescriptionButton({ complaints, category, onGenerated }: Props) {
  const mutation = useMutation({
    mutationFn: () => treatmentPlansApi.generateComplaintDescription(complaints, category),
    onSuccess: (res: any) => {
      const data = extractItem<{ text: string; source: string }>(res);
      if (data?.text) onGenerated(data.text);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 text-xs text-teal-600 hover:text-teal-700"
      disabled={mutation.isPending || !complaints.length}
      title={!complaints.length ? 'Zgjidhni të paktën një ankesë' : 'Gjenero përshkrimin nga ankesat e zgjedhura'}
      onClick={() => mutation.mutate()}
    >
      {mutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
      Gjenero
    </Button>
  );
}
