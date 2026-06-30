import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

class InvalidCredentialsError extends CredentialsSignin {
  code = 'invalid_credentials';
}

class InactiveAccountError extends CredentialsSignin {
  code = 'inactive_account';
}

// Decodes a JWT's `exp` claim (seconds since epoch) without verifying the
// signature — we only need this to know when to proactively refresh, the
// backend is the one that actually verifies the token on every request.
function getTokenExpiryMs(accessToken: string): number {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString('utf8'));
    return (payload.exp ?? 0) * 1000;
  } catch {
    return 0;
  }
}

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) throw new Error('refresh_failed');
  const data = await res.json();
  if (!data.success || !data.data?.accessToken) throw new Error('refresh_failed');
  return data.data as { accessToken: string; refreshToken: string };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        username: { label: 'Emri i përdoruesit', type: 'text' },
        password: { label: 'Fjalëkalimi', type: 'password' },
      },
      async authorize(credentials) {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/login`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: credentials.username, password: credentials.password }),
          },
        );
        if (!res.ok) {
          const errBody = await res.json().catch(() => null);
          if (errBody?.message === 'Llogaria është joaktive') {
            throw new InactiveAccountError();
          }
          throw new InvalidCredentialsError();
        }
        const data = await res.json();
        if (!data.success || !data.data?.user) {
          throw new InvalidCredentialsError();
        }
        const u = data.data.user;
        const primaryBranch = u.userBranches?.[0]?.branch || u.managedBranches?.[0] || null;
        return {
          id: u.id,
          username: u.username,
          firstName: u.firstName,
          lastName: u.lastName,
          name: `${u.firstName} ${u.lastName}`,
          role: u.role,
          isActive: u.isActive,
          accessToken: data.data.accessToken,
          refreshToken: data.data.refreshToken,
          userBranches: u.userBranches,
          managedBranches: u.managedBranches,
          branchId: primaryBranch?.id ?? null,
          branch: primaryBranch,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = (user as any).username;
        token.firstName = (user as any).firstName;
        token.lastName = (user as any).lastName;
        token.role = (user as any).role;
        token.isActive = (user as any).isActive;
        token.accessToken = (user as any).accessToken;
        token.refreshToken = (user as any).refreshToken;
        token.accessTokenExpires = getTokenExpiryMs((user as any).accessToken);
        token.userBranches = (user as any).userBranches;
        token.managedBranches = (user as any).managedBranches;
        token.branchId = (user as any).branchId;
        token.branch = (user as any).branch;
        return token;
      }

      // The backend access token is deliberately short-lived for security —
      // refresh it transparently well before it expires so the user is
      // never logged out just because 15-30 minutes passed. This runs on
      // every session read (NextAuth decodes the JWT cookie server-side on
      // each /api/auth/session call), so the access token attached to API
      // requests is kept fresh without the user ever noticing.
      const expiresAt = (token.accessTokenExpires as number) || 0;
      const refreshBufferMs = 60_000; // refresh up to 1 minute before expiry
      if (Date.now() < expiresAt - refreshBufferMs) {
        return token;
      }

      try {
        const refreshed = await refreshAccessToken(token.refreshToken as string);
        token.accessToken = refreshed.accessToken;
        token.refreshToken = refreshed.refreshToken;
        token.accessTokenExpires = getTokenExpiryMs(refreshed.accessToken);
        delete token.error;
      } catch {
        // Only the refresh token actually being invalid/expired (e.g. after
        // 7 days of inactivity, or a revoked session) should ever force a
        // real logout — never a transient network hiccup on this call.
        token.error = 'RefreshTokenError';
      }

      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.username = token.username as string;
      session.user.firstName = token.firstName as string;
      session.user.lastName = token.lastName as string;
      session.user.role = token.role as string;
      session.user.isActive = token.isActive as boolean;
      session.accessToken = token.accessToken as string;
      session.refreshToken = token.refreshToken as string;
      session.user.userBranches = token.userBranches as any[];
      session.user.managedBranches = token.managedBranches as any[];
      session.user.branchId = token.branchId as string | null;
      session.user.branch = token.branch as any;
      (session as any).error = token.error;
      return session;
    },
  },
  pages: {
    signIn: '/kycu',
    error: '/kycu',
  },
  session: {
    strategy: 'jwt',
    // The NextAuth session cookie itself — independent of the much shorter
    // backend access token above — stays valid for a full week of
    // inactivity, matching the backend refresh token's lifetime.
    maxAge: 7 * 24 * 60 * 60,
  },
  secret: process.env.NEXTAUTH_SECRET,
});
