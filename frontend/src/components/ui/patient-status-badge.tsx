import { cn, getPatientStatusColor, getPatientStatusLabel } from '@/lib/utils';

interface PatientStatusBadgeProps {
  status: string | null | undefined;
  className?: string;
}

export function PatientStatusBadge({ status, className }: PatientStatusBadgeProps) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
      getPatientStatusColor(status),
      className,
    )}>
      {getPatientStatusLabel(status)}
    </span>
  );
}
