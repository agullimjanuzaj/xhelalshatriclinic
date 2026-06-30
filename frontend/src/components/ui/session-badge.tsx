import { cn, getSessionStatusColor, getSessionStatusLabel } from '@/lib/utils';

interface SessionBadgeProps {
  status: string;
  className?: string;
}

export function SessionBadge({ status, className }: SessionBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
      getSessionStatusColor(status),
      className,
    )}>
      {getSessionStatusLabel(status)}
    </span>
  );
}
