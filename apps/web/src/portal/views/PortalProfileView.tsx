import React, { useEffect, useState } from 'react';
import {
  User,
  Phone,
  Mail,
  MapPin,
  Lock,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Save,
  Key,
} from 'lucide-react';
import type { PortalProfileDto } from '@suoxi/shared-types';
import { portalApi } from '../api/portalClient.js';
import { usePortalAuth } from '../context/PortalAuthContext.js';

export const PortalProfileView: React.FC = () => {
  const { language, setLanguage, logout } = usePortalAuth();
  const [profile, setProfile] = useState<PortalProfileDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Editable Profile fields
  const [address, setAddress] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyRelation, setEmergencyRelation] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Password Change
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // OTP Change Contact modal state
  const [otpModal, setOtpModal] = useState<{
    isOpen: boolean;
    changeType: 'mobile' | 'email';
    targetValue: string;
    step: 'request' | 'verify';
    otpCode: string;
    simulatedCode?: string;
    error?: string;
    isBusy: boolean;
  }>({
    isOpen: false,
    changeType: 'mobile',
    targetValue: '',
    step: 'request',
    otpCode: '',
    isBusy: false,
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setIsLoading(true);
        const p = await portalApi.getProfile();
        if (mounted) {
          setProfile(p);
          setAddress(p.address || '');
          setEmergencyName(p.emergencyContactName || '');
          setEmergencyRelation(p.emergencyContactRelation || '');
          setEmergencyPhone(p.emergencyContactMobile || '');
        }
      } catch (err: any) {
        if (mounted) setError(err.message || 'Failed to load profile');
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setSuccessMsg(null);
    setError(null);
    try {
      const updated = await portalApi.updateProfile({
        address,
        emergencyContactName: emergencyName,
        emergencyContactRelation: emergencyRelation,
        emergencyContactMobile: emergencyPhone,
      });
      setProfile(updated);
      setSuccessMsg(
        language === 'bn'
          ? 'প্রোফাইল তথ্য সফলভাবে সংরক্ষিত হয়েছে'
          : 'Profile updated successfully'
      );
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // OTP flow handlers
  const handleOpenOtpModal = (type: 'mobile' | 'email') => {
    setOtpModal({
      isOpen: true,
      changeType: type,
      targetValue: type === 'mobile' ? (profile?.primaryMobile || '') : (profile?.email || ''),
      step: 'request',
      otpCode: '',
      isBusy: false,
    });
  };

  const handleSendOtp = async () => {
    setOtpModal((prev) => ({ ...prev, isBusy: true, error: undefined }));
    try {
      const res = await portalApi.requestContactOtp(otpModal.changeType, otpModal.targetValue);
      setOtpModal((prev) => ({
        ...prev,
        step: 'verify',
        simulatedCode: res.simulatedOtp,
        isBusy: false,
      }));
    } catch (err: any) {
      setOtpModal((prev) => ({ ...prev, isBusy: false, error: err.message }));
    }
  };

  const handleConfirmOtp = async () => {
    setOtpModal((prev) => ({ ...prev, isBusy: true, error: undefined }));
    try {
      await portalApi.confirmContactOtp(
        otpModal.changeType,
        otpModal.targetValue,
        otpModal.otpCode
      );
      // Reload profile
      const p = await portalApi.getProfile();
      setProfile(p);
      setOtpModal({
        isOpen: false,
        changeType: 'mobile',
        targetValue: '',
        step: 'request',
        otpCode: '',
        isBusy: false,
      });
      setSuccessMsg(
        language === 'bn'
          ? `${otpModal.changeType === 'mobile' ? 'মোবাইল নম্বর' : 'ইমেইল'} সফলভাবে পরিবর্তিত হয়েছে`
          : 'Contact information updated successfully'
      );
    } catch (err: any) {
      setOtpModal((prev) => ({ ...prev, isBusy: false, error: err.message }));
    }
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-slate-800">
          {language === 'bn' ? 'প্রোফাইল ও নিরাপত্তা' : 'Profile & Security'}
        </h2>
        <p className="text-xs text-slate-500">
          {language === 'bn'
            ? 'ব্যক্তিগত তথ্য, জরুরি যোগাযোগ এবং একাউন্ট নিরাপত্তা সেটিংস'
            : 'Manage contact details, emergency contacts and portal credentials'}
        </p>
      </div>

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 1. Verified Patient Identity Card (Read-Only) */}
      {profile && (
        <div className="p-4 rounded-2xl bg-white border border-slate-100 shadow-2xs space-y-3 text-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                {language === 'bn' ? 'রোগীর পূর্ণ নাম' : 'Full Name'}
              </span>
              <span className="font-bold text-slate-800 text-sm">
                {language === 'bn' && profile.fullNameBangla
                  ? profile.fullNameBangla
                  : profile.fullName}
              </span>
            </div>
            <span className="font-mono text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100">
              {profile.patientCode}
            </span>
          </div>

          {/* Mobile & Email with OTP Verification badges */}
          <div className="grid grid-cols-1 gap-2.5">
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-slate-400" />
                <div>
                  <span className="text-[10px] text-slate-400 block">
                    {language === 'bn' ? 'প্রাথমিক মোবাইল' : 'Primary Mobile'}
                  </span>
                  <span className="font-semibold text-slate-800 font-mono">
                    {profile.primaryMobile}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleOpenOtpModal('mobile')}
                className="min-h-[44px] px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                {language === 'bn' ? 'পরিবর্তন করুন' : 'Change'}
              </button>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-slate-400" />
                <div>
                  <span className="text-[10px] text-slate-400 block">
                    {language === 'bn' ? 'ইমেইল এড্রেস' : 'Email Address'}
                  </span>
                  <span className="font-semibold text-slate-800">
                    {profile.email || (language === 'bn' ? 'সংযুক্ত নেই' : 'Not set')}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleOpenOtpModal('email')}
                className="min-h-[44px] px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                {language === 'bn' ? 'পরিবর্তন করুন' : 'Change'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Allowed Edits: Address & Emergency Contact Form */}
      <form
        onSubmit={handleSaveProfile}
        className="p-5 rounded-2xl bg-white border border-slate-100 shadow-2xs space-y-4 text-xs"
      >
        <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500">
          {language === 'bn' ? 'জরুরি যোগাযোগ ও ঠিকানা' : 'Address & Emergency Contact'}
        </h3>

        <div className="space-y-1">
          <label className="font-semibold text-slate-700 block">
            {language === 'bn' ? 'বর্তমান ঠিকানা' : 'Residential Address'}
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-600 bg-white"
            placeholder={language === 'bn' ? 'আপনার ঠিকানা লিখুন' : 'e.g. House 12, Road 4, Dhanmondi'}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="font-semibold text-slate-700 block">
              {language === 'bn' ? 'জরুরি ব্যক্তির নাম' : 'Emergency Contact Name'}
            </label>
            <input
              type="text"
              value={emergencyName}
              onChange={(e) => setEmergencyName(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-600 bg-white"
              placeholder={language === 'bn' ? 'নাম লিখুন' : 'Full Name'}
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-700 block">
              {language === 'bn' ? 'সম্পর্ক' : 'Relation'}
            </label>
            <input
              type="text"
              value={emergencyRelation}
              onChange={(e) => setEmergencyRelation(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-600 bg-white"
              placeholder={language === 'bn' ? 'যেমন: স্বামী/স্ত্রী/পিতা' : 'e.g. Spouse, Parent'}
            />
          </div>

          <div className="space-y-1 sm:col-span-2">
            <label className="font-semibold text-slate-700 block">
              {language === 'bn' ? 'জরুরি মোবাইল নম্বর' : 'Emergency Mobile'}
            </label>
            <input
              type="text"
              value={emergencyPhone}
              onChange={(e) => setEmergencyPhone(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-600 bg-white font-mono"
              placeholder="+8801XXXXXXXXX"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isSavingProfile}
          className="w-full min-h-[44px] py-2 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
        >
          <Save className="w-4 h-4" />
          <span>
            {isSavingProfile
              ? (language === 'bn' ? 'সংরক্ষণ করা হচ্ছে...' : 'Saving...')
              : (language === 'bn' ? 'পরিবর্তন সংরক্ষণ করুন' : 'Save Changes')}
          </span>
        </button>
      </form>

      {/* 3. Language & Session Management */}
      <div className="p-5 rounded-2xl bg-white border border-slate-100 shadow-2xs space-y-3 text-xs">
        <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500">
          {language === 'bn' ? 'অ্যাপ সেটিংস' : 'App Preferences'}
        </h3>

        <div className="flex items-center justify-between py-1">
          <span className="font-semibold text-slate-700">
            {language === 'bn' ? 'পছন্দের ভাষা' : 'Language'}
          </span>
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setLanguage('bn')}
              className={`min-h-[36px] px-3 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                language === 'bn' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-500'
              }`}
            >
              বাংলা
            </button>
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`min-h-[36px] px-3 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                language === 'en' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-500'
              }`}
            >
              English
            </button>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={logout}
            className="w-full min-h-[44px] py-2 px-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>{language === 'bn' ? 'পোর্টাল থেকে লগআউট করুন' : 'Log Out of Portal'}</span>
          </button>
        </div>
      </div>

      {/* 4. OTP Verification Modal */}
      {otpModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 space-y-4 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-800">
                {language === 'bn'
                  ? `${otpModal.changeType === 'mobile' ? 'মোবাইল নম্বর' : 'ইমেইল'} পরিবর্তন`
                  : `Change ${otpModal.changeType === 'mobile' ? 'Mobile' : 'Email'}`}
              </h3>
              <button
                type="button"
                onClick={() => setOtpModal((prev) => ({ ...prev, isOpen: false }))}
                className="text-slate-400 hover:text-slate-600 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer text-lg"
              >
                ✕
              </button>
            </div>

            {otpModal.error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs">
                {otpModal.error}
              </div>
            )}

            {otpModal.step === 'request' ? (
              <div className="space-y-3 text-xs">
                <p className="text-slate-500">
                  {language === 'bn'
                    ? `নিরাপত্তার স্বার্থে নতুন ${
                        otpModal.changeType === 'mobile' ? 'নম্বরে' : 'ইমেইলে'
                      } ৬-সংখ্যার ওটিপি কোড পাঠানো হবে।`
                    : `A 6-digit OTP code will be sent to verify this change.`}
                </p>
                <input
                  type={otpModal.changeType === 'mobile' ? 'tel' : 'email'}
                  value={otpModal.targetValue}
                  onChange={(e) =>
                    setOtpModal((prev) => ({ ...prev, targetValue: e.target.value }))
                  }
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-600 font-mono text-xs"
                  placeholder={
                    otpModal.changeType === 'mobile' ? '+8801XXXXXXXXX' : 'name@example.com'
                  }
                />
                <button
                  type="button"
                  disabled={otpModal.isBusy}
                  onClick={handleSendOtp}
                  className="w-full min-h-[44px] rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>
                    {otpModal.isBusy
                      ? (language === 'bn' ? 'কোড পাঠানো হচ্ছে...' : 'Sending...')
                      : (language === 'bn' ? 'ওটিপি কোড পাঠান' : 'Send Verification OTP')}
                  </span>
                </button>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <p className="text-slate-500">
                  {language === 'bn'
                    ? `${otpModal.targetValue} এ পাঠানো ৬-সংখ্যার কোডটি লিখুন:`
                    : `Enter the 6-digit verification code sent to ${otpModal.targetValue}:`}
                </p>

                {/* Simulated OTP notice for testing */}
                {otpModal.simulatedCode && (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-[11px] font-mono">
                    <span className="font-bold">Test OTP: </span>
                    {otpModal.simulatedCode}
                  </div>
                )}

                <input
                  type="text"
                  maxLength={6}
                  value={otpModal.otpCode}
                  onChange={(e) =>
                    setOtpModal((prev) => ({ ...prev, otpCode: e.target.value }))
                  }
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 text-center text-lg font-mono tracking-widest focus:outline-none focus:border-emerald-600"
                  placeholder="123456"
                />

                <button
                  type="button"
                  disabled={otpModal.isBusy || otpModal.otpCode.length < 6}
                  onClick={handleConfirmOtp}
                  className="w-full min-h-[44px] rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <span>
                    {otpModal.isBusy
                      ? (language === 'bn' ? 'যাচাই করা হচ্ছে...' : 'Verifying...')
                      : (language === 'bn' ? 'যাচাই ও নিশ্চিত করুন' : 'Verify & Confirm')}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
