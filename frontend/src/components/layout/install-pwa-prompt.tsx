'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Android/Chrome/Windows fire `beforeinstallprompt` once the manifest +
// registered service worker meet installability criteria — Safari/iOS never
// fires this event (there's no programmatic install prompt there; users add
// to home screen manually via the share sheet), so this banner simply never
// appears on iOS, which is the correct/expected behavior.
export function InstallPwaPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('pwa-install-dismissed') === '1') setDismissed(true);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!deferredPrompt || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('pwa-install-dismissed', '1');
  };

  const install = async () => {
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-lg max-w-[calc(100vw-2rem)]">
      <Download size={18} className="text-teal-600 flex-shrink-0" />
      <p className="text-sm">Instalo Xhelal Shatri Clinic si aplikacion</p>
      <Button size="sm" className="gradient-teal text-white border-0 flex-shrink-0" onClick={install}>Instalo</Button>
      <button type="button" onClick={dismiss} className="text-muted-foreground hover:text-foreground flex-shrink-0">
        <X size={16} />
      </button>
    </div>
  );
}
