'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { usersApi } from '@/lib/api';

interface PhysiotherapistOption {
  id: string;
  firstName: string;
  lastName: string;
}

interface PhysiotherapistComboboxProps {
  value?: string;
  onChange: (id: string) => void;
  // Scopes the option list to a single branch — a Manager only ever sees
  // their own branch's physiotherapists, never the whole clinic's.
  branchId?: string;
  placeholder?: string;
  allLabel?: string;
}

// Searchable physiotherapist picker for the Trajtimet filter row. The
// physiotherapist count per clinic is small, so the list is fetched once
// and filtered client-side as the user types — no debounced backend
// search needed (unlike PatientCombobox, which searches a much larger set).
export function PhysiotherapistCombobox({ value, onChange, branchId, placeholder = 'Të gjithë fizioterapeutët', allLabel = 'Të gjithë' }: PhysiotherapistComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  const { data } = useQuery({
    queryKey: ['physiotherapists-combobox', branchId],
    queryFn: () => usersApi.getAll({ role: 'PHYSIOTHERAPIST', branchId: branchId || undefined, limit: 200 }),
    staleTime: 5 * 60_000,
  });
  const physios: PhysiotherapistOption[] = (data as any)?.data || [];

  const filtered = query
    ? physios.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(query.toLowerCase()))
    : physios;

  const selected = physios.find((p) => p.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-10 w-full items-center justify-between rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? `${selected.firstName} ${selected.lastName}` : placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="h-4 w-4 shrink-0 opacity-50" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Kërko fizioterapeutin..."
            className="flex h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); }}
            className={cn(
              'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground',
              !value && 'bg-accent/60',
            )}
          >
            {allLabel}
            {!value && <Check className="h-4 w-4 shrink-0" />}
          </button>
          {filtered.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">Nuk u gjet asnjë fizioterapeut</div>
          )}
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onChange(p.id); setOpen(false); }}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                value === p.id && 'bg-accent/60',
              )}
            >
              <span>{p.firstName} {p.lastName}</span>
              {value === p.id && <Check className="h-4 w-4 shrink-0" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
