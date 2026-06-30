'use client';

import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

// Builds the page-number sequence with ellipses, e.g.
// page=1, totalPages=9  -> [1, 2, '...', 9]
// page=5, totalPages=9  -> [1, '...', 4, 5, 6, '...', 9]
function buildPageList(page: number, totalPages: number): (number | '...')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

  const pages = new Set<number>([1, totalPages, page]);
  if (page - 1 > 1) pages.add(page - 1);
  if (page + 1 < totalPages) pages.add(page + 1);
  if (page === 1) pages.add(2);
  if (page === totalPages) pages.add(totalPages - 1);

  const sorted = Array.from(pages).sort((a, b) => a - b);
  const result: (number | '...')[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('...');
    result.push(sorted[i]);
  }
  return result;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;
  const pages = buildPageList(page, totalPages);

  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
        <ChevronLeft size={14} />
      </Button>
      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} className="px-2 text-sm text-muted-foreground">...</span>
        ) : (
          <Button
            key={p}
            variant={p === page ? 'default' : 'outline'}
            size="sm"
            className={p === page ? 'gradient-teal text-white border-0' : ''}
            onClick={() => onPageChange(p)}
          >
            {p}
          </Button>
        ),
      )}
      <Button variant="outline" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
        <ChevronRight size={14} />
      </Button>
    </div>
  );
}
