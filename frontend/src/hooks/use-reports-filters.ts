import { useState } from 'react';

export interface ReportsAppliedFilters {
  month?: string;
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
  branchId?: string;
}

// Single source of truth for the Reports page's filter row — every tab
// (Trajtimet, Të ardhurat, Balancat, Bonuset) reads from the same
// `applied` object, so switching tabs never drops a filter and "Pastro
// filtrat" clears every tab in one shot. Month takes priority over the
// raw date range when both are present (matches the existing UI: the date
// inputs are disabled while a month is selected).
export function useReportsFilters(initialBranchId?: string) {
  const [month, setMonth] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [userId, setUserId] = useState('');
  const [branchId, setBranchId] = useState(initialBranchId || '');
  const [applied, setApplied] = useState<ReportsAppliedFilters>({});

  const apply = () => {
    setApplied({
      month: month || undefined,
      dateFrom: month ? undefined : fromDate || undefined,
      dateTo: month ? undefined : toDate || undefined,
      userId: userId || undefined,
      branchId: branchId || undefined,
    });
  };

  const clear = () => {
    setMonth('');
    setFromDate('');
    setToDate('');
    setUserId('');
    if (!initialBranchId) setBranchId('');
    setApplied({});
  };

  return {
    month, setMonth,
    fromDate, setFromDate,
    toDate, setToDate,
    userId, setUserId,
    branchId, setBranchId,
    applied,
    apply,
    clear,
  };
}
