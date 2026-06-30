'use client';

import { Search, X } from 'lucide-react';
import { Input } from './input';
import { Button } from './button';
import { cn } from '@/lib/utils';
import { useCallback, useState } from 'react';
import { useDebounce } from '@/hooks/use-debounce';
import { useEffect } from 'react';

interface SearchInputProps {
  placeholder?: string;
  value?: string;
  onChange: (value: string) => void;
  className?: string;
  debounceMs?: number;
}

export function SearchInput({ placeholder = 'Kërko...', value, onChange, className, debounceMs = 400 }: SearchInputProps) {
  const [localValue, setLocalValue] = useState(value || '');
  const debouncedValue = useDebounce(localValue, debounceMs);

  useEffect(() => { onChange(debouncedValue); }, [debouncedValue]);
  useEffect(() => { if (value !== undefined) setLocalValue(value); }, [value]);

  return (
    <div className={cn('relative', className)}>
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-8"
      />
      {localValue && (
        <Button
          variant="ghost"
          size="sm"
          className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
          onClick={() => { setLocalValue(''); onChange(''); }}
        >
          <X size={12} />
        </Button>
      )}
    </div>
  );
}
