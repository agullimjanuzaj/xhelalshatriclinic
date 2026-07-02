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
        className="w-full"
        style={showClear ? { paddingRight: '32px' } : undefined}
      />
      {showClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Pastro datën"
          style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', width: '20px', height: '20px' }}
          className="flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
