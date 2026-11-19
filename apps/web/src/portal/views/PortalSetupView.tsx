import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Lock,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { usePortalAuth } from '../context/PortalAuthContext.js';
import { portalApi } from '../api/portalClient.js';

interface PortalSetupViewProps {
  onGoToLogin: () => void;
}

export const PortalSetupView: React.FC<PortalSetupViewProps> = ({ onGoToLogin }) => {
  const { language } = usePortalAuth();
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Check if token is in query string ?token=...
    const urlParams = new URLSearchParams(window.location.search);
    const queryToken = urlParams.get('token');
    if (queryToken) {
      setToken(queryToken);
    }
  }, []);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      setError(language === 'bn' ? 'সেটআপ টোকেন আবশ্যক' : 'Setup token is required');
      return;
    }

    if (newPassword.length < 8) {
      setError(
        language === 'bn'
          ? 'পাসওয়ার্ড ন্যূনতম ৮ অক্ষরের হতে হবে'
          : 'Password must be at least 8 characters long'
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(
        language === 'bn'
          ? 'পাসওয়ার্ড দুটি মেলেনি'
          : 'Passwords do not match'
      );
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await portalApi.setup(token.trim(), newPassword);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Setup failed. Link may be invalid or expired.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between p-4 sm:p-6 max-w-md mx-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-700 text-white flex items-center justify-center font-bold text-sm shadow-2xs">
            S
          </div>
          <span className="font-bold text-xs text-slate-800 tracking-tight">
            SUOXI PORTAL
          </span>
        </div>
      </div>

      <div className="my-auto py-6 space-y-6">
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-[11px] font-bold border border-emerald-100 mb-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>{language === 'bn' ? 'প্রাথমিক অ্যাকাউন্ট সেটআপ' : 'First-Time Setup'}</span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            {language === 'bn' ? 'পাসওয়ার্ড সেট করুন' : 'Create Portal Password'}
          </h1>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            {language === 'bn'
              ? 'এসএমএসে প্রাপ্ত সিকিউর টোকেন দিয়ে আপনার পোর্টাল অ্যাকাউন্ট চালু করুন'
              : 'Activate your self-service account using the secure token received via SMS'}
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div className="p-6 bg-white border border-slate-100 rounded-2xl shadow-sm text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">
                {language === 'bn' ? 'অ্যাকাউন্ট সফলভাবে সেটআপ হয়েছে!' : 'Account Activated!'}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {language === 'bn'
                  ? 'আপনার পাসওয়ার্ড সফলভাবে সংরক্ষিত হয়েছে। আপনি এখন লগইন করতে পারেন।'
                  : 'Your secure credentials have been saved. You can now sign in.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onGoToLogin}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
            >
              <span>{language === 'bn' ? 'লগইন পেজে যান' : 'Go to Sign In'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <form onSubmit={handleSetup} className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm space-y-4 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-slate-700 block">
                {language === 'bn' ? 'সিকিউরিটি টোকেন' : 'Security Token'}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 pl-10 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-600 font-mono text-xs"
                  placeholder="Paste token from SMS link"
                />
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700 block">
                {language === 'bn' ? 'নতুন পাসওয়ার্ড (ন্যূনতম ৮ অক্ষর)' : 'New Password (min 8 chars)'}
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 pl-10 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-600 text-xs"
                  placeholder="••••••••"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700 block">
                {language === 'bn' ? 'পাসওয়ার্ড নিশ্চিত করুন' : 'Confirm Password'}
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 pl-10 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-600 text-xs"
                  placeholder="••••••••"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
            >
              <span>
                {isLoading
                  ? (language === 'bn' ? 'অ্যাকাউন্ট চালু করা হচ্ছে...' : 'Activating...')
                  : (language === 'bn' ? 'পাসওয়ার্ড নিশ্চিত করুন' : 'Activate Account')}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        )}

        <div className="text-center">
          <button
            type="button"
            onClick={onGoToLogin}
            className="text-xs text-slate-500 hover:text-slate-800 font-semibold cursor-pointer min-h-[44px] py-2"
          >
            {language === 'bn' ? '← লগইন পেজে ফিরে যান' : '← Back to Sign In'}
          </button>
        </div>
      </div>

      <div className="text-center text-[10px] text-slate-400">
        SUOXI Skin Care & Aesthetic Clinic • Dhaka
      </div>
    </div>
  );
};
