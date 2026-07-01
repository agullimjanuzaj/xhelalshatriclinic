// Utilities for Web Push subscription management on the client side.
// These only run in browser contexts (guard every function with the checks
// below before calling them from React components).

export type PushPermission = NotificationPermission | 'unsupported';

// ---------- Detection helpers ─────────────────────────────────────────────────

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

// iOS Safari in standalone PWA mode (added to Home Screen) supports push
// since iOS 16.4. In normal browser mode it doesn't.
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isInstalledPWA(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS standalone
  if ((window.navigator as any).standalone === true) return true;
  // Android / desktop "Add to Home Screen"
  return window.matchMedia('(display-mode: standalone)').matches;
}

export function getPermissionStatus(): PushPermission {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

// ---------- Subscription lifecycle ───────────────────────────────────────────

// Request notification permission if not yet granted.
// Returns the resulting permission state.
export async function requestPermission(): Promise<PushPermission> {
  if (!isPushSupported()) return 'unsupported';
  const result = await Notification.requestPermission();
  return result;
}

// Convert a base64url VAPID public key to a Uint8Array (required by
// PushManager.subscribe).
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    view[i] = rawData.charCodeAt(i);
  }
  return buffer;
}

// Result type — either success with subscription data, or a specific error.
export type SubscribeResult =
  | { endpoint: string; p256dh: string; auth: string; error?: never }
  | { error: string; endpoint?: never };

export function isSubscribeError(r: SubscribeResult): r is { error: string } {
  return 'error' in r && typeof (r as any).error === 'string';
}

function devLog(...args: unknown[]) {
  if (process.env.NODE_ENV === 'development') {
    console.log('[push]', ...args);
  }
}

// Subscribe to push — returns subscription data or an object with a specific
// Albanian error message that can be shown directly in the UI.
export async function subscribeToPush(): Promise<SubscribeResult> {
  devLog('diagnostics', {
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    notificationPermission: typeof Notification !== 'undefined' ? Notification.permission : 'N/A',
    hasVapidKey: !!process.env.NEXT_PUBLIC_VAPID_KEY,
  });

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_KEY;
  if (!vapidKey) {
    return { error: 'VAPID public key mungon në konfigurim. Kontakto administratorin.' };
  }

  if (!isPushSupported()) {
    return { error: 'Shfletuesi ose pajisja nuk mbështet njoftimet push.' };
  }

  if (Notification.permission === 'denied') {
    return { error: 'Leja për njoftime është refuzuar. Aktivizoje nga cilësimet e shfletuesit.' };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    devLog('SW ready, scope:', registration.scope);

    const existing = await registration.pushManager.getSubscription();
    devLog('existing subscription:', existing?.endpoint?.slice(0, 60));

    const sub = existing || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    const json = sub.toJSON();
    const keys = json.keys as Record<string, string> | undefined;
    devLog('subscription created:', sub.endpoint.slice(0, 60) + '...');

    return {
      endpoint: sub.endpoint,
      p256dh: keys?.p256dh ?? '',
      auth: keys?.auth ?? '',
    };
  } catch (err: any) {
    console.error('[push] Subscribe failed:', err);
    const msg: string = err?.message || '';

    if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied')) {
      return { error: 'Leja për njoftime është refuzuar. Aktivizoje nga cilësimet e shfletuesit.' };
    }
    if (
      msg.toLowerCase().includes('applicationserverkey') ||
      msg.toLowerCase().includes('vapid') ||
      msg.toLowerCase().includes('invalid key') ||
      msg.toLowerCase().includes('key')
    ) {
      return { error: 'VAPID key është i pavlefshëm. Kontakto administratorin.' };
    }
    if (msg.toLowerCase().includes('serviceworker') || msg.toLowerCase().includes('service worker')) {
      return { error: 'Service worker nuk është gati. Rindiz faqen dhe provo sërish.' };
    }
    return { error: `Subscription dështoi: ${msg || 'gabim i panjohur'}` };
  }
}

// Unsubscribe the current browser subscription at the push service level.
// Returns the endpoint that was removed (for sending to the backend).
export async function unsubscribeFromPush(): Promise<string | null> {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.getSubscription();
    if (!sub) return null;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    return endpoint;
  } catch (err) {
    console.error('[push] Unsubscribe failed:', err);
    return null;
  }
}
