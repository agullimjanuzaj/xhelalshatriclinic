'use client';

import { Button } from '@/components/ui/button';
import { Eye, Printer, Share2 } from 'lucide-react';
import { shareText as share } from '@/lib/share';

interface DocumentActionsProps {
  onShow: () => void;
  onPrint: () => void;
  shareText: string;
  disabledShare?: boolean;
}

// Shared "Shfaq / Printo / Ndaj" action triplet used on both the Sessions
// and Treatments tables — keeps the three icons/order consistent. Sharing
// is generic (Web Share API, with a clipboard-copy fallback) rather than
// tied to one specific app.
export function DocumentActions({ onShow, onPrint, shareText, disabledShare }: DocumentActionsProps) {
  return (
    <div className="flex items-center gap-1" data-stop-row-click>
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onShow} title="Shfaq">
        <Eye size={14} />
      </Button>
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onPrint} title="Printo">
        <Printer size={14} />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => share(shareText)}
        title={disabledShare ? 'Pacienti nuk ka numër telefoni' : 'Ndaj'}
        disabled={disabledShare}
      >
        <Share2 size={14} />
      </Button>
    </div>
  );
}
