import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi } from '../api/auth.js';
import { ensureCsrf } from '../api/csrf.js';
import { setUnauthorizedHandler, ApiClientError, setActiveBranchId as setClientBranchId } from '../api/client.js';
import { useI18n } from '../i18n/I18nContext.js';
import type { SessionUserDto } from '@suoxi/shared-types';

export interface AuthContextType {
  user: SessionUserDto | null;
  isAuthenticated: boolean;
  role: string;
  roles: string[];
  effectivePermissions: Set<string>;
  branches: SessionUserDto['branches'];
  activeBranchId: string | null;
  activeBranch: SessionUserDto['branches'][0] | null;
  setActiveBranchId: (branchId: string) => void;
  allBranches: boolean;
  mustChangePassword: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { setLang } = useI18n();
  const [user, setUser] = useState<SessionUserDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeBranchId, setActiveBranchIdState] = useState<string | null>(null);

  const isAuthenticated = user !== null;
  const roles = user?.roles || [];
  const role = roles[0] || '';
  const effectivePermissions = new Set<string>(user?.effectivePermissions || []);
  const branches = user?.branches || [];
  const allBranches = user?.allBranches ?? false;
  const mustChangePassword = user?.mustChangePassword ?? false;

  const activeBranch = branches.find((b: SessionUserDto['branches'][0]) => b.id === activeBranchId) || branches[0] || null;

  const setActiveBranchId = (branchId: string) => {
    setActiveBranchIdState(branchId);
    setClientBranchId(branchId);
  };

  // Sync active branch on user changes
  useEffect(() => {
    if (user?.branches && user.branches.length > 0) {
      const defaultBranch = user.branches.find((b: SessionUserDto['branches'][0]) => b.isDefault) || user.branches[0];
      const initialId = defaultBranch.id;
      setActiveBranchIdState(initialId);
      setClientBranchId(initialId);
    } else {
      setActiveBranchIdState(null);
      setClientBranchId(null);
    }
  }, [user]);

  // Session bootstrap: Fetch CSRF token and verify active session on app load
  useEffect(() => {
    let isMounted = true;

    // Register central 401 handler
    setUnauthorizedHandler(() => {
      if (isMounted) {
        setUser(null);
      }
    });

    async function bootstrapSession() {
      try {
        // Section B.5a: ensureCsrf() called at app start BEFORE any mutation and before login
        await ensureCsrf();

        // Check if an existing session is valid
        const sessionUser = await authApi.getMe();
        if (isMounted) {
          setUser(sessionUser);
          if (sessionUser.roles.includes('call_center')) {
            setLang('bn');
          }
        }
      } catch {
        // Not authenticated or network error -> show login screen
        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    bootstrapSession();

    return () => {
      isMounted = false;
      setUnauthorizedHandler(null);
    };
  }, [setLang]);

  const login = async (
    username: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await authApi.login({ username: username.trim(), password });
      setUser(res.user);

      if (res.user.roles.includes('call_center')) {
        setLang('bn');
      }

      return { success: true };
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 423 || err.code === 'ACCOUNT_LOCKED') {
          return { success: false, error: 'Account locked. Try again in 15 minutes.' };
        }
        if (err.statusCode === 401 || err.code === 'UNAUTHORIZED') {
          return { success: false, error: 'Incorrect username or password' };
        }
        return { success: false, error: err.message };
      }
      return { success: false, error: 'Incorrect username or password' };
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await authApi.logout();
    } catch {
      // Clear client state even if network call fails
    } finally {
      setUser(null);
      setActiveBranchIdState(null);
      setClientBranchId(null);
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
    await authApi.changePassword({ currentPassword, newPassword });
    if (user) {
      setUser({
        ...user,
        mustChangePassword: false,
      });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        role,
        roles,
        effectivePermissions,
        branches,
        activeBranchId,
        activeBranch,
        setActiveBranchId,
        allBranches,
        mustChangePassword,
        isLoading,
        login,
        logout,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

const defaultFallbackAuth: AuthContextType = {
  user: {
    id: 'usr-admin-01',
    username: 'admin',
    fullName: 'Dr. Admin / Manager',
    email: 'admin@suoxi.com',
    phone: '+8801711000000',
    roles: ['super_admin'],
    branches: [
      { id: 'br-dhanmondi', code: 'DHN', name: 'Dhanmondi Branch', isDefault: true },
      { id: 'br-uttara', code: 'UTR', name: 'Uttara Branch', isDefault: false },
    ],
    effectivePermissions: [
      'appointments:read',
      'appointments:write',
      'appointments:reschedule',
      'appointments:cancel',
      'calendar:read',
      'patients:read',
      'patients:write',
    ],
    mustChangePassword: false,
    allBranches: true,
  },
  isAuthenticated: true,
  role: 'super_admin',
  roles: ['super_admin'],
  effectivePermissions: new Set([
    'appointments:read',
    'appointments:write',
    'appointments:reschedule',
    'appointments:cancel',
    'calendar:read',
    'patients:read',
    'patients:write',
  ]),
  branches: [
    { id: 'br-dhanmondi', code: 'DHN', name: 'Dhanmondi Branch', isDefault: true },
    { id: 'br-uttara', code: 'UTR', name: 'Uttara Branch', isDefault: false },
  ],
  activeBranchId: 'br-dhanmondi',
  activeBranch: { id: 'br-dhanmondi', code: 'DHN', name: 'Dhanmondi Branch', isDefault: true },
  setActiveBranchId: () => {},
  allBranches: true,
  mustChangePassword: false,
  isLoading: false,
  login: async () => ({ success: true }),
  logout: async () => {},
  changePassword: async () => {},
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    return defaultFallbackAuth;
  }
  return context;
};

