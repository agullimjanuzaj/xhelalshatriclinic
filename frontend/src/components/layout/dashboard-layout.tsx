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
    // dvh = dynamic viewport height (shrinks when mobile browser chrome
    // appears/disappears, unlike 100vh which is always the "full" height and
    // causes content to be hidden behind the address bar on iOS Safari).
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      <AppSidebar />
      {/* Right column: topbar + scrollable main + fixed bottom-nav.
          No overflow-hidden here so position:fixed children (MobileBottomNav)
          stay viewport-relative on iOS (overflow:hidden on a parent creates a
          new stacking context that breaks fixed positioning in Safari/WebKit). */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        {/* The only scrollable region — everything else is viewport-fixed. */}
        <main
          className={cn(
            'flex-1 overflow-y-auto overscroll-y-contain',
            'p-4 lg:p-6',
            // Reserve space for the mobile bottom nav + iOS home-indicator.
            // lg:pb-6 restores the desktop value (no bottom nav there).
            'pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] lg:pb-6',
            className,
          )}
        >
          {children}
        </main>
        <MobileBottomNav />
      </div>
    </div>
  );
}
