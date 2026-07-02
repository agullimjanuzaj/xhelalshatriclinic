'use client';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';

interface ClearableDateInputProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
}

// X sits OUTSIDE the <input> as a flex sibling — no absolute positioning,
// no padding-right tricks that clip the year on narrow screens. The input
// always renders full-width text; the button area is reserved at all times
// (visibility:hidden when empty) to prevent layout shift on clear.
export function ClearableDateInput({
  value,
  onChange,
  onClear,
  min,
  max,
  disabled,
  className,
}: ClearableDateInputProps) {
  const showClear = !!value && !disabled;
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        disabled={disabled}
        className="flex-1 min-w-0 w-full"
      />
      <button
        type="button"
        onClick={showClear ? onClear : undefined}
        aria-label="Pastro datën"
        aria-hidden={!showClear}
        tabIndex={showClear ? 0 : -1}
        style={{ visibility: showClear ? 'visible' : 'hidden' }}
        className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded text-muted-foreground hover:text-foreground transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  );
}
