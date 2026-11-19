import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useI18n } from '../../i18n/I18nContext.js';
import { authApi } from '../../api/auth.js';

const IDLE_WARNING_MS = 15 * 60 * 1000; // 15 minutes of inactivity before warning dialog
const LOGOUT_COUNTDOWN_SECONDS = 60; // 60 seconds warning window (16 minutes total)

export const IdleTimeoutModal: React.FC = () => {
  const { isAuthenticated, logout } = useAuth();
  const { lang } = useI18n();

  const [isWarningOpen, setIsWarningOpen] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(LOGOUT_COUNTDOWN_SECONDS);

  const lastActivityRef = useRef<number>(Date.now());
  const countdownIntervalRef = useRef<number | null>(null);
  const checkTimerRef = useRef<number | null>(null);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (isWarningOpen) {
      setIsWarningOpen(false);
      setSecondsRemaining(LOGOUT_COUNTDOWN_SECONDS);
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    }
  }, [isWarningOpen]);

  // Handle "Stay signed in" click
  const handleStaySignedIn = async () => {
    resetActivity();
    try {
      // Keep backend session alive
      await authApi.getMe();
    } catch {
      // Ignored
    }
  };

  // Perform idle logout
  const performIdleLogout = useCallback(async () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (checkTimerRef.current) {
      clearInterval(checkTimerRef.current);
      checkTimerRef.current = null;
    }

    setIsWarningOpen(false);

    try {
      await logout();
    } catch {
      // Clear client state even if network call fails
    }

    try {
      // Redirect to /login?reason=idle
      window.history.replaceState({}, '', '/login?reason=idle');
    } catch {
      // Ignore
    }
  }, [logout]);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsWarningOpen(false);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (checkTimerRef.current) clearInterval(checkTimerRef.current);
      return;
    }

    lastActivityRef.current = Date.now();

    // Throttled user activity tracker
    let throttleTimeout: number | null = null;
    const handleUserInteraction = () => {
      if (isWarningOpen) return; // Do not automatically dismiss dialog without deliberate action

      const now = Date.now();
      if (!throttleTimeout) {
        lastActivityRef.current = now;
        throttleTimeout = window.setTimeout(() => {
          throttleTimeout = null;
        }, 1000);
      }
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    for (const evt of events) {
      window.addEventListener(evt, handleUserInteraction, { passive: true });
    }

    // Periodic check to trigger warning dialog
    checkTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= IDLE_WARNING_MS && !isWarningOpen) {
        setIsWarningOpen(true);
        setSecondsRemaining(LOGOUT_COUNTDOWN_SECONDS);

        // Start 60-second countdown
        let remaining = LOGOUT_COUNTDOWN_SECONDS;
        countdownIntervalRef.current = window.setInterval(() => {
          remaining -= 1;
          setSecondsRemaining(remaining);
          if (remaining <= 0) {
            performIdleLogout();
          }
        }, 1000);
      }
    }, 5000);

    return () => {
      for (const evt of events) {
        window.removeEventListener(evt, handleUserInteraction);
      }
      if (throttleTimeout) clearTimeout(throttleTimeout);
      if (checkTimerRef.current) clearInterval(checkTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [isAuthenticated, isWarningOpen, performIdleLogout]);

  if (!isWarningOpen) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="idle-warning-title"
      aria-describedby="idle-warning-desc"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
    >
      <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
        <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto mb-4">
          <Clock className="w-6 h-6 animate-pulse" />
        </div>

        <h3 id="idle-warning-title" className="text-base font-bold text-center text-slate-900 mb-2">
          {lang === 'bn' ? 'নিষ্ক্রিয়তার সতর্কতা' : 'Session Inactivity Warning'}
        </h3>

        <p id="idle-warning-desc" className="text-xs text-center text-slate-600 mb-6 leading-relaxed">
          {lang === 'bn' ? (
            <>
              আপনি নিষ্ক্রিয় রয়েছেন।{' '}
              <span className="font-bold text-red-600">{secondsRemaining} সেকেন্ড</span> এর মধ্যে লগআউট
              হয়ে যাবেন।
            </>
          ) : (
            <>
              You will be logged out in{' '}
              <span className="font-bold text-red-600">{secondsRemaining} seconds</span> due to
              inactivity.
            </>
          )}
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={performIdleLogout}
            className="flex-1 py-2 px-3 border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
          >
            {lang === 'bn' ? 'লগআউট' : 'Sign Out Now'}
          </button>
          <button
            type="button"
            autoFocus
            onClick={handleStaySignedIn}
            className="flex-1 py-2 px-3 bg-[#0DA54F] hover:bg-[#0A8740] text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            {lang === 'bn' ? 'সাইন ইন থাকুন' : 'Stay signed in'}
          </button>
        </div>
      </div>
    </div>
  );
};
