'use client';

import { SessionProvider } from 'next-auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { useEffect, useState } from 'react';
import { NetworkGuard } from '@/components/layout/network-guard';

// Reloads the page once when a new service worker takes control, ensuring
// clients pick up the new JS bundles without a manual reinstall.
function SwUpdateWatcher() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // Track whether a SW was already controlling the page on mount.
    // If not (first install), skip the first controllerchange to avoid
    // reloading on initial activation.
    let hadController = !!navigator.serviceWorker.controller;
    const handler = () => {
      if (!hadController) { hadController = true; return; }
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', handler);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', handler);
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60,
            // Pause queries when offline; resume automatically on reconnect
            // without showing error states — components stay in loading state
            // until the network comes back.
            networkMode: 'online',
            refetchOnReconnect: 'always',
            retry: (failureCount, error: any) => {
              // Never retry auth/client errors — they won't change on retry
              if (error?.status >= 400 && error?.status < 500) return false;
              return failureCount < 2;
            },
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
          },
        },
      }),
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          <NetworkGuard>
            {children}
          </NetworkGuard>
          <Toaster
            position="top-right"
            richColors
            closeButton
            toastOptions={{
              duration: 4000,
            }}
          />
        </ThemeProvider>
        <SwUpdateWatcher />
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </SessionProvider>
  );
}
