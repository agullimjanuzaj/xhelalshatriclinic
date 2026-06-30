import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { getDashboardPath } from '@/lib/routes';

// Legacy role-prefixed paths, the old English /app/* paths, and the more
// recent Albanian /app/* paths (back when pages lived under an `app/`
// segment instead of the `(protected)` route group) -> the current
// Albanian paths with no /app prefix at all. Longest/most-specific
// prefixes first so e.g. '/admin/treatment-plans' wins over a shorter
// '/admin' match.
const LEGACY_PREFIX_MAP: [string, string][] = [
  // Naming rename (Kontrollat/Trajtimet swap): the OLD /seancat (Session
  // listing) moved to /trajtimet — fully vacated, safe to redirect outright.
  // The OLD /trajtimet (TreatmentPlan listing) cannot get the same
  // treatment: that exact URL is now the live Session listing, so a bare
  // /trajtimet visit correctly shows Trajtimet (Session), not a redirect —
  // only the now-renamed TreatmentPlan resource itself lives at /kontrollat.
  ['/seancat', '/trajtimet'],
  ['/admin/dashboard', '/paneli'],
  ['/manager/dashboard', '/paneli'],
  ['/physiotherapist/dashboard', '/paneli'],
  ['/admin/treatment-plans', '/kontrollat'],
  ['/manager/treatment-plans', '/kontrollat'],
  ['/physiotherapist/treatments', '/kontrollat'],
  ['/admin/patients', '/pacientet'],
  ['/manager/patients', '/pacientet'],
  ['/physiotherapist/patients', '/pacientet'],
  ['/admin/sessions', '/trajtimet'],
  ['/physiotherapist/sessions', '/trajtimet'],
  ['/admin/notifications', '/notifications'],
  ['/manager/notifications', '/notifications'],
  ['/physiotherapist/notifications', '/notifications'],
  ['/admin/payments', '/pagesat'],
  ['/manager/payments', '/pagesat'],
  ['/admin/reports', '/raportet'],
  ['/manager/reports', '/raportet'],
  ['/physiotherapist/reports', '/raportet'],
  ['/admin/users', '/perdoruesit'],
  ['/admin/branches', '/deget'],
  // Settings was removed entirely — any old link/bookmark just goes to dashboard
  ['/admin/settings', '/paneli'],
  ['/app/settings', '/paneli'],
  // Old English /app/* (pre-Albanian-URL)
  ['/app/dashboard', '/paneli'],
  ['/app/treatments', '/kontrollat'],
  ['/app/patients', '/pacientet'],
  ['/app/sessions', '/trajtimet'],
  ['/app/payments', '/pagesat'],
  ['/app/reports', '/raportet'],
  ['/app/users', '/perdoruesit'],
  ['/app/branches', '/deget'],
  // Old Albanian /app/* (pages used to live under the app/ URL segment)
  ['/app/paneli', '/paneli'],
  ['/app/pacientet', '/pacientet'],
  ['/app/trajtimet', '/kontrollat'],
  ['/app/seancat', '/trajtimet'],
  ['/app/pagesat', '/pagesat'],
  ['/app/borxhet', '/borxhet'],
  ['/app/raportet', '/raportet'],
  ['/app/perdoruesit', '/perdoruesit'],
  ['/app/deget', '/deget'],
  ['/app/treatment-types', '/treatment-types'],
  ['/app/notifications', '/notifications'],
  ['/app/suggestions', '/sugjerime'],
  // Sign-in page renamed to Albanian
  ['/login', '/kycu'],
];

function resolveLegacyPath(pathname: string): string | null {
  if (pathname === '/app' || pathname === '/app/') return '/paneli';
  for (const [oldPrefix, newPrefix] of LEGACY_PREFIX_MAP) {
    if (pathname === oldPrefix || pathname.startsWith(oldPrefix + '/')) {
      return newPrefix + pathname.slice(oldPrefix.length);
    }
  }
  return null;
}

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const session = req.auth;
  const role = session?.user?.role;

  // Public paths
  if (pathname === '/kycu' || pathname === '/offline') {
    if (role) {
      return NextResponse.redirect(new URL(getDashboardPath(role), req.url));
    }
    return NextResponse.next();
  }

  // Legacy paths -> current paths (keeps old links/bookmarks working)
  const legacyTarget = resolveLegacyPath(pathname);
  if (legacyTarget) {
    return NextResponse.redirect(new URL(legacyTarget + search, req.url));
  }

  // Protected paths
  if (!role) {
    return NextResponse.redirect(new URL('/kycu', req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|workbox-.*\\.js).*)',
  ],
};
