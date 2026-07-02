import type { NextConfig } from 'next';

// IMPORTANT #1: for @ducanh2912/next-pwa, `runtimeCaching` (and the rest of
// the Workbox GenerateSW options) is NOT a top-level plugin option — it must
// be nested under `workboxOptions`. Putting it at the top level (as a
// previous version of this file did) is silently ignored, so the plugin
// falls back to its own bundled `defaultCache` rules instead of these.
//
// IMPORTANT #2: the actual source of the `_ref is not defined` Workbox
// crash is `@ducanh2912/next-pwa` itself (dist/index.js, around the
// `"handlerDidError" in e` check) — it auto-injects a `handlerDidError`
// plugin into every runtimeCaching rule that doesn't already define one, to
// wire up `fallbacks`. That auto-injected arrow function minifies into a
// dangling `_ref` reference in the generated sw.js (verified directly in a
// production build). The fix is to give every rule its own explicit
// `handlerDidError` plugin below — next-pwa skips its own injection once it
// finds one already present (`e.options.plugins?.find(p => "handlerDidError" in p)`),
// so ours (a plain `Response.error()`, safe for non-document assets — never
// invoked for documents anyway since `fallbacks.document` handles those)
// is what actually ships.
const safeErrorPlugin = { handlerDidError: async () => Response.error() };

const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  register: true,
  disable: process.env.NODE_ENV === 'development',
  // Merges worker/index.js into the generated sw.js — adds the push and
  // notificationclick handlers without replacing the auto-generated
  // Workbox precache/runtime caching rules.
  customWorkerSrc: 'worker',
  // next-pwa's own automatic start-URL handling (`dynamicStartUrl`, on by
  // default — NOT `cacheStartUrl`, which is a different, unrelated option)
  // unshifts a "start-url" NetworkFirst route directly into the runtime
  // caching list, bypassing our runtimeCaching array entirely — so there's
  // no rule of ours to attach a handlerDidError plugin to in order to dodge
  // the _ref bug there. "/" always redirects via middleware in this app
  // anyway (never serves unique content of its own), so there's nothing
  // worth caching there. Disabled outright; our protected-pages NetworkOnly
  // rule below covers "/" regardless.
  dynamicStartUrl: false,
  // When a navigation request fails outright (genuinely offline, not just a
  // slow network), Workbox serves this static page instead of a browser
  // connection-error screen — the base offline UI fallback.
  fallbacks: {
    document: '/offline',
  },
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      // Auth endpoints, the sign-in page, and the PDF/invoice download
      // endpoints must always hit the network — caching any of these is how
      // you get "looks logged out" or "invoice shows old data" bugs.
      {
        urlPattern: /\/kycu(\?.*)?$/,
        handler: 'NetworkOnly',
      },
      {
        urlPattern: /\/api\/auth\/.*/,
        handler: 'NetworkOnly',
      },
      {
        urlPattern: /\/api\/v1\/auth\/.*/,
        handler: 'NetworkOnly',
      },
      {
        urlPattern: /\/api\/v1\/pdf\/.*/,
        handler: 'NetworkOnly',
      },
      // Protected pages (everything except /kycu, /offline, static assets,
      // and API calls) must never serve a stale cached HTML/RSC payload for
      // a different user after logout/login — same-origin, not a Next.js
      // static asset, not an API call.
      // safeErrorPlugin is required here to prevent uncaught `no-response`
      // promise rejections when the network is unavailable. It also
      // pre-empts next-pwa's own auto-injected handlerDidError (which
      // minifies into a broken `_ref` reference in the generated sw.js).
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
          plugins: [safeErrorPlugin],
        },
      },
      // Static, versioned Next.js build assets — safe to cache aggressively.
      {
        urlPattern: /\/_next\/static\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'next-static',
          expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
          cacheableResponse: { statuses: [0, 200] },
          plugins: [safeErrorPlugin],
        },
      },
      {
        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?)$/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'static-assets',
          expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
          cacheableResponse: { statuses: [0, 200] },
          plugins: [safeErrorPlugin],
        },
      },
      // Everything else same-origin API: a short-lived NetworkFirst fallback
      // for offline resilience, explicitly scoped to GET + successful
      // responses only — never auth, never protected pages (already
      // excluded above).
      {
        urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) => sameOrigin && url.pathname.startsWith('/api/'),
        method: 'GET',
        handler: 'NetworkFirst',
        options: {
          cacheName: 'api-cache',
          expiration: { maxEntries: 100, maxAgeSeconds: 5 * 60 },
          cacheableResponse: { statuses: [0, 200] },
          plugins: [safeErrorPlugin],
        },
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
