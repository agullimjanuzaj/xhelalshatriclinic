'use client';

import { useQuery } from '@tanstack/react-query';
import { treatmentTypesApi } from '@/lib/api';
import { Checkbox } from '@/components/ui/checkbox';
import { extractList } from '@/lib/utils';

interface TreatmentTypesChecklistProps {
  value: string[];
  onChange: (value: string[]) => void;
}

// Shared by Shto/Ndrysho seancë (and the schedule->complete flow) so all
// three forms offer the exact same list, sourced from the admin-managed
// treatment types — never a hardcoded list.
export function TreatmentTypesChecklist({ value, onChange }: TreatmentTypesChecklistProps) {
  const { data } = useQuery({
    queryKey: ['treatment-types', 'active'],
    queryFn: () => treatmentTypesApi.getAll({ activeOnly: true }),
    staleTime: 5 * 60_000,
  });
  const options = extractList<{ id: string; name: string }>(data);

  const toggle = (name: string, checked: boolean) => {
    onChange(checked ? [...value, name] : value.filter((t) => t !== name));
  };

  if (!options.length) {
    return <p className="text-xs text-muted-foreground">Nuk ka lloje trajtimi të disponueshme.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-2 border rounded-lg p-3">
      {options.map((type) => (
        <div key={type.id} className="flex items-center gap-2">
          <Checkbox
            id={`session-type-${type.id}`}
            checked={value.includes(type.name)}
            onCheckedChange={(checked) => toggle(type.name, !!checked)}
          />
          <label htmlFor={`session-type-${type.id}`} className="text-sm cursor-pointer">
            {type.name}
          </label>
        </div>
      ))}
    </div>
  );
}
