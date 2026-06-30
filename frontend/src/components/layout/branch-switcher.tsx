'use client';

import { useQuery } from '@tanstack/react-query';
import { branchesApi } from '@/lib/api';
import { useAppStore } from '@/store/use-app-store';
import { useSession } from 'next-auth/react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Building2 } from 'lucide-react';

export function BranchSwitcher() {
  const { data: session } = useSession();
  const { selectedBranchId, setSelectedBranchId } = useAppStore();
  const role = session?.user?.role;

  const { data: branchesData } = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchesApi.getAll(),
    enabled: role === 'ADMIN',
    staleTime: 5 * 60_000,
  });

  // Non-admins don't get a switcher
  if (role !== 'ADMIN') {
    const branch = session?.user?.userBranches?.[0]?.branch;
    if (!branch) return null;
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Building2 size={14} />
        <span className="font-medium text-foreground">{branch.name}</span>
      </div>
    );
  }

  const branches = (branchesData as any)?.data || [];

  return (
    <Select
      value={selectedBranchId || 'all'}
      onValueChange={(v) => setSelectedBranchId(v === 'all' ? null : v)}
    >
      <SelectTrigger className="w-40 h-8 text-sm">
        <Building2 size={14} className="mr-1 text-muted-foreground" />
        <SelectValue placeholder="Të gjitha degët" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Të gjitha degët</SelectItem>
        {branches.map((b: any) => (
          <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
