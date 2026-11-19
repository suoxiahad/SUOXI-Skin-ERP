import React, { useState, useEffect } from 'react';
import { X, UserCheck, AlertTriangle, History, CheckCircle2, ShieldCheck } from 'lucide-react';
import { api } from '../../../api/client.ts';
import { useApp } from '../../../context/AppContext.tsx';
import type { ReferrerDto, PatientReferralDto } from '@suoxi/shared-types';
import { formatDateDhaka } from '../../../utils/format.ts';

interface AssignPatientReferrerModalProps {
  patientId: string | null;
  patientName?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const AssignPatientReferrerModal: React.FC<AssignPatientReferrerModalProps> = ({
  patientId,
  patientName,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { language, addToast } = useApp();
  const [referrers, setReferrers] = useState<ReferrerDto[]>([]);
  const [selectedReferrerId, setSelectedReferrerId] = useState('');
  const [reason, setReason] = useState('');
  const [currentReferral, setCurrentReferral] = useState<PatientReferralDto | null>(null);
  const [history, setHistory] = useState<PatientReferralDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && patientId) {
      loadData();
    }
  }, [isOpen, patientId]);

  const loadData = async () => {
    if (!patientId) return;
    setIsLoading(true);
    try {
      const [refList, patHistory] = await Promise.all([
        api.referrals.list({ status: 'active', limit: 100 }),
        api.referrals.getPatientReferralHistory(patientId),
      ]);
      setReferrers(refList.data);
      setCurrentReferral(patHistory.current);
      setHistory(patHistory.history);
      if (patHistory.current) {
        setSelectedReferrerId(patHistory.current.referrerId);
      } else if (refList.data.length > 0) {
        setSelectedReferrerId(refList.data[0].id);
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        title: language === 'bn' ? 'তথ্য লোড করতে ব্যর্থ' : 'Failed to load referral data',
        description: err.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId || !selectedReferrerId) return;

    if (!reason.trim()) {
      addToast({
        type: 'error',
        title: language === 'bn' ? 'কারণ উল্লেখ বাধ্যতামূলক' : 'Attribution reason is mandatory',
        description: language === 'bn' ? 'রেফারার পরিবর্তনের কারণ লিখুন' : 'Please provide reason for assigning this referrer',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await api.referrals.assignPatientReferrer(patientId, {
        referrerId: selectedReferrerId,
        attributionReason: reason.trim(),
      });

      addToast({
        type: 'success',
        title: language === 'bn' ? 'রোগীর রেফারার নির্ধারিত হয়েছে' : 'Patient referrer assigned successfully',
        description: language === 'bn' ? 'ভবিষ্যতের পেমেন্টে কমিশন কার্যকর হবে' : 'Applies to future transactions',
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: language === 'bn' ? 'নির্ধারণ ব্যর্থ' : 'Failed to assign referrer',
        description: err.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !patientId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-[#0DA54F] flex items-center justify-center shadow-2xs">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                {language === 'bn' ? 'রোগীর রেফারার নির্ধারণ / পরিবর্তন' : 'Assign Patient Referrer'}
              </h2>
              <p className="text-xs text-slate-500">
                {patientName || patientId}
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

        {/* Current Attribution Notice */}
        {currentReferral && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-50/80 border border-emerald-200/80 text-xs">
            <span className="font-semibold text-emerald-800 block">
              {language === 'bn' ? 'বর্তমান সক্রিয় রেফারার:' : 'Current Active Referrer:'}
            </span>
            <div className="font-bold text-emerald-950 mt-0.5">
              {currentReferral.referrerName} ({currentReferral.referrerCode})
            </div>
            <div className="text-[11px] text-emerald-700 mt-1">
              {language === 'bn' ? 'যুক্ত করার তারিখ:' : 'Since:'} {formatDateDhaka(currentReferral.effectiveFrom)} | {currentReferral.attributionReason}
            </div>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Select Referrer */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {language === 'bn' ? 'রেফারার নির্বাচন করুন' : 'Select Referrer'} *
            </label>
            <select
              value={selectedReferrerId}
              onChange={(e) => setSelectedReferrerId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
            >
              {referrers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.fullName} ({r.referrerCode} - {r.referrerType})
                </option>
              ))}
            </select>
          </div>

          {/* Mandatory Reason */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {language === 'bn' ? 'অ্যাট্রিবিউশন বা পরিবর্তনের কারণ' : 'Attribution Reason'} *
            </label>
            <textarea
              rows={2}
              placeholder={
                language === 'bn'
                  ? 'উদা: ডাক্তারের প্রেসক্রিপশন স্লিপ বা রোগী নিজে রেফারার উল্লেখ করেছেন'
                  : 'e.g. Referred via doctor prescription card or direct partner introduction'
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
            />
          </div>

          {/* Future Transactions Only Notice */}
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
            <span className="font-semibold text-slate-800 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#0DA54F]" />
              {language === 'bn' ? 'ভবিষ্যৎ লেনদেন নীতি:' : 'Future Transactions Policy:'}
            </span>
            <p>
              {language === 'bn'
                ? 'রেফারার পরিবর্তন শুধুমাত্র ভবিষ্যতের পেমেন্টে প্রযোজ্য হবে। অতীতের কোন ট্রানজাকশন বা অর্জিত কমিশন পরিবর্তন হবে না।'
                : 'Changing patient referrer applies strictly to future payments. Historical commissions remain intact.'}
            </p>
          </div>

          {/* History */}
          {history.length > 0 && (
            <div>
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-2">
                <History className="w-3.5 h-3.5 text-slate-400" />
                {language === 'bn' ? 'অতীত রেফারাল ইতিহাস' : 'Attribution History'}
              </span>
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 text-[11px]">
                {history.map((h) => (
                  <div key={h.id} className="p-2.5 flex items-center justify-between bg-slate-50/50">
                    <div>
                      <span className="font-semibold text-slate-800">{h.referrerName}</span>
                      <span className="text-slate-400 ml-1.5 font-mono">({h.referrerCode})</span>
                      <div className="text-slate-500 text-[10px]">{h.attributionReason}</div>
                    </div>
                    <div className="text-right text-slate-400 text-[10px] tabular-nums">
                      {formatDateDhaka(h.effectiveFrom)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
              disabled={isSubmitting || !reason.trim()}
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
                  <span>{language === 'bn' ? 'রেফারার নির্ধারণ করুন' : 'Assign Referrer'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
