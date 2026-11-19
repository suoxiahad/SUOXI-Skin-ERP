import React, { useState, useEffect } from 'react';
import { X, CreditCard, DollarSign, CheckCircle2, AlertTriangle, ShieldCheck, CheckSquare, Square } from 'lucide-react';
import { api } from '../../../api/client.ts';
import { useApp } from '../../../context/AppContext.tsx';
import type { CommissionDto, PayoutMethod, ReferrerDto } from '@suoxi/shared-types';
import { formatBDT, formatDateDhaka } from '../../../utils/format.ts';

interface CreatePayoutModalProps {
  referrerId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreatePayoutModal: React.FC<CreatePayoutModalProps> = ({
  referrerId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { language, addToast } = useApp();
  const [referrer, setReferrer] = useState<ReferrerDto | null>(null);
  const [eligibleCommissions, setEligibleCommissions] = useState<CommissionDto[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod>('bank_transfer');
  const [paymentReference, setPaymentReference] = useState('');
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && referrerId) {
      loadData();
    }
  }, [isOpen, referrerId]);

  const loadData = async () => {
    if (!referrerId) return;
    setIsLoading(true);
    try {
      const ref = await api.referrals.get(referrerId);
      setReferrer(ref);
      setPayoutMethod(ref.payoutMethod || 'bank_transfer');

      const allComms = await api.commissions.list({
        referrerId,
        status: 'approved',
      });
      // Filter out any that already have a payout_id (Single Payout Invariant)
      const approvedUnpaid = allComms.filter((c) => !c.payoutId && c.status === 'approved');
      setEligibleCommissions(approvedUnpaid);
      setSelectedIds(new Set(approvedUnpaid.map((c) => c.id)));
    } catch (err: any) {
      addToast({
        type: 'error',
        title: language === 'bn' ? 'তথ্য লোড করতে ব্যর্থ' : 'Failed to load commissions',
        description: err.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === eligibleCommissions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligibleCommissions.map((c) => c.id)));
    }
  };

  // Calculations
  const selectedCommissions = eligibleCommissions.filter((c) => selectedIds.has(c.id));
  const grossAmount = selectedCommissions.reduce((sum, c) => sum + c.computedAmount, 0);
  const withholdingAmount = selectedCommissions.reduce((sum, c) => sum + c.withholdingAmount, 0);
  const netPayoutAmount = selectedCommissions.reduce((sum, c) => sum + c.netAmount, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!referrerId) return;

    if (selectedIds.size === 0) {
      addToast({
        type: 'error',
        title: language === 'bn' ? 'কমিশন নির্বাচন আবশ্যক' : 'Select at least one commission',
        description: language === 'bn' ? 'পে-আউটের জন্য অনুমোদিত কমিশন নির্বাচন করুন' : 'Select commissions to include in this payout',
      });
      return;
    }

    if (!paymentReference.trim()) {
      addToast({
        type: 'error',
        title: language === 'bn' ? 'পেমেন্ট রেফারেন্স আবশ্যক' : 'Payment reference is required',
        description: language === 'bn' ? 'ব্যাংক TrxID বা চেক নম্বর দিন' : 'Enter transaction ID, voucher, or cheque reference',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const payout = await api.commissions.createPayout({
        referrerId,
        commissionIds: Array.from(selectedIds),
        payoutMethod,
        paymentReference: paymentReference.trim(),
        paidDate,
        notes: notes.trim() || undefined,
      });

      addToast({
        type: 'success',
        title: language === 'bn' ? 'পে-আউট সফলভাবে তৈরি হয়েছে' : 'Payout created successfully',
        description: `${payout.payoutNumber} — ${formatBDT(payout.netPayoutAmount)} (${payout.commissionCount} items)`,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: language === 'bn' ? 'পে-আউট প্রক্রিয়াকরণে ব্যর্থ' : 'Failed to create payout',
        description: err.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !referrerId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-100 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#0DA54F] flex items-center justify-center shadow-2xs">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                {language === 'bn' ? 'কমিশন পে-আউট সেটেলমেন্ট' : 'Create Commission Payout'}
              </h2>
              <p className="text-xs text-slate-500">
                {referrer ? `${referrer.fullName} (${referrer.referrerCode})` : 'Loading...'}
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
          {/* Summary Box */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 grid grid-cols-3 gap-3">
            <div>
              <span className="text-[11px] font-semibold text-slate-600 block">
                {language === 'bn' ? 'মোট গ্রস কমিশন' : 'Gross Commission'}
              </span>
              <span className="text-base font-bold text-slate-900 mt-0.5 block tabular-nums">
                {formatBDT(grossAmount)}
              </span>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-600 block">
                {language === 'bn' ? 'উৎস কর কর্তন (AIT)' : 'Withholding Tax'}
              </span>
              <span className="text-base font-bold text-amber-700 mt-0.5 block tabular-nums">
                {formatBDT(withholdingAmount)}
              </span>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-emerald-800 block">
                {language === 'bn' ? 'পরিশোধযোগ্য নেট টাকা' : 'Net Payout'}
              </span>
              <span className="text-lg font-extrabold text-[#0DA54F] mt-0.5 block tabular-nums">
                {formatBDT(netPayoutAmount)}
              </span>
            </div>
          </div>

          {/* Commissions Checklist */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700">
                {language === 'bn' ? 'অনুমোদিত কমিশন তালিকা' : 'Approved Commissions to Settle'} ({eligibleCommissions.length})
              </span>
              {eligibleCommissions.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="text-[11px] font-semibold text-[#0DA54F] hover:underline"
                >
                  {selectedIds.size === eligibleCommissions.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>

            {eligibleCommissions.length === 0 ? (
              <div className="p-6 text-center rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
                {language === 'bn'
                  ? 'এই রেফারারের কোন অনুমোদিত অমীমাংসিত কমিশন পাওয়া যায়নি।'
                  : 'No approved commissions pending payout for this referrer.'}
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto divide-y divide-slate-100 text-xs">
                {eligibleCommissions.map((comm) => {
                  const isChecked = selectedIds.has(comm.id);
                  return (
                    <div
                      key={comm.id}
                      onClick={() => toggleSelect(comm.id)}
                      className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${
                        isChecked ? 'bg-emerald-50/40' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-[#0DA54F]" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300" />
                        )}
                        <div>
                          <span className="font-bold text-slate-800 font-mono">
                            {comm.commissionCode}
                          </span>
                          <span className="text-slate-400 mx-1.5">•</span>
                          <span className="text-slate-600">{comm.patientName}</span>
                          <span className="text-slate-400 text-[10px] ml-2">
                            ({comm.ruleName})
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-bold text-emerald-800 font-mono tabular-nums">
                          {formatBDT(comm.netAmount)}
                        </span>
                        {comm.withholdingAmount > 0 && (
                          <span className="text-[10px] text-slate-400 block tabular-nums">
                            Tax: {formatBDT(comm.withholdingAmount)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Payment Method & Reference */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {language === 'bn' ? 'পরিশোধের মাধ্যম' : 'Payout Method'} *
              </label>
              <select
                value={payoutMethod}
                onChange={(e) => setPayoutMethod(e.target.value as PayoutMethod)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
              >
                <option value="bank_transfer">Bank Transfer (ব্যাংক ট্রান্সফার)</option>
                <option value="bKash">bKash (বিকাশ)</option>
                <option value="Nagad">Nagad (নগদ)</option>
                <option value="cash">Cash (নগদ টাকা)</option>
                <option value="cheque">Cheque (চেক)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {language === 'bn' ? 'পেমেন্ট রেফারেন্স / TrxID' : 'Transaction Ref / Cheque No'} *
              </label>
              <input
                type="text"
                placeholder="e.g. TXN-89218491 or CHQ-00918"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
              />
            </div>
          </div>

          {/* Date & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {language === 'bn' ? 'পরিশোধের তারিখ' : 'Paid Date'} *
              </label>
              <input
                type="date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {language === 'bn' ? 'মন্তব্য (ঐচ্ছিক)' : 'Settlement Notes'}
              </label>
              <input
                type="text"
                placeholder="e.g. Month-end doctor commission batch"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
              />
            </div>
          </div>

          {/* Single Payout Guarantee Note */}
          <div className="p-3 rounded-lg bg-blue-50/70 border border-blue-200/60 flex items-start gap-2 text-[11px] text-blue-900">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>
              {language === 'bn'
                ? 'একক পে-আউট নিশ্চয়তা: এই কমিশনগুলো স্থায়ীভাবে এই পে-আউটের সাথে যুক্ত হবে এবং আর কখনো পুনরায় নিষ্পত্তি করা যাবে না।'
                : 'Single-Payout Guarantee: Selected commissions will be locked and settled permanently in ONE transaction.'}
            </span>
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
              disabled={isSubmitting || selectedIds.size === 0}
              className="px-5 py-2 text-xs font-semibold text-white bg-[#0DA54F] hover:bg-[#0b8a42] rounded-lg transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{language === 'bn' ? 'সেটেলমেন্ট হচ্ছে...' : 'Settling...'}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {language === 'bn'
                      ? `পে-আউট নিশ্চিত করুন (${formatBDT(netPayoutAmount)})`
                      : `Confirm Payout (${formatBDT(netPayoutAmount)})`}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
