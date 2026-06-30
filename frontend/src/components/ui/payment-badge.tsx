import { cn, getPaymentStatusColor, getPaymentStatusLabel } from '@/lib/utils';

interface PaymentBadgeProps {
  status: string;
  className?: string;
}

export function PaymentBadge({ status, className }: PaymentBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
      getPaymentStatusColor(status),
      className,
    )}>
      {getPaymentStatusLabel(status)}
    </span>
  );
}
