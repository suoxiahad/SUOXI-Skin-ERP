import React from 'react';
import { I18nProvider } from './i18n/I18nContext.js';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { LoginPage } from './components/auth/LoginPage.js';
import { ForceChangePasswordPage } from './components/auth/ForceChangePasswordPage.js';
import { AppShell } from './components/layout/AppShell.js';

import { IdleTimeoutModal } from './components/auth/IdleTimeoutModal.js';

const MainLayout: React.FC = () => {
  const { isAuthenticated, isLoading, mustChangePassword } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-brand-page text-brand-muted">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-3 border-brand-primary border-t-transparent animate-spin" />
          <span className="text-xs font-semibold tracking-wider uppercase text-brand-text">
            Loading SUOXI CRM...
          </span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // First-login mandatory password change screen
  if (mustChangePassword) {
    return <ForceChangePasswordPage />;
  }

  return (
    <>
      <AppShell />
      <IdleTimeoutModal />
    </>
  );
};

import { PatientPortalApp } from './portal/PatientPortalApp.js';

export const App: React.FC = () => {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/portal')) {
    return <PatientPortalApp />;
  }

  return (
    <I18nProvider>
      <AuthProvider>
        <MainLayout />
      </AuthProvider>
    </I18nProvider>
  );
};

export default App;
