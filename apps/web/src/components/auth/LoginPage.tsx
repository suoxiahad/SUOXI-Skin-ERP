import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Lock, AlertCircle, Building2, Globe, Shield, KeyRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useI18n } from '../../i18n/I18nContext.js';
import { ensureCsrf } from '../../api/csrf.js';
import { ForgotPasswordModal } from './ForgotPasswordModal.js';
import { ResetPasswordModal } from './ResetPasswordModal.js';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const { t, lang, toggleLang } = useI18n();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetTokenFromUrl, setResetTokenFromUrl] = useState('');

  // Section B.5a: ensureCsrf() calls GET /auth/csrf at app start BEFORE any mutation and before showing login form
  useEffect(() => {
    ensureCsrf().catch(() => {
      // Background preload of CSRF token
    });

    // Check URL search parameters for idle logout or password reset token
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const reason = searchParams.get('reason');
      const token = searchParams.get('token');

      if (reason === 'idle') {
        setErrorMessage(
          lang === 'bn'
            ? 'নিষ্ক্রিয়তার কারণে আপনার সেশন সমাপ্ত হয়েছে। অনুগ্রহ করে পুনরায় সাইন ইন করুন।'
            : 'You were logged out due to inactivity. Please sign in again.'
        );
      }

      if (token) {
        setResetTokenFromUrl(token);
        setIsResetModalOpen(true);
      }
    } catch {
      // Ignore URL parsing errors
    }
  }, [lang]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    // Client-side validation
    const trimmedUser = username.trim();
    if (!trimmedUser || !password) {
      setErrorMessage(
        lang === 'bn'
          ? 'অনুগ্রহ করে ইউজারনেম এবং পাসওয়ার্ড লিখুন।'
          : 'Please enter both your username and password.'
      );
      return;
    }

    setIsSubmitting(true);
    const result = await login(trimmedUser, password);
    if (!result.success && result.error) {
      setErrorMessage(result.error);
    }
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-brand-page flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden">
      {/* Decorative Brand Circles for Glassmorphism Backdrop */}
      <div
        aria-hidden="true"
        className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-brand-primary-light opacity-60 blur-3xl pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-brand-secondary-light opacity-50 blur-3xl pointer-events-none"
      />

      {/* Top Bar on Login Screen: Language Toggle & Clinic Branch info */}
      <div className="w-full max-w-md flex items-center justify-between mb-4 z-10">
        <div className="flex items-center gap-1.5 text-xs text-brand-muted font-medium">
          <Building2 className="w-4 h-4 text-brand-primary" />
          <span>{t.clinicBranch}</span>
        </div>

        <button
          type="button"
          onClick={toggleLang}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-brand-border bg-brand-card hover:bg-brand-primary-light text-xs font-semibold text-brand-text transition-colors focus-ring cursor-pointer"
          aria-label="Toggle language"
        >
          <Globe className="w-3.5 h-3.5 text-brand-primary" />
          <span>{lang === 'bn' ? 'English' : 'বাংলা'}</span>
        </button>
      </div>

      {/* Expressive Glass Container */}
      <div className="w-full max-w-md glass-modal rounded-2xl shadow-xl border border-brand-border overflow-hidden z-10 transition-all">
        {/* Header Banner */}
        <div className="p-6 pb-2 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-[#0DA54F] flex items-center justify-center text-white shadow-md mb-4 group transition-transform">
            <span className="font-bold text-2xl tracking-wider">S</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-brand-text">
            {t.welcomeBack}
          </h1>
          <p className="text-xs sm:text-sm text-brand-muted mt-1">
            {t.signinSubtitle}
          </p>
        </div>

        {/* Readable Form Card */}
        <form onSubmit={handleSubmit} className="p-6 pt-3 space-y-4">
          {/* Inline Error Banner */}
          {errorMessage && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-start gap-2.5 text-xs font-medium animate-fadeIn"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <div className="flex-1 leading-relaxed font-semibold">{errorMessage}</div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-xs underline cursor-pointer shrink-0 ml-1 text-red-500 hover:text-red-700"
              >
                {t.dismiss}
              </button>
            </div>
          )}

          {/* Inline Success Banner */}
          {successMessage && (
            <div
              role="status"
              className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-start gap-2.5 text-xs font-medium animate-fadeIn"
            >
              <div className="flex-1 leading-relaxed font-semibold">{successMessage}</div>
              <button
                type="button"
                onClick={() => setSuccessMessage(null)}
                className="text-xs underline cursor-pointer shrink-0 ml-1 text-emerald-600 hover:text-emerald-800"
              >
                {t.dismiss}
              </button>
            </div>
          )}

          {/* Username Field */}
          <div>
            <label
              htmlFor="login-username"
              className="block text-xs font-semibold text-brand-text mb-1.5"
            >
              {t.username}
            </label>
            <input
              id="login-username"
              type="text"
              autoFocus
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-brand-card border border-brand-border text-brand-text text-sm shadow-xs focus-ring transition-all placeholder:text-brand-muted/60"
              placeholder="e.g. staff_username"
            />
          </div>

          {/* Password Field */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold text-brand-text"
              >
                {t.password}
              </label>

              <button
                type="button"
                onClick={() => setIsForgotModalOpen(true)}
                className="text-xs text-[#0DA54F] hover:text-[#0A8740] font-semibold hover:underline cursor-pointer"
              >
                {t.forgotPassword}
              </button>
            </div>

            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-brand-card border border-brand-border text-brand-text text-sm shadow-xs focus-ring transition-all placeholder:text-brand-muted/60"
                placeholder="Enter password"
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-brand-text focus:outline-hidden cursor-pointer"
                aria-label={showPassword ? t.hidePassword : t.showPassword}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded-xl bg-[#0DA54F] hover:bg-[#0A8740] active:scale-[0.99] text-white text-xs sm:text-sm font-bold shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>{t.signin}</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Footer Actions: Reset Password Link */}
        <div className="p-4 bg-slate-50/80 border-t border-brand-border/60 flex items-center justify-center gap-4 text-xs text-slate-500">
          <button
            type="button"
            onClick={() => setIsResetModalOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs text-[#0DA54F] hover:underline font-semibold cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Have a reset token?</span>
          </button>
        </div>
      </div>

      {/* Forgot Password & Reset Password Modals */}
      <ForgotPasswordModal
        isOpen={isForgotModalOpen}
        onClose={() => setIsForgotModalOpen(false)}
      />

      <ResetPasswordModal
        isOpen={isResetModalOpen}
        initialToken={resetTokenFromUrl}
        onClose={() => {
          setIsResetModalOpen(false);
          setResetTokenFromUrl('');
        }}
        onSuccess={() => {
          setIsResetModalOpen(false);
          setResetTokenFromUrl('');
          setErrorMessage(null);
          setSuccessMessage(
            lang === 'bn'
              ? 'পাসওয়ার্ড সফলভাবে আপডেট হয়েছে। অনুগ্রহ করে নতুন পাসওয়ার্ড দিয়ে সাইন ইন করুন।'
              : 'Password updated. Please sign in.'
          );
          try {
            window.history.replaceState({}, '', window.location.pathname);
          } catch {
            // Ignore
          }
        }}
      />
    </div>
  );
};
