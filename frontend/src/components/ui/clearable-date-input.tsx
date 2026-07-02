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
    <div className={cn('relative', className)}>
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        disabled={disabled}
        className="w-full pr-9"
      />
      {showClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Pastro datën"
          className="absolute right-0 top-0 h-full w-9 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
