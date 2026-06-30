import 'next-auth';

declare module 'next-auth' {
  interface Session {
    accessToken: string;
    refreshToken: string;
    error?: string;
    user: {
      id: string;
      name: string;
      username: string;
      firstName: string;
      lastName: string;
      role: string;
      isActive: boolean;
      userBranches: any[];
      managedBranches: any[];
      branchId: string | null;
      branch: any | null;
    };
  }

  interface User {
    username: string;
    firstName: string;
    lastName: string;
    role: string;
    isActive: boolean;
    accessToken: string;
    refreshToken: string;
    userBranches: any[];
    managedBranches: any[];
    branchId: string | null;
    branch: any | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    role: string;
    isActive: boolean;
    accessToken: string;
    refreshToken: string;
    accessTokenExpires?: number;
    error?: string;
    userBranches: any[];
    managedBranches: any[];
    branchId: string | null;
    branch: any | null;
  }
}
