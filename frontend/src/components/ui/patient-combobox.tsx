'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import { patientsApi } from '@/lib/api';

interface PatientOption {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  activeInClinic?: boolean;
  activeInClinicExpiresAt?: string | null;
  branch?: { name: string } | null;
}

interface PatientComboboxProps {
  value?: string;
  onChange: (patientId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  // Restricts the search to patients currently checked in at the clinic —
  // used by the session-registration flow so a physiotherapist can never
  // pick a patient who isn't physically present.
  activeInClinicOnly?: boolean;
}

export function PatientCombobox({ value, onChange, disabled, placeholder = 'Zgjidh pacientin', activeInClinicOnly }: PatientComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const debouncedQuery = useDebounce(query, 300);

  const { data: selectedData } = useQuery({
    queryKey: ['patient-combobox-selected', value],
    queryFn: () => patientsApi.getOne(value as string),
    enabled: !!value,
    staleTime: 60_000,
  });
  const selected: PatientOption | undefined = (selectedData as any)?.data;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['patient-combobox-search', debouncedQuery, activeInClinicOnly],
    queryFn: () => patientsApi.getAll({
      search: debouncedQuery || undefined,
      limit: 30,
      activeInClinic: activeInClinicOnly || undefined,
    }),
    enabled: open,
  });
  const patients: PatientOption[] = (data as any)?.data || [];

  // Active patients come first from the backend (orderBy activeInClinic desc),
  // but re-sort client-side as a safety net in case the response order shifts.
  const sorted = React.useMemo(() => {
    if (activeInClinicOnly) return patients;
    const active = patients.filter((p) => p.activeInClinic);
    const rest = patients.filter((p) => !p.activeInClinic);
    return [...active, ...rest];
  }, [patients, activeInClinicOnly]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-10 w-full items-center justify-between rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? `${selected.firstName} ${selected.lastName} — ${selected.phone}` : placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      {/* Portal renders into <body> so it's never clipped by an ancestor's
          overflow:hidden. avoidCollisions + collisionPadding prevent the
          dropdown from overflowing off the screen on small/mobile viewports. */}
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        avoidCollisions
        collisionPadding={12}
        sideOffset={4}
      >
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="h-4 w-4 shrink-0 opacity-50" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Kërko sipas emrit, mbiemrit ose telefonit..."
            className="flex h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        {/* overflow-y-scroll (not auto) ensures iOS Safari creates a native
            scroll layer; overscroll-contain stops the parent from scrolling
            when the list is at its limit; max-h uses svh so the dropdown
            never extends beyond the visible viewport on mobile. */}
        <div className="max-h-[min(16rem,50svh)] overflow-y-scroll overscroll-contain p-1">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Duke kërkuar...
            </div>
          )}
          {isError && (
            <div className="py-6 text-center text-sm text-red-600">Ndodhi një gabim gjatë kërkimit</div>
          )}
          {!isLoading && !isError && sorted.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {activeInClinicOnly
                ? "Nuk ka pacientë aktivë në klinikë. Kërkoni recepsionin t'i shënojë aktivë."
                : 'Nuk u gjet asnjë pacient'}
            </div>
          )}
          {!isLoading &&
            sorted.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onChange(p.id);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                  value === p.id && 'bg-accent/60'
                )}
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium">{p.firstName} {p.lastName}</span>
                    {p.activeInClinic && (
                      <span className="inline-flex items-center rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 shrink-0">
                        Aktiv në klinikë
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground truncate">
                    {p.phone}{p.branch?.name ? ` · ${p.branch.name}` : ''}
                  </span>
                </div>
                {value === p.id && <Check className="h-4 w-4 shrink-0" />}
              </button>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
