'use client';

import { WifiOff, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center space-y-6 max-w-sm">
        <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center mx-auto">
          <WifiOff size={36} className="text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Nuk ka internet</h1>
          <p className="text-muted-foreground mt-2">
            Ju lutemi kontrolloni lidhjen tuaj me internetin dhe provoni përsëri.
          </p>
        </div>
        <Button
          onClick={() => window.location.reload()}
          className="gap-2 gradient-teal text-white border-0"
        >
          <RefreshCcw size={16} />
          Provo përsëri
        </Button>
      </div>
    </div>
  );
}
