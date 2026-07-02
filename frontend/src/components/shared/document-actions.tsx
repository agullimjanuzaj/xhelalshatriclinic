'use client';

import { Button } from '@/components/ui/button';
import { Eye, Printer, Share2 } from 'lucide-react';

interface DocumentActionsProps {
  onShow: () => void;
  onPrint: () => void;
  onShare: () => Promise<void>;
}

export function DocumentActions({ onShow, onPrint, onShare }: DocumentActionsProps) {
  return (
    <div className="flex items-center gap-1" data-stop-row-click>
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onShow} title="Shfaq">
        <Eye size={14} />
      </Button>
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onPrint} title="Printo">
        <Printer size={14} />
      </Button>
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onShare} title="Ndaj">
        <Share2 size={14} />
      </Button>
    </div>
  );
}
