'use client';

import { useEffect, useState } from 'react';
import { WifiOff, RefreshCcw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function OfflinePage() {
  const [checking, setChecking] = useState(false);

  // Auto-reload when the browser detects the connection is back
  useEffect(() => {
    const handleOnline = () => window.location.reload();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  const handleRetry = async () => {
    setChecking(true);
    // Small delay so the user sees feedback, then reload regardless —
    // the browser (and SW) will decide what to serve based on connectivity.
    await new Promise((r) => setTimeout(r, 600));
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center space-y-6 max-w-sm">
        <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center mx-auto">
          <WifiOff size={36} className="text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Nuk ka lidhje me internet</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Kontrolloni lidhjen tuaj. Aplikacioni do të rifreskohet automatikisht sapo interneti të rikthehet.
          </p>
        </div>
        <Button
          onClick={handleRetry}
          disabled={checking}
          className="gap-2 gradient-teal text-white border-0"
        >
          {checking ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <RefreshCcw size={16} />
          )}
          {checking ? 'Duke kontrolluar...' : 'Provo përsëri'}
        </Button>
      </div>
    </div>
  );
}
