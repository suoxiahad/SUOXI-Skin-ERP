import React, { useState } from 'react';
import { X, Sparkles, AlertCircle, CheckCircle2, ShieldCheck, Scale, Calendar } from 'lucide-react';
import { api } from '../../../api/client.ts';
import { useApp } from '../../../context/AppContext.tsx';
import type {
  CommissionRuleCalculationType,
  CommissionRuleBasis,
  CommissionRuleAppliesTo,
  CommissionRuleRefundPolicy,
  CreateCommissionRuleRequest,
  ReferrerType,
} from '@suoxi/shared-types';

interface CommissionRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CommissionRuleModal: React.FC<CommissionRuleModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { language, addToast } = useApp();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<CreateCommissionRuleRequest>({
    ruleName: '',
    description: '',
    referrerType: 'all',
    calculationType: 'percentage',
    rateValue: 10.0,
    basis: 'paid_amount',
    appliesTo: 'all',
    firstPurchaseOnly: false,
    minBaseAmount: 1000.0,
    maxCommissionAmount: 5000.0,
    refundPolicy: 'proportional',
    withholdingTaxPercent: 10.0,
    validFrom: new Date().toISOString().slice(0, 10),
    validTo: null,
    isActive: true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!formData.ruleName.trim()) {
      errs.ruleName = language === 'bn' ? 'রুল নাম আবশ্যক' : 'Rule name is required';
    }
    if (formData.rateValue <= 0) {
      errs.rateValue = language === 'bn' ? 'কমিশন হার শূন্যের চেয়ে বেশি হতে হবে' : 'Rate value must be greater than zero';
    }
    if (formData.calculationType === 'percentage' && formData.rateValue > 100) {
      errs.rateValue = language === 'bn' ? 'শতকরা হার ১০০% এর বেশি হতে পারে না' : 'Percentage rate cannot exceed 100%';
    }
    if (!formData.validFrom) {
      errs.validFrom = language === 'bn' ? 'কার্যকর শুরুর তারিখ আবশ্যক' : 'Valid-from date is required';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await api.commissions.createRule(formData);
      addToast({
        type: 'success',
        title: language === 'bn' ? 'কমিশন রুল সংরক্ষিত হয়েছে' : 'Commission rule created successfully',
        description: `${formData.ruleName} (${formData.rateValue}${formData.calculationType === 'percentage' ? '%' : ' BDT'})`,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: language === 'bn' ? 'রুল সংরক্ষণে ব্যর্থ' : 'Failed to create commission rule',
        description: err.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-100 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shadow-2xs">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                {language === 'bn' ? 'নতুন কমিশন রুল কনফিগারেশন' : 'Create Commission Rule'}
              </h2>
              <p className="text-xs text-slate-500">
                {language === 'bn' ? 'রেফারার টাইপ ও সেবামুখী কমিশন কাঠামো' : 'Rule terms snapshot applied at calculation time'}
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

        {/* Management Immutability Disclaimer Banner */}
        <div className="mx-6 mt-4 p-3 rounded-xl bg-amber-50/80 border border-amber-200/80 flex items-start gap-2.5 text-xs text-amber-900">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">
              {language === 'bn' ? 'ম্যানেজমেন্ট নীতিমালা সতর্কতা:' : 'Policy & Snapshot Immutability Notice:'}
            </span>{' '}
            {language === 'bn'
              ? 'কমিশন রুলের শর্তাবলী কেবল অনুমোদিত ম্যানেজমেন্ট পরিবর্তন করতে পারে। রুল পরিবর্তনের পূর্বে অর্জিত অতীতের কোন কমিশন পরিবর্তন হবে না।'
              : 'Commission rules can only be created or modified by authorized management. All commissions snapshot applied rates at calculation time; past commissions remain immutable.'}
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Rule Name & Description */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {language === 'bn' ? 'রুল নাম' : 'Rule Name'} *
              </label>
              <input
                type="text"
                placeholder="e.g. Doctor Standard 10%"
                value={formData.ruleName}
                onChange={(e) => setFormData({ ...formData, ruleName: e.target.value })}
                className={`w-full px-3 py-2 text-xs rounded-lg border ${
                  errors.ruleName ? 'border-red-400 bg-red-50/20' : 'border-slate-200'
                } focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]`}
              />
              {errors.ruleName && <p className="text-[11px] text-red-500 mt-1">{errors.ruleName}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {language === 'bn' ? 'প্রযোজ্য রেফারার ধরন' : 'Target Referrer Type'} *
              </label>
              <select
                value={formData.referrerType}
                onChange={(e) => setFormData({ ...formData, referrerType: e.target.value as any })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
              >
                <option value="all">{language === 'bn' ? 'সকল ধরন (All Types)' : 'All Referrer Types'}</option>
                <option value="doctor">{language === 'bn' ? 'ডাক্তার (Doctor)' : 'Doctor / Consultant'}</option>
                <option value="patient">{language === 'bn' ? 'রোগী (Patient)' : 'Existing Patient'}</option>
                <option value="staff">{language === 'bn' ? 'স্টাফ (Staff)' : 'Internal Staff'}</option>
                <option value="agent">{language === 'bn' ? 'এজেন্ট (Agent)' : 'Marketing Agent'}</option>
                <option value="organization">{language === 'bn' ? 'প্রতিষ্ঠান (Org)' : 'Organization / Clinic'}</option>
              </select>
            </div>
          </div>

          {/* Calculation Type & Rate Value & Basis */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {language === 'bn' ? 'হিসাবের ধরন' : 'Calculation Type'} *
              </label>
              <select
                value={formData.calculationType}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    calculationType: e.target.value as CommissionRuleCalculationType,
                  })
                }
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount (৳ BDT)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {language === 'bn' ? 'কমিশন হার / মান' : 'Rate Value'} *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.rateValue}
                onChange={(e) => setFormData({ ...formData, rateValue: parseFloat(e.target.value) || 0 })}
                className={`w-full px-3 py-2 text-xs rounded-lg border ${
                  errors.rateValue ? 'border-red-400 bg-red-50/20' : 'border-slate-200'
                } focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]`}
              />
              {errors.rateValue && <p className="text-[11px] text-red-500 mt-1">{errors.rateValue}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {language === 'bn' ? 'গণনার ভিত্তি' : 'Calculation Basis'} *
              </label>
              <select
                value={formData.basis}
                onChange={(e) => setFormData({ ...formData, basis: e.target.value as CommissionRuleBasis })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
              >
                <option value="paid_amount">Paid Realized Amount (৳)</option>
                <option value="invoice_total">Invoice Total (৳)</option>
                <option value="service_price">Service Price (৳)</option>
                <option value="package_price">Package Price (৳)</option>
              </select>
            </div>
          </div>

          {/* Min Base & Max Commission Cap & Withholding Tax */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {language === 'bn' ? 'ন্যূনতম পেমেন্ট ভিত্তি (৳)' : 'Min Base Amount (৳)'}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.minBaseAmount || 0}
                onChange={(e) => setFormData({ ...formData, minBaseAmount: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {language === 'bn' ? 'সর্বোচ্চ কমিশন ক্যাপ (৳)' : 'Max Commission Cap (৳)'}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="No limit"
                value={formData.maxCommissionAmount || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    maxCommissionAmount: e.target.value ? parseFloat(e.target.value) : null,
                  })
                }
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {language === 'bn' ? 'উৎস কর কর্তন (AIT %)' : 'Withholding Tax (%)'}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={formData.withholdingTaxPercent || 0}
                onChange={(e) =>
                  setFormData({ ...formData, withholdingTaxPercent: parseFloat(e.target.value) || 0 })
                }
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
              />
            </div>
          </div>

          {/* Refund Policy & First Purchase */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {language === 'bn' ? 'রিফান্ড নীতি' : 'Refund Reversal Policy'}
              </label>
              <select
                value={formData.refundPolicy}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    refundPolicy: e.target.value as CommissionRuleRefundPolicy,
                  })
                }
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
              >
                <option value="proportional">Proportional Reversal (প্রপোর্শনাল)</option>
                <option value="full_reversal">Full Reversal (সম্পূর্ণ রিভার্সাল)</option>
                <option value="none">No Reversal (কোন রিভার্সাল নেই)</option>
              </select>
            </div>

            <div className="flex items-center pt-6">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formData.firstPurchaseOnly}
                  onChange={(e) => setFormData({ ...formData, firstPurchaseOnly: e.target.checked })}
                  className="w-4 h-4 rounded text-[#0DA54F] focus:ring-[#0DA54F]"
                />
                <span className="text-xs font-semibold text-slate-700">
                  {language === 'bn' ? 'কেবল রোগীর প্রথম ক্রয়ে প্রযোজ্য' : 'First purchase only (নতুন রোগীর প্রথম পেমেন্ট)'}
                </span>
              </label>
            </div>
          </div>

          {/* Validity Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {language === 'bn' ? 'কার্যকর শুরুর তারিখ' : 'Valid From'} *
              </label>
              <input
                type="date"
                value={formData.validFrom}
                onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {language === 'bn' ? 'কার্যকর সমাপ্তির তারিখ (ঐচ্ছিক)' : 'Valid To (Optional)'}
              </label>
              <input
                type="date"
                value={formData.validTo || ''}
                onChange={(e) => setFormData({ ...formData, validTo: e.target.value || null })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {language === 'bn' ? 'বিবরণ' : 'Description'}
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Incentive policy for clinic partners in Dhanmondi & Banani"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
            />
          </div>

          {/* Actions */}
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
                  <span>{language === 'bn' ? 'রুল সংরক্ষণ করুন' : 'Save Rule'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
