'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Users, Stethoscope, Calendar, CreditCard,
  BarChart3, Bell, UserCheck, Building2, Tags, Lightbulb, type LucideIcon,
} from 'lucide-react';
import { getMobileNavItemsForRole, IconName } from '@/lib/navigation';
import { useCurrentUser } from '@/hooks/use-current-user';

const ICONS: Record<IconName, LucideIcon> = {
  LayoutDashboard, Users, Stethoscope, Calendar, CreditCard,
  BarChart3, Bell, UserCheck, Building2, Tags, Lightbulb,
};

export function MobileBottomNav() {
  const { user, isLoading } = useCurrentUser();
  const pathname = usePathname();
  const items = !isLoading && user?.role ? getMobileNavItemsForRole(user.role) : [];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-t border-border">
      <div className="flex">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 py-2 text-xs transition-colors',
                isActive
                  ? 'text-teal-600 dark:text-teal-400'
                  : 'text-muted-foreground',
              )}
            >
              <Icon size={20} />
              <span className="text-[10px]">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
