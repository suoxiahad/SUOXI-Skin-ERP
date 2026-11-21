import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../api/client.ts';

export const StaffLoginView: React.FC = () => {
  const {
    login,
    mustChangePassword,
    clearMustChangePassword,
    currentUser,
    language,
    navigate,
  } = useApp();

  const isBn = language === 'bn';

  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);

  // First-login mandatory password rotation state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [updatingPwd, setUpdatingPwd] = useState(false);

  const handleIdentifierChange = (raw: string) => {
    // Auto-uppercase Employee ID codes (e.g. sx-1001 -> SX-1001), preserve lowercase if user enters an email address
    const next = raw.includes('@') ? raw : raw.toUpperCase();
    setEmployeeId(next);
  };

  const triggerError = (msg: string) => {
    setError(msg);
    setShakeKey((k) => k + 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanId = employeeId.trim();
    if (!cleanId || !password) {
      triggerError(
        isBn
          ? 'আপনার Employee ID এবং পাসওয়ার্ড দিন।'
          : 'Please enter your Employee ID and password.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await login(cleanId, password);
      if (!res?.mustChangePassword) {
        setPassword('');
      }
    } catch (err) {
      triggerError(
        err instanceof Error
          ? err.message
          : isBn
          ? 'Employee ID বা পাসওয়ার্ড সঠিক নয়।'
          : 'Invalid Employee ID or password.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      triggerError(
        isBn
          ? 'নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।'
          : 'New password must be at least 8 characters long.'
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      triggerError(
        isBn
          ? 'নতুন পাসওয়ার্ড এবং কনফার্ম পাসওয়ার্ড মিলছে না।'
          : 'New password and confirmation do not match.'
      );
      return;
    }

    setUpdatingPwd(true);
    try {
      await api.auth.changePassword(password, newPassword);
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
      clearMustChangePassword();
    } catch (err) {
      triggerError(
        err instanceof Error
          ? err.message
          : isBn
          ? 'পাসওয়ার্ড পরিবর্তন করা যায়নি।'
          : 'Unable to update password.'
      );
    } finally {
      setUpdatingPwd(false);
    }
  };

  return (
    <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-12 bg-[#FAFBFD] text-slate-900 overflow-x-hidden">
      {/* =====================================================================
          LEFT EDITORIAL ATMOSPHERIC CANVAS (Deep Obsidian-Emerald + Rose-Blush)
          ===================================================================== */}
      <aside className="relative lg:col-span-7 bg-[#051812] text-white flex flex-col justify-between px-8 py-10 sm:px-12 lg:px-16 lg:py-14 overflow-hidden">
        {/* Multi-layer Color Grading Backdrop */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(145deg, #04130E 0%, #08271D 48%, #0E2220 100%)',
          }}
        />

        {/* Drifting Emerald Ambient Bloom */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-28 -left-24 w-[520px] h-[520px] rounded-full animate-suoxi-mesh-a"
          style={{
            background:
              'radial-gradient(circle at center, rgba(13, 165, 79, 0.34) 0%, rgba(13, 165, 79, 0.08) 45%, transparent 72%)',
            filter: 'blur(36px)',
          }}
        />

        {/* Drifting Aesthetic Rose-Gold Warmth */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -right-16 w-[480px] h-[480px] rounded-full animate-suoxi-mesh-b"
          style={{
            background:
              'radial-gradient(circle at center, rgba(240, 110, 132, 0.22) 0%, rgba(226, 168, 152, 0.09) 46%, transparent 72%)',
            filter: 'blur(42px)',
          }}
        />

        {/* Subtle Precision Architectural Contour Rings */}
        <svg
          aria-hidden="true"
          viewBox="0 0 600 600"
          className="pointer-events-none absolute right-[-140px] top-1/2 -translate-y-1/2 w-[540px] h-[540px] opacity-[0.14] animate-suoxi-orbit"
        >
          <circle
            cx="300"
            cy="300"
            r="260"
            fill="none"
            stroke="url(#suoxiContour)"
            strokeWidth="1"
            strokeDasharray="6 10"
          />
          <circle
            cx="300"
            cy="300"
            r="195"
            fill="none"
            stroke="url(#suoxiContour)"
            strokeWidth="0.75"
          />
          <circle
            cx="300"
            cy="300"
            r="130"
            fill="none"
            stroke="url(#suoxiContour)"
            strokeWidth="0.6"
            strokeDasharray="3 8"
          />
          <defs>
            <linearGradient id="suoxiContour" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#34D399" />
              <stop offset="60%" stopColor="#F06E84" />
              <stop offset="100%" stopColor="#FFFFFF" />
            </linearGradient>
          </defs>
        </svg>

        {/* Subtle Hairline Architectural Grid */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.4) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
            maskImage:
              'radial-gradient(ellipse at 35% 45%, black 10%, transparent 78%)',
          }}
        />

        {/* Top Brand Identity */}
        <div className="relative z-10 flex items-center gap-3.5 animate-suoxi-stagger">
          <div className="w-11 h-11 rounded-xl bg-white/[0.08] border border-white/15 backdrop-blur-md flex items-center justify-center shadow-inner">
            <ShieldCheck className="w-5 h-5 text-[#34D399]" />
          </div>
          <div>
            <p className="text-base font-bold tracking-tight text-white">SUOXI</p>
            <p className="text-xs text-emerald-200/80 tracking-wide">
              {isBn ? 'স্কিন কেয়ার অ্যান্ড এস্থেটিক সেন্টার' : 'Skin Care & Aesthetic Center'}
            </p>
          </div>
        </div>

        {/* Center Editorial Statement */}
        <div className="relative z-10 my-10 lg:my-auto max-w-xl">
          <p
            className="text-xs font-medium tracking-[0.14em] uppercase text-emerald-300/90 mb-4 animate-suoxi-stagger"
            style={{ animationDelay: '60ms' }}
          >
            {isBn ? 'ক্লিনিকাল অপারেশনস ও ইআরপি স্যুট' : 'Clinical Operations & ERP Suite'}
          </p>

          <h1
            className="font-editorial text-4xl sm:text-5xl xl:text-[56px] font-semibold leading-[1.08] tracking-[-0.015em] text-white [text-wrap:balance] animate-suoxi-stagger"
            style={{ animationDelay: '120ms' }}
          >
            {isBn
              ? 'নির্ভুল ডার্মাটোলজি ও এস্থেটিক কেয়ারের সমন্বিত কর্মক্ষেত্র।'
              : 'Precision dermatology, unified across every branch.'}
          </h1>

          <p
            className="mt-5 text-sm sm:text-base text-slate-300/90 leading-relaxed max-w-lg animate-suoxi-stagger"
            style={{ animationDelay: '180ms' }}
          >
            {isBn
              ? 'রোগী নিবন্ধন, কনসালটেশন, লেজার সেশন, প্যাকেজ লেজার, বিলিং এবং ইনভেন্টরি—সবকিছু এক নিরাপদ প্ল্যাটফর্মে।'
              : 'Patient records, consultations, laser sessions, treatment packages, POS billing, and clinical inventory—secured in a single workspace.'}
          </p>
        </div>
      </aside>

      {/* =====================================================================
          RIGHT PORCELAIN SIGN-IN SURFACE
          ===================================================================== */}
      <main className="lg:col-span-5 flex flex-col justify-between px-6 py-8 sm:px-12 lg:px-14 lg:py-12 bg-[#FAFBFD]">
        {/* Center Form Container (Single Clean Surface, No Nested Card Boxes) */}
        <div className="w-full max-w-[420px] mx-auto flex-1 flex flex-col justify-center py-8">
          {mustChangePassword && currentUser ? (
            /* -----------------------------------------------------------------
               FIRST-LOGIN MANDATORY PASSWORD ROTATION FLOW
               ----------------------------------------------------------------- */
            <div
              key={`pwd-rotate-${shakeKey}`}
              className={`animate-suoxi-stagger ${shakeKey > 0 && error ? 'animate-suoxi-shake' : ''}`}
            >
              <div className="mb-7">
                <p className="text-xs font-semibold text-[#0DA54F] mb-2">
                  {isBn ? 'নিরাপত্তা যাচাই সম্পন্ন' : 'First Sign-In Security Step'}
                </p>
                <h2 className="text-2xl sm:text-[28px] font-bold tracking-tight text-slate-900 [text-wrap:balance]">
                  {isBn ? 'নতুন পাসওয়ার্ড সেট করুন' : 'Set your personal password'}
                </h2>
                <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                  {isBn
                    ? `স্বাগতম ${currentUser.name}। আপনার প্রথম লগইন সম্পন্ন করতে একটি নতুন ব্যক্তিগত পাসওয়ার্ড দিন।`
                    : `Welcome, ${currentUser.name}. Update your temporary password before entering the clinical workspace.`}
                </p>
              </div>

              <form onSubmit={handlePasswordUpdate} className="space-y-5">
                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs leading-relaxed"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="new-staff-password"
                    className="block text-xs font-semibold text-slate-700 mb-2"
                  >
                    {isBn ? 'নতুন পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর)' : 'New Password (minimum 8 characters)'}
                  </label>
                  <div className="relative group">
                    <KeyRound className="w-4 h-4 text-slate-400 group-focus-within:text-[#0DA54F] transition-colors duration-150 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="new-staff-password"
                      type={showNewPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full h-12 pl-10 pr-12 text-sm bg-white border border-slate-300/90 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-[#0DA54F]/15 focus:border-[#0DA54F] transition-all duration-150"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((p) => !p)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
                      aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="confirm-staff-password"
                    className="block text-xs font-semibold text-slate-700 mb-2"
                  >
                    {isBn ? 'নতুন পাসওয়ার্ড নিশ্চিত করুন' : 'Confirm New Password'}
                  </label>
                  <div className="relative group">
                    <CheckCircle2 className="w-4 h-4 text-slate-400 group-focus-within:text-[#0DA54F] transition-colors duration-150 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="confirm-staff-password"
                      type={showNewPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full h-12 pl-10 pr-4 text-sm bg-white border border-slate-300/90 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-[#0DA54F]/15 focus:border-[#0DA54F] transition-all duration-150"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={updatingPwd}
                  className="w-full h-12 px-5 rounded-xl bg-[#0DA54F] hover:bg-[#0A8740] active:scale-[0.99] disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2.5 transition-all duration-150 shadow-sm cursor-pointer"
                >
                  {updatingPwd ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span className="whitespace-nowrap shrink-0">
                    {updatingPwd
                      ? isBn
                        ? 'আপডেট হচ্ছে...'
                        : 'Updating password...'
                      : isBn
                      ? 'পাসওয়ার্ড সেভ করে প্রবেশ করুন'
                      : 'Save Password & Continue'}
                  </span>
                </button>
              </form>
            </div>
          ) : (
            /* -----------------------------------------------------------------
               STANDARD STAFF SIGN-IN FLOW (EMPLOYEE ID + PASSWORD)
               ----------------------------------------------------------------- */
            <div
              key={`login-form-${shakeKey}`}
              className={shakeKey > 0 && error ? 'animate-suoxi-shake' : ''}
            >
              <div
                className="mb-8 animate-suoxi-stagger"
                style={{ animationDelay: '40ms' }}
              >
                <h2 className="text-2xl sm:text-[30px] font-bold tracking-tight text-slate-900 [text-wrap:balance]">
                  {isBn ? 'স্টাফ সাইন ইন' : 'Sign in to SUOXI'}
                </h2>
                <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                  {isBn
                    ? 'আপনার নির্ধারিত Employee ID (যেমন 0001) এবং পাসওয়ার্ড ব্যবহার করে প্রবেশ করুন।'
                    : 'Enter your assigned Employee ID (e.g. 0001) and password to access your clinic desk.'}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs leading-relaxed"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Employee ID Input */}
                <div
                  className="animate-suoxi-stagger"
                  style={{ animationDelay: '100ms' }}
                >
                  <label
                    htmlFor="staff-employee-id"
                    className="block text-xs font-semibold text-slate-700 mb-2"
                  >
                    {isBn ? 'এমপ্লয়ি আইডি (Employee ID)' : 'Employee ID'}
                  </label>
                  <div className="relative group">
                    <BadgeCheck className="w-4 h-4 text-slate-400 group-focus-within:text-[#0DA54F] transition-colors duration-150 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="staff-employee-id"
                      type="text"
                      autoComplete="username"
                      autoCapitalize="characters"
                      spellCheck={false}
                      required
                      value={employeeId}
                      onChange={(e) => handleIdentifierChange(e.target.value)}
                      placeholder="0001"
                      className="w-full h-12 pl-10 pr-4 text-sm font-id tracking-wider bg-white border border-slate-300/90 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-[#0DA54F]/15 focus:border-[#0DA54F] transition-all duration-150"
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div
                  className="animate-suoxi-stagger"
                  style={{ animationDelay: '160ms' }}
                >
                  <label
                    htmlFor="staff-password"
                    className="block text-xs font-semibold text-slate-700 mb-2"
                  >
                    {isBn ? 'পাসওয়ার্ড' : 'Password'}
                  </label>
                  <div className="relative group">
                    <Lock className="w-4 h-4 text-slate-400 group-focus-within:text-[#0DA54F] transition-colors duration-150 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="staff-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full h-12 pl-10 pr-12 text-sm bg-white border border-slate-300/90 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-[#0DA54F]/15 focus:border-[#0DA54F] transition-all duration-150"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg transition-colors cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Submit CTA */}
                <div
                  className="pt-1 animate-suoxi-stagger"
                  style={{ animationDelay: '220ms' }}
                >
                  <button
                    type="submit"
                    disabled={submitting}
                    className="group w-full h-12 px-5 rounded-xl bg-[#0DA54F] hover:bg-[#0A8740] active:scale-[0.99] disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-150 shadow-sm cursor-pointer"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="whitespace-nowrap shrink-0">
                          {isBn ? 'যাচাই করা হচ্ছে...' : 'Verifying credentials...'}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="whitespace-nowrap shrink-0">
                          {isBn ? 'সাইন ইন করুন' : 'Sign In'}
                        </span>
                        <ArrowRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" />
                      </>
                    )}
                  </button>
                </div>
              </form>

              <p
                className="mt-6 text-xs text-slate-500 leading-relaxed animate-suoxi-stagger"
                style={{ animationDelay: '260ms' }}
              >
                {isBn
                  ? 'আইডি বা পাসওয়ার্ড ভুলে গেলে আপনার ব্রাঞ্চ অ্যাডমিনিস্ট্রেটরের সাথে যোগাযোগ করুন।'
                  : 'Need an Employee ID or password reset? Contact your Branch Administrator.'}
              </p>

              <p
                className="mt-2.5 text-[11px] font-medium tracking-wide text-slate-400 animate-suoxi-stagger"
                style={{ animationDelay: '300ms' }}
              >
                Developed &amp; Designed By SUOXI IT
              </p>
            </div>
          )}
        </div>

        {/* Clean Unboxed Footer with Patient Portal Switch */}
        <footer className="pt-6 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <span>
            {isBn
              ? '© SUOXI ক্লিনিকাল অপারেশনস'
              : '© SUOXI Clinical Operations'}
          </span>

          <button
            type="button"
            onClick={() => navigate('/portal')}
            className="font-medium text-slate-700 hover:text-[#0DA54F] transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>{isBn ? 'রোগী পোর্টাল (Patient Portal)' : 'Patient Portal'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </footer>
      </main>
    </div>
  );
};
