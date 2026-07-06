'use client';

import { useMutation } from '@tanstack/react-query';
import { sessionsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';
import { extractItem } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  treatmentTypes: string[];
  complaints?: string[];
  complaintDescription?: string;
  diagnosis?: string;
  selectedDiagnoses?: string[];
  planNotes?: string;
  sessionNumber?: number;
  totalSessions?: number;
  onGenerated: (text: string) => void;
}

export function GenerateSessionNoteButton({
  treatmentTypes,
  complaints,
  complaintDescription,
  diagnosis,
  selectedDiagnoses,
  planNotes,
  sessionNumber,
  totalSessions,
  onGenerated,
}: Props) {
  const mutation = useMutation({
    mutationFn: () =>
      sessionsApi.generateNote({
        treatmentTypes,
        complaints,
        complaintDescription,
        diagnosis,
        selectedDiagnoses,
        planNotes,
        sessionNumber,
        totalSessions,
      }),
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
      disabled={mutation.isPending || !treatmentTypes.length}
      title={
        !treatmentTypes.length
          ? 'Zgjidhni të paktën një lloj trajtimi'
          : 'Gjenero shënimin e seancës me AI'
      }
      onClick={() => mutation.mutate()}
    >
      {mutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
      Gjenero
    </Button>
  );
}
