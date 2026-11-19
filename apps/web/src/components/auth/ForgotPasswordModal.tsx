import React, { useState } from 'react';
import { X, Mail, CheckCircle2, AlertCircle } from 'lucide-react';
import { authApi } from '../../api/auth.js';
import { useI18n } from '../../i18n/I18nContext.js';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenResetWithToken?: (token: string) => void;
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  isOpen,
  onClose,
  onOpenResetWithToken,
}) => {
  const { lang } = useI18n();
  const [identifier, setIdentifier] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    setIsSubmitting(true);

    try {
      const res = await authApi.forgotPassword({ usernameOrEmail: identifier.trim() });
      setStatusMessage(res.message || 'If an active account exists with that identifier, password reset instructions have been sent.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to submit request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-150">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-12 h-12 rounded-xl bg-emerald-50 text-[#0DA54F] flex items-center justify-center mb-3">
          <Mail className="w-6 h-6" />
        </div>

        <h2 className="text-lg font-bold text-slate-900 mb-1">
          {lang === 'bn' ? 'পাসওয়ার্ড রিসেট করুন' : 'Forgot Password'}
        </h2>
        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
          {lang === 'bn'
            ? 'আপনার ইউজারনেম বা ইমেইল ঠিকানা লিখুন। সিস্টেমে অ্যাকাউন্ট থাকলে একটি রিসেট টোকেন পাঠানো হবে।'
            : 'Enter your username or email address. If an active account matches, password reset instructions will be sent.'}
        </p>

        {statusMessage ? (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#0DA54F] mt-0.5" />
              <div className="flex-1 font-medium">{statusMessage}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 bg-[#0DA54F] text-white font-bold rounded-lg text-xs"
            >
              {lang === 'bn' ? 'ঠিক আছে' : 'Done'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <div>{errorMessage}</div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'bn' ? 'ইউজারনেম অথবা ইমেইল' : 'Username or Email'}
              </label>
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus-ring"
                placeholder="e.g. admin or admin@suoxiclinic.com"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-[#0DA54F] hover:bg-[#0A8740] text-white text-xs font-bold rounded-xl disabled:opacity-60"
              >
                {isSubmitting ? 'Submitting...' : lang === 'bn' ? 'পাঠান' : 'Send Instructions'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
