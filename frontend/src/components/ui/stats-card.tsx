import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  gradient?: 'teal' | 'emerald' | 'blue' | 'amber' | 'red' | 'purple';
  className?: string;
  onClick?: () => void;
}

const gradients = {
  teal: 'gradient-teal',
  emerald: 'gradient-emerald',
  blue: 'gradient-blue',
  amber: 'gradient-amber',
  red: 'bg-gradient-to-br from-red-500 to-rose-600',
  purple: 'bg-gradient-to-br from-purple-500 to-violet-600',
};

export function StatsCard({ title, value, description, icon: Icon, trend, gradient = 'teal', className, onClick }: StatsCardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl bg-white dark:bg-gray-800 border border-border p-6 card-hover',
        onClick && 'cursor-pointer',
        className,
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold text-foreground">{value}</p>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
          {trend && (
            <div className={cn('flex items-center gap-1 text-xs font-medium', trend.value >= 0 ? 'text-emerald-600' : 'text-red-500')}>
              <span>{trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}%</span>
              <span className="text-muted-foreground font-normal">{trend.label}</span>
            </div>
          )}
        </div>
        <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-lg', gradients[gradient])}>
          <Icon size={22} />
        </div>
      </div>
      {/* Decorative circles */}
      <div className={cn('absolute -right-4 -bottom-4 w-20 h-20 rounded-full opacity-10', gradients[gradient])} />
    </div>
  );
}
