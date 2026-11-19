import React, { createContext, useContext, useState, useEffect } from 'react';
import type { PortalMeDto } from '@suoxi/shared-types';
import { portalApi } from '../api/portalClient.js';

interface PortalAuthContextType {
  account: PortalMeDto | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  language: 'bn' | 'en';
  setLanguage: (lang: 'bn' | 'en') => void;
  login: (ident: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const PortalAuthContext = createContext<PortalAuthContextType | undefined>(undefined);

export const PortalAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [account, setAccount] = useState<PortalMeDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [language, setLanguage] = useState<'bn' | 'en'>('bn');

  const refreshMe = async () => {
    try {
      const me = await portalApi.getMe();
      setAccount(me);
      if (me.preferredLanguage) {
        setLanguage(me.preferredLanguage);
      }
    } catch {
      setAccount(null);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await portalApi.getCsrf();
        const me = await portalApi.getMe();
        if (mounted) {
          setAccount(me);
          if (me.preferredLanguage) setLanguage(me.preferredLanguage);
        }
      } catch {
        if (mounted) setAccount(null);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const login = async (ident: string, pass: string) => {
    const acc = await portalApi.login(ident, pass);
    setAccount(acc);
    if (acc.preferredLanguage) {
      setLanguage(acc.preferredLanguage);
    }
  };

  const logout = async () => {
    await portalApi.logout();
    setAccount(null);
  };

  return (
    <PortalAuthContext.Provider
      value={{
        account,
        isAuthenticated: Boolean(account),
        isLoading,
        language,
        setLanguage,
        login,
        logout,
        refreshMe,
      }}
    >
      {children}
    </PortalAuthContext.Provider>
  );
};

export function usePortalAuth(): PortalAuthContextType {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) {
    throw new Error('usePortalAuth must be used within a PortalAuthProvider');
  }
  return ctx;
}
