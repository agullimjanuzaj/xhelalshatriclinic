'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { WifiOff, RefreshCcw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function NetworkGuard({ children }: { children: React.ReactNode }) {
  const isOnline = useNetworkStatus();
  const queryClient = useQueryClient();
  const wasOfflineRef = useRef(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      return;
    }
    if (wasOfflineRef.current) {
      // Just came back online — flush stale cache and refetch everything active
      wasOfflineRef.current = false;
      queryClient.invalidateQueries();
      queryClient.refetchQueries({ type: 'active' });
    }
  }, [isOnline, queryClient]);

  const handleRetry = async () => {
    setRetrying(true);
    // Give navigator.onLine a moment to update
    await new Promise((r) => setTimeout(r, 400));
    if (navigator.onLine) {
      queryClient.invalidateQueries();
      queryClient.refetchQueries({ type: 'active' });
    }
    setRetrying(false);
  };

  if (!isOnline) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-6 max-w-sm">
          <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center mx-auto">
            <WifiOff size={36} className="text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Nuk ka lidhje me internet</h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Aplikacioni do të rikuperohet automatikisht sapo interneti të rikthehet.
            </p>
          </div>
          <Button
            onClick={handleRetry}
            disabled={retrying}
            className="gap-2 gradient-teal text-white border-0"
          >
            {retrying ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RefreshCcw size={16} />
            )}
            {retrying ? 'Duke kontrolluar...' : 'Provo përsëri'}
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
