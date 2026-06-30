import { AppSidebar } from './app-sidebar';
import { Topbar } from './topbar';
import { MobileBottomNav } from './mobile-bottom-nav';
import { cn } from '@/lib/utils';

interface DashboardLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function DashboardLayout({ children, className }: DashboardLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar />
        <main className={cn('flex-1 overflow-y-auto p-4 lg:p-6 pb-20 lg:pb-6', className)}>
          {children}
        </main>
        <MobileBottomNav />
      </div>
    </div>
  );
}
