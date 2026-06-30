'use client';

import { useMutation } from '@tanstack/react-query';
import { treatmentPlansApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';
import { extractItem } from '@/lib/utils';
import { toast } from 'sonner';

interface GenerateNotesButtonProps {
  diagnosis: string;
  treatmentTypes: string[];
  totalSessions?: number;
  existingNotes?: string;
  complaints?: string[];
  selectedDiagnoses?: string[];
  onGenerated: (text: string) => void;
}

// Drafts "Plani i tretmanit" from the diagnosis, selected main complaints,
// checked suggested diagnoses, and treatment types (plus session count and
// any existing notes) — never sent anywhere automatically, just fills the
// textarea so the clinician can review/edit before saving. Enabled only once
// both diagnosis and at least one treatment type are present.
export function GenerateNotesButton({ diagnosis, treatmentTypes, totalSessions, existingNotes, complaints, selectedDiagnoses, onGenerated }: GenerateNotesButtonProps) {
  const canGenerate = !!diagnosis?.trim() && treatmentTypes.length > 0;
  const hasExistingText = !!existingNotes?.trim();

  const mutation = useMutation({
    mutationFn: () => treatmentPlansApi.generateNotes({ diagnosis, treatmentTypes, totalSessions, existingNotes, complaints, selectedDiagnoses }),
    onSuccess: (res: any) => {
      const data = extractItem<{ notes: string }>(res);
      if (data?.notes) onGenerated(data.notes);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleClick = () => {
    if (hasExistingText && !window.confirm('Shënimet ekzistuese do të zëvendësohen. Vazhdo?')) return;
    mutation.mutate();
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 text-xs text-teal-600 hover:text-teal-700"
      disabled={!canGenerate || mutation.isPending}
      title={canGenerate ? 'Gjenero nga diagnoza dhe llojet e trajtimit' : 'Plotëso diagnozën dhe zgjidh të paktën një lloj trajtimi'}
      onClick={handleClick}
    >
      {mutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
      {mutation.isPending ? 'Duke gjeneruar...' : 'Gjenero'}
    </Button>
  );
}
