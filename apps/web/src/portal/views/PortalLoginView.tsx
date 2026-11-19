import React, { useState } from 'react';
import {
  Sparkles,
  Lock,
  Phone,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { usePortalAuth } from '../context/PortalAuthContext.js';
import { portalApi } from '../api/portalClient.js';

interface PortalLoginViewProps {
  onGoToSetup: () => void;
}

export const PortalLoginView: React.FC<PortalLoginViewProps> = ({ onGoToSetup }) => {
  const { login, language, setLanguage } = usePortalAuth();
  const [ident, setIdent] = useState('+8801711223344');
  const [password, setPassword] = useState('PatientPass123!');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forgot password flow
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [forgotIdent, setForgotIdent] = useState('');
  const [forgotMsg, setForgotMsg] = useState<string | null>(null);
  const [isForgotBusy, setIsForgotBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ident.trim() || !password) {
      setError(language === 'bn' ? 'সবগুলো তথ্য পূরণ করুন' : 'Please provide both login ID and password');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await login(ident.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotIdent.trim()) return;
    setIsForgotBusy(true);
    setError(null);
    try {
      await portalApi.forgot(forgotIdent.trim());
      setForgotMsg(
        language === 'bn'
          ? 'যদি অ্যাকাউন্ট পাওয়া যায়, পাসওয়ার্ড রিসেট লিংক আপনার মোবাইলে পাঠানো হয়েছে।'
          : 'If an account exists, password reset instructions have been dispatched.'
      );
    } catch (err: any) {
      setError(err.message || 'Failed to request reset');
    } finally {
      setIsForgotBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between p-4 sm:p-6 max-w-md mx-auto">
      {/* Top Bar with Language Toggle */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-700 text-white flex items-center justify-center font-bold text-sm shadow-2xs">
            S
          </div>
          <span className="font-bold text-xs text-slate-800 tracking-tight">
            SUOXI PORTAL
          </span>
        </div>

        <div className="flex bg-slate-200/70 p-1 rounded-xl text-xs">
          <button
            type="button"
            onClick={() => setLanguage('bn')}
            className={`min-h-[36px] px-3 rounded-lg font-bold transition-all cursor-pointer ${
              language === 'bn' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-600'
            }`}
          >
            বাংলা
          </button>
          <button
            type="button"
            onClick={() => setLanguage('en')}
            className={`min-h-[36px] px-3 rounded-lg font-bold transition-all cursor-pointer ${
              language === 'en' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-600'
            }`}
          >
            English
          </button>
        </div>
      </div>

      {/* Main Card */}
      <div className="my-auto py-6 space-y-6">
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-[11px] font-bold border border-emerald-100 mb-1">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>{language === 'bn' ? 'রোগী পোর্টাল লগইন' : 'Patient Self-Service'}</span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            {language === 'bn' ? 'সুওক্সি পেশেন্ট পোর্টালে স্বাগতম' : 'Welcome to Suoxi Portal'}
          </h1>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            {language === 'bn'
              ? 'আপনার প্রেসক্রিপশন, চিকিৎসার সেশন, ও বিলিং তথ্যে নিরাপদ প্রবেশাধিকার'
              : 'Securely view your prescriptions, session aftercare, and invoices'}
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {forgotMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{forgotMsg}</span>
          </div>
        )}

        {!isForgotOpen ? (
          <form onSubmit={handleSubmit} className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm space-y-4 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-slate-700 block">
                {language === 'bn' ? 'লগইন আইডি / মোবাইল নম্বর' : 'Login ID or Mobile Number'}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={ident}
                  onChange={(e) => setIdent(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 pl-10 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-600 font-mono text-xs"
                  placeholder="+8801XXXXXXXXX / PAT-XXXXXX"
                />
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-700 block">
                  {language === 'bn' ? 'পাসওয়ার্ড' : 'Password'}
                </label>
                <button
                  type="button"
                  onClick={() => setIsForgotOpen(true)}
                  className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer min-h-[44px] py-1"
                >
                  {language === 'bn' ? 'পাসওয়ার্ড ভুলে গেছেন?' : 'Forgot password?'}
                </button>
              </div>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
                  ? (language === 'bn' ? 'যাচাই করা হচ্ছে...' : 'Verifying...')
                  : (language === 'bn' ? 'লগইন করুন' : 'Sign In')}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        ) : (
          <form onSubmit={handleForgotSubmit} className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm space-y-4 text-xs">
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
              {language === 'bn' ? 'পাসওয়ার্ড পুনরুদ্ধার' : 'Reset Portal Password'}
            </h3>
            <p className="text-[11px] text-slate-500">
              {language === 'bn'
                ? 'আপনার রেজিস্টার্ড মোবাইল বা পেশেন্ট কোড দিন। আমরা এসএমএস এর মাধ্যমে রিসেট লিংক পাঠাব।'
                : 'Enter your registered mobile or patient code. We will send a secure reset link.'}
            </p>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700 block">
                {language === 'bn' ? 'মোবাইল বা পেশেন্ট কোড' : 'Mobile / Patient Code'}
              </label>
              <input
                type="text"
                value={forgotIdent}
                onChange={(e) => setForgotIdent(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-600 text-xs font-mono"
                placeholder="+8801XXXXXXXXX"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsForgotOpen(false)}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 cursor-pointer"
              >
                {language === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={isForgotBusy}
                className="flex-1 min-h-[44px] rounded-xl bg-emerald-700 text-white font-bold text-xs hover:bg-emerald-800 cursor-pointer shadow-sm disabled:opacity-50"
              >
                {isForgotBusy
                  ? (language === 'bn' ? 'পাঠানো হচ্ছে...' : 'Sending...')
                  : (language === 'bn' ? 'লিংক পাঠান' : 'Send Link')}
              </button>
            </div>
          </form>
        )}

        {/* Link to Setup */}
        <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-100 text-center space-y-1 text-xs">
          <span className="text-slate-600 block">
            {language === 'bn' ? 'প্রথমবার আসছেন বা এসএমএস লিংক পেয়েছেন?' : 'First time or received an SMS link?'}
          </span>
          <button
            type="button"
            onClick={onGoToSetup}
            className="text-emerald-800 font-bold underline hover:text-emerald-950 cursor-pointer min-h-[44px] py-1"
          >
            {language === 'bn' ? 'অ্যাকাউন্ট সেটআপ সম্পন্ন করুন' : 'Complete Initial Account Setup'}
          </button>
        </div>
      </div>

      {/* Footer Info */}
      <div className="text-center text-[10px] text-slate-400 space-y-1">
        <p>SUOXI Skin Care & Aesthetic Clinic • Dhaka, Bangladesh</p>
        <p>Protected by Argon2id & Double-Submit CSRF Realm Security</p>
      </div>
    </div>
  );
};
