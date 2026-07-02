'use client';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';

export interface ClearableDateInputProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
}

// Shared implementation for date and month native inputs.
// - appearance-none: removes iOS/Android browser chrome that makes these
//   inputs taller than regular text inputs.
// - h-10: fixed height to match Select / text Input on all platforms.
// - When a value is set: hides the native calendar/chevron indicator via
//   CSS pseudo-element (WebKit) and shows an X button absolutely positioned
//   at the right edge. pr-[28px] keeps the date text clear of the X button.
// - X is type="button" with stopPropagation so tapping it on iOS clears the
//   value without also triggering the native date picker.
function ClearableNativeInput({
  value,
  onChange,
  onClear,
  type,
  min,
  max,
  disabled,
  className,
}: ClearableDateInputProps & { type: 'date' | 'month' }) {
  const showClear = !!value && !disabled;
  return (
    <div className={cn('relative', className)}>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        disabled={disabled}
        className={cn(
          'h-10 w-full min-w-0 appearance-none',
          showClear && [
            'pr-[28px]',
            '[&::-webkit-calendar-picker-indicator]:opacity-0',
            '[&::-webkit-calendar-picker-indicator]:pointer-events-none',
          ],
        )}
      />
      {showClear && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClear(); }}
          aria-label="Pastro"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}

export function ClearableDateInput(props: ClearableDateInputProps) {
  return <ClearableNativeInput {...props} type="date" />;
}

export function ClearableMonthInput(props: ClearableDateInputProps) {
  return <ClearableNativeInput {...props} type="month" />;
}
