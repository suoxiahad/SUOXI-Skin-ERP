import React, { useState, useEffect } from 'react';
import { PortalAuthProvider, usePortalAuth } from './context/PortalAuthContext.js';
import { PortalShell } from './components/PortalShell.js';
import { PortalLoginView } from './views/PortalLoginView.js';
import { PortalSetupView } from './views/PortalSetupView.js';

const PortalMain: React.FC = () => {
  const { isAuthenticated, isLoading } = usePortalAuth();
  const [isSetupMode, setIsSetupMode] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('token') || window.location.pathname.includes('/setup')) {
      setIsSetupMode(true);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50 text-slate-500">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-3 border-emerald-700 border-t-transparent animate-spin" />
          <span className="text-xs font-semibold tracking-wider uppercase text-slate-700">
            SUOXI PATIENT PORTAL...
          </span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (isSetupMode) {
      return <PortalSetupView onGoToLogin={() => setIsSetupMode(false)} />;
    }
    return <PortalLoginView onGoToSetup={() => setIsSetupMode(true)} />;
  }

  return <PortalShell />;
};

export const PatientPortalApp: React.FC = () => {
  return (
    <PortalAuthProvider>
      <PortalMain />
    </PortalAuthProvider>
  );
};

export default PatientPortalApp;
