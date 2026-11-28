import React, { useState, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Calendar,
  CheckCircle2,
  CreditCard,
  Eye,
  EyeOff,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../api/client.ts';

interface WarningPopupState {
  title: string;
  message: string;
}

const CLINIC_MODULES = [
  { label: 'Patient CRM', dotClass: 'bg-emerald-400' },
  { label: 'Consultations', dotClass: 'bg-teal-400' },
  { label: 'Packages', dotClass: 'bg-amber-400' },
  { label: 'Billing POS', dotClass: 'bg-sky-400' },
  { label: 'Inventory', dotClass: 'bg-rose-400' },
];

export const StaffLoginView: React.FC = () => {
  const {
    login,
    mustChangePassword,
    clearMustChangePassword,
    currentUser,
  } = useApp();

  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [warningPopup, setWarningPopup] = useState<WarningPopupState | null>(null);

  // First-login mandatory password rotation state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [updatingPwd, setUpdatingPwd] = useState(false);

  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const newPasswordInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!warningPopup) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeWarningPopup();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [warningPopup, mustChangePassword]);

  const closeWarningPopup = () => {
    setWarningPopup(null);
    requestAnimationFrame(() => {
      if (mustChangePassword) {
        newPasswordInputRef.current?.focus();
      } else {
        passwordInputRef.current?.focus();
      }
    });
  };

  const handleIdentifierChange = (raw: string) => {
    const next = raw.includes('@') ? raw : raw.toUpperCase();
    setEmployeeId(next);
  };

  const showWarning = (title: string, message: string) => {
    setWarningPopup({ title, message });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setWarningPopup(null);

    const cleanId = employeeId.trim();
    if (!cleanId || !password) {
      showWarning(
        'Missing Credentials',
        'Please enter both your Employee ID and password to sign in.'
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
      const rawMsg = err instanceof Error ? err.message : '';
      const isLockout = /lock|too many|attempt|wait/i.test(rawMsg);
      showWarning(
        isLockout ? 'Account Temporarily Locked' : 'Incorrect Password or Employee ID',
        rawMsg || 'Invalid Employee ID or password. Please verify your credentials and try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setWarningPopup(null);

    if (newPassword.length < 8) {
      showWarning(
        'Password Too Short',
        'Your new password must be at least 8 characters long.'
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      showWarning(
        'Passwords Do Not Match',
        'The new password and confirmation password do not match. Please try again.'
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
      showWarning(
        'Password Update Failed',
        err instanceof Error ? err.message : 'Unable to update password. Please try again.'
      );
    } finally {
      setUpdatingPwd(false);
    }
  };

  return (
    <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-2 bg-[#F8FAFC] text-slate-900 overflow-x-hidden">
      {/* =====================================================================
          LEFT HALF: DARK EMERALD BRAND & WORKSPACE OVERVIEW PANEL
          ===================================================================== */}
      <aside className="relative bg-[#051812] text-white flex flex-col justify-between px-7 py-9 sm:px-12 lg:px-14 lg:py-11 overflow-hidden">
        {/* Deep Forest-Emerald Multi-Tone Gradient */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(145deg, #03120D 0%, #07261C 45%, #0B3328 82%, #0D3D35 100%)',
          }}
        />

        {/* Ambient Emerald Top-Right Glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-28 right-[-80px] w-[420px] h-[420px] rounded-full animate-suoxi-mesh-a"
          style={{
            background:
              'radial-gradient(circle at center, rgba(16, 185, 129, 0.28) 0%, rgba(13, 165, 79, 0.08) 48%, transparent 72%)',
            filter: 'blur(36px)',
          }}
        />

        {/* Ambient Teal Bottom-Left Glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-20 w-[460px] h-[460px] rounded-full animate-suoxi-mesh-b"
          style={{
            background:
              'radial-gradient(circle at center, rgba(20, 184, 166, 0.26) 0%, rgba(13, 165, 79, 0.08) 48%, transparent 72%)',
            filter: 'blur(42px)',
          }}
        />

        {/* Architectural Grid Pattern */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.45) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.45) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage:
              'radial-gradient(ellipse at 40% 45%, black 15%, transparent 82%)',
          }}
        />

        {/* Top Brand Mark */}
        <div className="relative z-10 flex items-center gap-3 animate-suoxi-stagger">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#0DA54F] to-emerald-400 flex items-center justify-center text-white shadow-md shadow-emerald-950/50 border border-white/15 shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="block text-base font-extrabold tracking-tight text-white leading-none">
              SUOXI
            </span>
            <span className="block text-[11px] font-medium text-emerald-200/80 mt-1">
              Skin Care &amp; Aesthetic Center
            </span>
          </div>
        </div>

        {/* Center Hero Headline + Module Strip + Clinical Workflow Cards */}
        <div className="relative z-10 my-10 lg:my-auto max-w-xl space-y-7">
          <div className="space-y-3 animate-suoxi-stagger" style={{ animationDelay: '60ms' }}>
            <h1 className="text-3xl sm:text-4xl xl:text-[44px] font-extrabold tracking-tight leading-[1.12] text-white [text-wrap:balance]">
              Your whole clinic,
              <span className="block bg-gradient-to-r from-emerald-300 via-teal-200 to-emerald-400 bg-clip-text text-transparent">
                one sign-in away.
              </span>
            </h1>

            <p className="text-sm sm:text-base text-slate-300/90 leading-relaxed max-w-md">
              The clinical operations hub for every SUOXI branch—built for dermatologists, front desk, billing, and care teams.
            </p>
          </div>

          {/* Crisp Module Tags */}
          <div
            className="flex flex-wrap items-center gap-2 animate-suoxi-stagger"
            style={{ animationDelay: '120ms' }}
          >
            {CLINIC_MODULES.map((mod) => (
              <span
                key={mod.label}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/12 text-xs font-medium text-slate-100 backdrop-blur-xs"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${mod.dotClass}`} />
                <span>{mod.label}</span>
              </span>
            ))}
          </div>

          {/* Floating Glassmorphic Workspace Preview Cards (Non-spoofed operational capabilities) */}
          <div
            className="space-y-3 pt-1 max-w-md animate-suoxi-stagger"
            style={{ animationDelay: '180ms' }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Card 1 */}
              <div className="p-4 rounded-2xl bg-white/[0.06] border border-white/12 backdrop-blur-md space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-300">
                    Clinical EMR &amp; Desk
                  </span>
                  <Stethoscope className="w-3.5 h-3.5 text-emerald-300" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white leading-snug">
                    Consultations &amp; Rx
                  </p>
                  <p className="text-[11px] text-emerald-300/90 font-medium mt-0.5">
                    Unified patient timeline
                  </p>
                </div>
                <svg viewBox="0 0 140 24" className="w-full h-5 overflow-visible" aria-hidden="true">
                  <path
                    d="M 2 20 L 28 16 L 54 17 L 80 10 L 108 11 L 138 3"
                    fill="none"
                    stroke="#34D399"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              {/* Card 2 */}
              <div className="p-4 rounded-2xl bg-white/[0.06] border border-white/12 backdrop-blur-md space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-300">
                    Laser &amp; Packages
                  </span>
                  <Layers className="w-3.5 h-3.5 text-teal-300" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white leading-snug">
                    Session Tracking
                  </p>
                  <p className="text-[11px] text-teal-300/90 font-medium mt-0.5">
                    POS &amp; inventory linked
                  </p>
                </div>
                <svg viewBox="0 0 140 24" className="w-full h-5 overflow-visible" aria-hidden="true">
                  <path
                    d="M 2 19 L 30 14 L 58 15 L 86 9 L 114 10 L 138 4"
                    fill="none"
                    stroke="#5EEAD4"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>

            {/* Bottom Wide Card */}
            <div className="p-3.5 rounded-2xl bg-white/[0.06] border border-white/12 backdrop-blur-md flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/25 border border-emerald-400/30 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4 text-emerald-300" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">
                  Role-Scoped Branch Workspace
                </p>
                <p className="text-[11px] text-slate-300/85 truncate mt-0.5">
                  Encrypted sessions · Branch isolation · Audit-logged actions
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Left Footer */}
        <div className="relative z-10 text-xs text-slate-400/90 flex flex-wrap items-center justify-between gap-2">
          <span>© 2026 SUOXI Clinical Operations · Built by SUOXI IT</span>
        </div>
      </aside>

      {/* =====================================================================
          RIGHT HALF: SOFT LUMINOUS SURFACE WITH CENTERED SIGN-IN CARD
          ===================================================================== */}
      <main className="relative flex flex-col items-center justify-center px-5 py-10 sm:px-10 lg:px-12 overflow-hidden bg-[#F8FAFC]">
        {/* Soft Radial Mesh Backdrop (Emerald + Soft Rose + Sky Hint) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 18% 82%, rgba(244, 114, 182, 0.11) 0%, transparent 45%), radial-gradient(circle at 86% 18%, rgba(13, 165, 79, 0.12) 0%, transparent 46%), radial-gradient(circle at 52% 48%, rgba(20, 184, 166, 0.08) 0%, transparent 56%)',
          }}
        />

        {/* Subtle Dot Matrix Texture */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-45"
          style={{
            backgroundImage: 'radial-gradient(rgba(15, 23, 42, 0.12) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />

        {/* Concentric Orbital Rings Behind Card */}
        <svg
          aria-hidden="true"
          viewBox="0 0 760 760"
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[680px] h-[680px] max-w-none opacity-65"
        >
          <circle
            cx="380"
            cy="380"
            r="240"
            fill="none"
            stroke="rgba(13, 165, 79, 0.14)"
            strokeWidth="1"
          />
          <circle
            cx="380"
            cy="380"
            r="335"
            fill="none"
            stroke="rgba(15, 23, 42, 0.07)"
            strokeWidth="1"
          />
        </svg>

        {/* Subtle Floating Clinical Icon Tiles (Desktop only, low visual distraction) */}
        <div
          aria-hidden="true"
          className="hidden sm:flex pointer-events-none absolute top-[14%] left-[12%] w-10 h-10 rounded-xl bg-white/90 border border-slate-200/80 shadow-sm items-center justify-center text-emerald-600/80"
        >
          <Stethoscope className="w-4 h-4" />
        </div>
        <div
          aria-hidden="true"
          className="hidden sm:flex pointer-events-none absolute top-[20%] right-[10%] w-10 h-10 rounded-xl bg-white/90 border border-slate-200/80 shadow-sm items-center justify-center text-teal-600/80"
        >
          <ShieldCheck className="w-4 h-4" />
        </div>
        <div
          aria-hidden="true"
          className="hidden sm:flex pointer-events-none absolute bottom-[18%] left-[11%] w-10 h-10 rounded-xl bg-white/90 border border-slate-200/80 shadow-sm items-center justify-center text-amber-600/75"
        >
          <Calendar className="w-4 h-4" />
        </div>
        <div
          aria-hidden="true"
          className="hidden sm:flex pointer-events-none absolute bottom-[15%] right-[12%] w-10 h-10 rounded-xl bg-white/90 border border-slate-200/80 shadow-sm items-center justify-center text-rose-500/75"
        >
          <CreditCard className="w-4 h-4" />
        </div>

        {/* Centered Elevated Sign-In Card */}
        <div className="relative z-10 w-full max-w-[420px] bg-white rounded-2xl border border-slate-200/90 shadow-[0_24px_60px_-15px_rgba(5,24,18,0.14)] p-7 sm:p-8 animate-suoxi-stagger">
          {mustChangePassword && currentUser ? (
            /* -----------------------------------------------------------------
               FIRST-LOGIN MANDATORY PASSWORD ROTATION FLOW
               ----------------------------------------------------------------- */
            <div>
              <div className="mb-6">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#0DA54F] mb-1.5">
                  First Sign-In Security Step
                </p>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">
                  Set your personal password
                </h2>
                <p className="mt-1.5 text-xs sm:text-sm text-slate-500 leading-relaxed">
                  Welcome, {currentUser.name}. Update your temporary password before entering your workspace.
                </p>
              </div>

              <form onSubmit={handlePasswordUpdate} className="space-y-4">
                <div>
                  <label
                    htmlFor="new-staff-password"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    New Password (minimum 8 characters)
                  </label>
                  <div className="relative group">
                    <KeyRound className="w-4 h-4 text-slate-400 group-focus-within:text-[#0DA54F] transition-colors duration-150 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      ref={newPasswordInputRef}
                      id="new-staff-password"
                      type={showNewPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full h-11 pl-10 pr-12 text-sm bg-slate-50/60 focus:bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-[#0DA54F]/12 focus:border-[#0DA54F] transition-all duration-150"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((p) => !p)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg transition-colors cursor-pointer"
                      aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="confirm-staff-password"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Confirm New Password
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
                      className="w-full h-11 pl-10 pr-4 text-sm bg-slate-50/60 focus:bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-[#0DA54F]/12 focus:border-[#0DA54F] transition-all duration-150"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={updatingPwd}
                  className="w-full h-11 px-5 rounded-xl bg-gradient-to-r from-[#0DA54F] to-[#087A3B] hover:from-[#0b9446] hover:to-[#076631] active:scale-[0.99] disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-150 shadow-md shadow-emerald-600/20 cursor-pointer"
                >
                  {updatingPwd ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span className="whitespace-nowrap shrink-0">
                    {updatingPwd ? 'Updating password...' : 'Save Password & Continue'}
                  </span>
                </button>
              </form>
            </div>
          ) : (
            /* -----------------------------------------------------------------
               STANDARD STAFF SIGN-IN FLOW (EMPLOYEE ID + PASSWORD)
               ----------------------------------------------------------------- */
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                  Welcome back
                </h2>
                <p className="mt-1 text-xs sm:text-sm text-slate-500">
                  Sign in to your SUOXI workspace.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Employee ID Input */}
                <div>
                  <label
                    htmlFor="staff-employee-id"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Employee ID
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
                      className="w-full h-11 pl-10 pr-4 text-sm font-id tracking-wider bg-slate-50/60 focus:bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-[#0DA54F]/12 focus:border-[#0DA54F] transition-all duration-150"
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div>
                  <label
                    htmlFor="staff-password"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Password
                  </label>
                  <div className="relative group">
                    <Lock className="w-4 h-4 text-slate-400 group-focus-within:text-[#0DA54F] transition-colors duration-150 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      ref={passwordInputRef}
                      id="staff-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full h-11 pl-10 pr-12 text-sm bg-slate-50/60 focus:bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-[#0DA54F]/12 focus:border-[#0DA54F] transition-all duration-150"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg transition-colors cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Submit CTA */}
                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="group w-full h-11 px-5 rounded-xl bg-gradient-to-r from-[#0DA54F] to-[#087A3B] hover:from-[#0b9446] hover:to-[#076631] active:scale-[0.99] disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-150 shadow-md shadow-emerald-600/20 cursor-pointer"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="whitespace-nowrap shrink-0">
                          Verifying credentials...
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="whitespace-nowrap shrink-0">Sign In</span>
                        <ArrowRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" />
                      </>
                    )}
                  </button>
                </div>

                {/* Encrypted Sign-in Note */}
                <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] font-medium text-slate-500">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#0DA54F] shrink-0" />
                  <span>Secure, encrypted sign-in</span>
                </div>
              </form>

              <div className="mt-6 pt-5 border-t border-slate-100 space-y-2.5 text-center">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Need an Employee ID or password reset? Contact your Branch Administrator.
                </p>

                <p className="text-[11px] font-semibold tracking-wide text-slate-400">
                  Developed &amp; Designed By SUOXI IT
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* =====================================================================
          AUTHENTICATION WARNING POPUP MODAL (WRONG PASSWORD / VALIDATION)
          ===================================================================== */}
      {warningPopup && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-warning-title"
          aria-describedby="auth-warning-message"
          onClick={closeWarningPopup}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-2xl border border-amber-200/90 shadow-2xl p-6 animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3
                    id="auth-warning-title"
                    className="text-base font-bold text-slate-900 leading-snug"
                  >
                    {warningPopup.title}
                  </h3>
                  <p
                    id="auth-warning-message"
                    className="mt-1.5 text-xs sm:text-sm text-slate-600 leading-relaxed"
                  >
                    {warningPopup.message}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeWarningPopup}
                aria-label="Close warning"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                autoFocus
                onClick={closeWarningPopup}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
