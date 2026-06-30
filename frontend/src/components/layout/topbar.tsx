'use client';

import { useAppStore } from '@/store/use-app-store';
import { Menu, Moon, Sun, LogOut, User, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { getRoleLabel } from '@/lib/utils';
import { BranchSwitcher } from './branch-switcher';
import { useCurrentUser } from '@/hooks/use-current-user';
import { NotificationBell } from './notification-bell';

export function Topbar() {
  const { user, logout } = useCurrentUser();
  const { toggleSidebar } = useAppStore();
  const { setTheme, theme } = useTheme();
  const role = user?.role || '';

  return (
    <header className="sticky top-0 z-30 h-20 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-border flex items-center px-4 gap-4">
      {/* Hamburger */}
      <Button variant="ghost" size="sm" onClick={toggleSidebar} className="lg:hidden">
        <Menu size={20} />
      </Button>

      {/* Branch Switcher */}
      <div className="hidden sm:block">
        <BranchSwitcher />
      </div>

      <div className="flex-1" />

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="hidden sm:flex"
        >
          <Sun size={16} className="rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon size={16} className="absolute rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Ndrysho temën</span>
        </Button>

        {/* Notifications */}
        <NotificationBell enabled={!!user} />

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <div className="w-7 h-7 rounded-full gradient-teal flex items-center justify-center text-white text-xs font-bold">
                {user?.name?.[0] || 'U'}
              </div>
              <span className="hidden md:inline text-sm font-medium">{user?.name}</span>
              <ChevronDown size={14} className="hidden md:inline text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>
              <p className="font-medium">{user?.name}</p>
              <p className="text-xs text-muted-foreground font-normal">{getRoleLabel(role)}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile"><User size={14} className="mr-2" />Profili im</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600"
              onClick={logout}
            >
              <LogOut size={14} className="mr-2" />Dil
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
