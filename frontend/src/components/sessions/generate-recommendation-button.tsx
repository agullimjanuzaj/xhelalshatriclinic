'use client';

import { useMutation } from '@tanstack/react-query';
import { sessionsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';
import { extractItem } from '@/lib/utils';
import { toast } from 'sonner';

interface GenerateRecommendationButtonProps {
  notes: string;
  treatmentTypes?: string[];
  onGenerated: (text: string) => void;
}

// Drafts a recommendation from the short note's content — never sent
// anywhere automatically, just fills the textarea so the physiotherapist
// can review and edit before saving.
export function GenerateRecommendationButton({ notes, treatmentTypes, onGenerated }: GenerateRecommendationButtonProps) {
  const mutation = useMutation({
    mutationFn: () => sessionsApi.generateRecommendation({ notes, treatmentTypes }),
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
      disabled={mutation.isPending || !notes?.trim()}
      title={!notes?.trim() ? 'Shkruani së pari shënimin e shkurtër' : 'Gjenero rekomandim nga shënimi'}
      onClick={() => mutation.mutate()}
    >
      {mutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
      Gjenero
    </Button>
  );
}
