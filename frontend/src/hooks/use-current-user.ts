'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ROUTES } from '@/lib/routes';

export interface CurrentUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  name: string;
  role: 'ADMIN' | 'MANAGER' | 'PHYSIOTHERAPIST';
  isActive: boolean;
  branchId: string | null;
  branch: any | null;
  userBranches: any[];
  managedBranches: any[];
  accessToken: string;
}

/**
 * Single source of truth for "who is the logged-in user right now".
 * Wraps useSession() (NextAuth's session, already populated with role/branchId
 * via lib/auth.ts's jwt/session callbacks) instead of introducing a second,
 * competing fetch — see the auth/session debug session for why a second
 * source caused stale-state bugs.
 *
 * Every protected page should gate its data queries on `!isLoading && user`,
 * never fire requests while isLoading, and treat a missing user (post-loading)
 * as "redirect to /login", not as "render an empty page".
 */
export function useCurrentUser() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  const isLoading = status === 'loading';
  const user: CurrentUser | null = session?.user
    ? {
        id: session.user.id,
        username: session.user.username,
        firstName: session.user.firstName,
        lastName: session.user.lastName,
        name: session.user.name,
        role: session.user.role as CurrentUser['role'],
        isActive: session.user.isActive,
        branchId: session.user.branchId,
        branch: session.user.branch,
        userBranches: session.user.userBranches || [],
        managedBranches: session.user.managedBranches || [],
        accessToken: session.accessToken,
      }
    : null;

  const error = !isLoading && status === 'unauthenticated' ? new Error('Nuk jeni i kyçur') : null;

  // If the session disappears entirely (e.g. token expired, server rejected it),
  // clean up rather than leaving stale cached data behind.
  useEffect(() => {
    if (!isLoading && status === 'unauthenticated') {
      queryClient.clear();
    }
  }, [isLoading, status, queryClient]);

  const logout = async () => {
    await signOut({ redirect: false });
    queryClient.clear();
    router.replace(ROUTES.login);
  };

  return { user, isLoading, error, logout };
}
