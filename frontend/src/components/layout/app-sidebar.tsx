'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/use-app-store';
import {
  LayoutDashboard, Users, UserCheck, Building2, Stethoscope,
  Calendar, CreditCard, BarChart3, Bell, Tags, Lightbulb,
  X, type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getNavItemsForRole, IconName } from '@/lib/navigation';
import { useCurrentUser } from '@/hooks/use-current-user';

const ICONS: Record<IconName, LucideIcon> = {
  LayoutDashboard, Users, Stethoscope, Calendar, CreditCard,
  BarChart3, Bell, UserCheck, Building2, Tags, Lightbulb,
};

export function AppSidebar() {
  const { user, isLoading } = useCurrentUser();
  const { sidebarOpen, setSidebarOpen } = useAppStore();
  const pathname = usePathname();
  const role = user?.role;
  // Never guess a role while loading or unauthenticated — an empty menu is
  // correct here; defaulting to a role would briefly show the wrong nav.
  const navItems = !isLoading && role ? getNavItemsForRole(role) : [];

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 z-50 w-64 flex-col bg-white dark:bg-gray-900 border-r border-border shadow-sm transition-transform duration-300',
          'flex',
          // Mobile: start below header (h-14) and end above bottom nav + safe area
          'top-14 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))]',
          // Desktop: full height, static (not fixed)
          'lg:top-0 lg:bottom-0 lg:h-full lg:static lg:z-auto lg:shadow-none',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:translate-x-0',
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 h-14 lg:h-16 border-b border-border">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/icons/icon-192x192.png" alt="Xhelal Shatri Clinic" width={40} height={40} className="rounded-xl flex-shrink-0" />
            <div className="flex flex-col">
              <span className="text-sm font-bold text-foreground leading-tight">Xhelal Shatri</span>
              <span className="text-[10px] text-muted-foreground leading-tight">Clinic</span>
            </div>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={16} />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
          {navItems.map((item) => {
            const Icon = ICONS[item.icon];
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => { if (window.innerWidth < 1024) setSidebarOpen(false); }}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <span className={cn(isActive && 'text-teal-600 dark:text-teal-400')}>
                  <Icon size={18} />
                </span>
                {item.label}
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-teal-500" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User info */}
        <div className="border-t border-border p-4">
          <Link href="/profile" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-full gradient-teal flex items-center justify-center text-white text-xs font-bold">
              {user?.name?.[0] || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {role === 'ADMIN' ? 'Administrator' : role === 'MANAGER' ? 'Menaxher' : role === 'PHYSIOTHERAPIST' ? 'Fizioterapeut' : ''}
              </p>
            </div>
          </Link>
        </div>
      </aside>
    </>
  );
}
