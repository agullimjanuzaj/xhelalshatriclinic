import type { NextConfig } from 'next';

// Every runtimeCaching rule must have its own explicit `handlerDidError`
// plugin. Without it, @ducanh2912/next-pwa auto-injects one that minifies
// into a dangling `_ref` reference in the generated sw.js — verified in a
// production build. next-pwa skips its injection once it finds an existing
// `handlerDidError` in a rule's plugin list.

// For non-navigation fetch failures (assets, API calls): return a network-
// error Response so the caller gets a clear failure instead of a hanging
// promise or an "Uncaught (in promise) no-response" rejection in the console.
const safeErrorPlugin = { handlerDidError: async () => Response.error() };

// For page navigation failures (PWA launch, browser reload, hard navigation
// while offline): serve the pre-cached /offline page so the user sees our
// custom offline screen instead of the browser's generic ERR_FAILED page.
//
// WHY NOT rely on fallbacks.document / setCatchHandler?
// Workbox's setCatchHandler is only invoked when handlerDidError throws —
// if handlerDidError returns Response.error() (as safeErrorPlugin does),
// setCatchHandler is bypassed entirely and the browser renders its own
// network-error page. We therefore serve the offline page ourselves here,
// keeping safeErrorPlugin for all non-navigation failures in the same rule.
const navigationFallbackPlugin = {
  handlerDidError: async ({ request }: { request: Request }) => {
    if (request.mode === 'navigate') {
      // caches.match searches all cache stores, including the Workbox
      // precache where /offline was stored at SW install time.
      const cached = await caches.match('/offline', { ignoreSearch: true });
      return (
        cached ||
        new Response('<html><body><h1>Nuk ka lidhje me internet</h1></body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      );
    }
    return Response.error();
  },
};

const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  register: true,
  disable: process.env.NODE_ENV === 'development',
  customWorkerSrc: 'worker',
  // next-pwa's dynamicStartUrl unshifts a NetworkFirst route for "/" that
  // bypasses our runtimeCaching array (no handlerDidError possible there).
  // "/" only redirects in this app anyway. Disabled; the protected-pages
  // rule below covers it.
  dynamicStartUrl: false,
  // Precaches /offline so navigationFallbackPlugin can serve it from cache
  // without touching the network.
  fallbacks: {
    document: '/offline',
  },
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      // ── Auth & login ────────────────────────────────────────────────────
      // Never cache. Always network. On failure: return error (browser will
      // show the offline banner via NetworkGuard on the React side, or the
      // user sees the login form is unavailable — which is correct).
      {
        urlPattern: /\/kycu(\?.*)?$/,
        handler: 'NetworkOnly',
        options: { plugins: [safeErrorPlugin] },
      },
      {
        urlPattern: /\/api\/auth\/.*/,
        handler: 'NetworkOnly',
        options: { plugins: [safeErrorPlugin] },
      },
      {
        urlPattern: /\/api\/v1\/auth\/.*/,
        handler: 'NetworkOnly',
        options: { plugins: [safeErrorPlugin] },
      },
      {
        urlPattern: /\/api\/v1\/pdf\/.*/,
        handler: 'NetworkOnly',
        options: { plugins: [safeErrorPlugin] },
      },
      // ── Protected app pages ─────────────────────────────────────────────
      // NetworkOnly — never serve stale HTML or RSC payloads. The offline
      // page is served by navigationFallbackPlugin for navigation failures
      // (PWA launch / hard reload while offline). Non-navigation failures
      // (Next.js RSC fetches, prefetches) return an error so React can
      // handle them gracefully via its own error boundary / NetworkGuard.
      {
        urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
          sameOrigin &&
          url.pathname !== '/kycu' &&
          url.pathname !== '/offline' &&
          !url.pathname.startsWith('/_next/') &&
          !url.pathname.startsWith('/api/') &&
          !/\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?)$/i.test(url.pathname),
        handler: 'NetworkOnly',
        options: {
          plugins: [navigationFallbackPlugin],
        },
      },
      // ── Static build assets ─────────────────────────────────────────────
      // Versioned by content hash — safe to cache indefinitely.
      {
        urlPattern: /\/_next\/static\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'next-static',
          expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
          cacheableResponse: { statuses: [200] },
          plugins: [safeErrorPlugin],
        },
      },
      {
        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?)$/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'static-assets',
          expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
          cacheableResponse: { statuses: [200] },
          plugins: [safeErrorPlugin],
        },
      },
      // ── Same-origin API calls ────────────────────────────────────────────
      // NetworkOnly — medical data (patients, payments, sessions, controls)
      // must never be served from cache. Stale data in a healthcare context
      // is worse than no data. Failures are handled by React Query's retry
      // logic and the NetworkGuard offline overlay on the React side.
      {
        urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
          sameOrigin && url.pathname.startsWith('/api/'),
        handler: 'NetworkOnly',
        options: { plugins: [safeErrorPlugin] },
      },
    ],
  },
});

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL}/api/v1/:path*`,
      },
    ];
  },
  async headers() {
    // Only apply strict CSP in production. In development, Next.js HMR and
    // source maps require eval — enforcing CSP there breaks the dev server.
    if (process.env.NODE_ENV !== 'production') return [];
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            // No unsafe-eval. Next.js 15 hydration needs unsafe-inline for
            // its own inline script chunks; Workbox service worker lives in
            // worker-src 'self'. connect-src 'self' https: covers the same-
            // origin API rewrite and any configured external API base URL.
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "connect-src 'self' https:",
              "font-src 'self'",
              "worker-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default withPWA(nextConfig);
