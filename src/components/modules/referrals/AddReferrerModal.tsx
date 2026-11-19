import React, { useState } from 'react';
import { X, Lock, ShieldCheck, UserPlus, Building, Phone, Mail, FileText, CheckCircle2 } from 'lucide-react';
import { api } from '../../../api/client.ts';
import { useApp } from '../../../context/AppContext.tsx';
import type { ReferrerType, PayoutMethod, CreateReferrerRequest } from '@suoxi/shared-types';

interface AddReferrerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddReferrerModal: React.FC<AddReferrerModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { addToast, language } = useApp();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<CreateReferrerRequest>({
    referrerType: 'doctor',
    fullName: '',
    fullNameBn: '',
    mobile: '',
    email: '',
    organizationName: '',
    payoutMethod: 'bank_transfer',
    payoutAccountDetails: '',
    notes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!formData.fullName.trim()) {
      errs.fullName = language === 'bn' ? 'পূর্ণ নাম আবশ্যক' : 'Full name is required';
    }
    if (!formData.mobile.trim()) {
      errs.mobile = language === 'bn' ? 'মোবাইল নম্বর আবশ্যক' : 'Mobile number is required';
    } else if (!/^(\+88)?01[3-9]\d{8}$/.test(formData.mobile.replace(/\s+/g, ''))) {
      errs.mobile = language === 'bn' ? 'সঠিক বাংলাদেশ মোবাইল নম্বর দিন (+8801XXXXXXXXX)' : 'Enter valid Bangladesh mobile (+8801XXXXXXXXX)';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await api.referrals.create(formData);
      addToast({
        type: 'success',
        title: language === 'bn' ? 'রেফারার সফলভাবে যুক্ত হয়েছে' : 'Referrer registered successfully',
        description: `${formData.fullName} (${formData.referrerType})`,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: language === 'bn' ? 'রেফারার যুক্ত করতে ব্যর্থ' : 'Failed to register referrer',
        description: err.message || 'Error occurred',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-[#0DA54F] flex items-center justify-center shadow-2xs">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                {language === 'bn' ? 'নতুন রেফারার নিবন্ধন' : 'Register New Referrer'}
              </h2>
              <p className="text-xs text-slate-500">
                {language === 'bn'
                  ? 'ডাক্তার, এজেন্ট বা পার্টনার রেফারাল ট্র্যাকিং'
                  : 'Track referrals from doctors, patients, staff & partners'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Referrer Type & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {language === 'bn' ? 'রেফারার ধরন' : 'Referrer Type'} *
              </label>
              <select
                value={formData.referrerType}
                onChange={(e) => setFormData({ ...formData, referrerType: e.target.value as ReferrerType })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
              >
                <option value="doctor">{language === 'bn' ? 'ডাক্তার (Doctor)' : 'Doctor / Consultant'}</option>
                <option value="patient">{language === 'bn' ? 'রোগী (Patient)' : 'Existing Patient'}</option>
                <option value="staff">{language === 'bn' ? 'স্টাফ (Staff)' : 'Internal Staff'}</option>
                <option value="agent">{language === 'bn' ? 'এজেন্ট (Agent)' : 'Marketing Agent'}</option>
                <option value="organization">{language === 'bn' ? 'প্রতিষ্ঠান (Org)' : 'Organization / Clinic'}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {language === 'bn' ? 'প্রতিষ্ঠানের নাম' : 'Organization Name'}
              </label>
              <div className="relative">
                <Building className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="e.g. Square Hospital Dhaka"
                  value={formData.organizationName || ''}
                  onChange={(e) => setFormData({ ...formData, organizationName: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                />
              </div>
            </div>
          </div>

          {/* Full Name & Bengali Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {language === 'bn' ? 'পূর্ণ নাম (English)' : 'Full Name (English)'} *
              </label>
              <input
                type="text"
                placeholder="e.g. Dr. Mahbubur Rahman"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className={`w-full px-3 py-2 text-xs rounded-lg border ${
                  errors.fullName ? 'border-red-400 bg-red-50/20' : 'border-slate-200'
                } focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]`}
              />
              {errors.fullName && <p className="text-[11px] text-red-500 mt-1">{errors.fullName}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {language === 'bn' ? 'নাম (বাংলায়)' : 'Name in Bangla (ঐচ্ছিক)'}
              </label>
              <input
                type="text"
                placeholder="ডা. মাহবুবুর রহমান"
                value={formData.fullNameBn || ''}
                onChange={(e) => setFormData({ ...formData, fullNameBn: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
              />
            </div>
          </div>

          {/* Mobile & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {language === 'bn' ? 'মোবাইল নম্বর' : 'Mobile Number'} *
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="+88017XXXXXXXX"
                  value={formData.mobile}
                  onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                  className={`w-full pl-9 pr-3 py-2 text-xs rounded-lg border ${
                    errors.mobile ? 'border-red-400 bg-red-50/20' : 'border-slate-200'
                  } focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]`}
                />
              </div>
              {errors.mobile && <p className="text-[11px] text-red-500 mt-1">{errors.mobile}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {language === 'bn' ? 'ইমেইল' : 'Email Address'}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  placeholder="doctor@example.com"
                  value={formData.email || ''}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                />
              </div>
            </div>
          </div>

          {/* Financial Payout Settings (Encrypted) */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#0DA54F]" />
                {language === 'bn' ? 'কমিশন পে-আউট ব্যাংক বা ওয়ালেট' : 'Commission Payout & Banking'}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 bg-emerald-100 rounded-full">
                <Lock className="w-2.5 h-2.5" /> AES-256-GCM Encrypted
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  {language === 'bn' ? 'পেমেন্ট মাধ্যম' : 'Payout Method'}
                </label>
                <select
                  value={formData.payoutMethod}
                  onChange={(e) => setFormData({ ...formData, payoutMethod: e.target.value as PayoutMethod })}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                >
                  <option value="bank_transfer">Bank Transfer (ব্যাংক ট্রান্সফার)</option>
                  <option value="bKash">bKash (বিকাশ)</option>
                  <option value="Nagad">Nagad (নগদ)</option>
                  <option value="cash">Cash (নগদ টাকা)</option>
                  <option value="cheque">Cheque (চেক)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  {language === 'bn' ? 'অ্যাকাউন্ট বা ওয়ালেট বিবরণ' : 'Account Details / Wallet No'}
                </label>
                <input
                  type="text"
                  placeholder="A/C No, Bank & Branch or bKash No"
                  value={formData.payoutAccountDetails || ''}
                  onChange={(e) => setFormData({ ...formData, payoutAccountDetails: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-500">
              {language === 'bn'
                ? 'হার্ড রুল ১০ অনুযায়ী এই তথ্য এনক্রিপ্ট করে ডাটাবেজে সংরক্ষিত হয় এবং অনুমতি ছাড়া মাস্ক করা থাকে।'
                : 'Per Hard Rule 10, payout details are encrypted at rest (AES-256-GCM) and masked in UI unless privileged.'}
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {language === 'bn' ? 'মন্তব্য বা বিশেষ নোট' : 'Notes'}
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Specialized in aesthetic dermatology referrals"
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              {language === 'bn' ? 'বাতিল' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-semibold text-white bg-[#0DA54F] hover:bg-[#0b8a42] rounded-lg transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{language === 'bn' ? 'সংরক্ষণ হচ্ছে...' : 'Saving...'}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{language === 'bn' ? 'রেফারার সংরক্ষণ করুন' : 'Save Referrer'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
