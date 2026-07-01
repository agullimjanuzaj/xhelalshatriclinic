'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';

export interface Column<T> {
  header: string;
  accessor: ((row: T) => React.ReactNode) | keyof T;
  className?: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  pagination?: PaginationMeta;
  onPageChange?: (page: number) => void;
  emptyMessage?: string;
  className?: string;
  // Makes each row clickable (e.g. row -> detail page). Clicks on anything
  // marked data-stop-row-click (action buttons, links) are ignored so a
  // "Fshi"/"Ndrysho" button doesn't also trigger navigation.
  onRowClick?: (row: T) => void;
}

export function DataTable<T extends object>({
  columns,
  data,
  isLoading,
  isError,
  errorMessage,
  pagination,
  onPageChange,
  emptyMessage = 'Nuk ka të dhëna',
  className,
  onRowClick,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  // Never collapse a real error into the empty state — they mean different
  // things (no data vs. couldn't load data) and need different user actions.
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-3">
          <span className="text-2xl">⚠️</span>
        </div>
        <p className="text-sm text-red-600">{errorMessage || 'Ndodhi një gabim gjatë ngarkimit të të dhënave'}</p>
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
          <span className="text-2xl">📋</span>
        </div>
        <p className="text-muted-foreground text-sm">{emptyMessage}</p>
      </div>
    );
  }

  const getCellValue = (row: T, col: Column<T>): React.ReactNode => {
    if (typeof col.accessor === 'function') return col.accessor(row);
    const val = row[col.accessor];
    return val != null ? String(val) : '—';
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {columns.map((col, i) => (
                <TableHead key={i} className={cn('text-xs font-semibold uppercase tracking-wide', col.className)}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, i) => (
              <TableRow
                key={(row as any).id ?? i}
                className={cn('hover:bg-muted/30 transition-colors', onRowClick && 'cursor-pointer')}
                onClick={(e) => {
                  if (!onRowClick) return;
                  if ((e.target as HTMLElement).closest('[data-stop-row-click]')) return;
                  onRowClick(row);
                }}
              >
                {columns.map((col, j) => (
                  <TableCell key={j} className={cn('py-3', col.className)}>
                    {getCellValue(row, col)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} nga {pagination.total}
          </span>
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={(p) => onPageChange?.(p)}
          />
        </div>
      )}
    </div>
  );
}
