import React, { useState, useEffect } from 'react';
import {
  X,
  CreditCard,
  DollarSign,
  AlertCircle,
  ShieldAlert,
  Calendar,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { billingApi } from '../../api/billing.js';
import type {
  DbId,
  PaymentMethodDto,
  InvoiceDto,
  PaymentDto,
  RecordPaymentInput,
} from '@suoxi/shared-types';
import { useI18n } from '../../i18n/I18nContext.js';

interface RecordPaymentModalProps {
  patientId: string;
  patientName: string;
  preselectedInvoiceId?: string;
  onClose: () => void;
  onSuccess: (payment: PaymentDto) => void;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  patientId,
  patientName,
  preselectedInvoiceId,
  onClose,
  onSuccess,
}) => {
  const { lang } = useI18n();
  const isBn = lang === 'bn';

  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodDto[]>([]);
  const [openInvoices, setOpenInvoices] = useState<InvoiceDto[]>([]);

  // Form State
  const [selectedMethodId, setSelectedMethodId] = useState<DbId>('');
  const [amount, setAmount] = useState<string>('');
  const [transactionReference, setTransactionReference] = useState<string>('');
  const [isAdvance, setIsAdvance] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');
  const [allocations, setAllocations] = useState<Record<string, string>>({});

  useEffect(() => {
    async function loadInitial() {
      try {
        setLoading(true);
        setError(null);
        const [methods, invoices] = await Promise.all([
          billingApi.getPaymentMethods(),
          billingApi.listInvoices({ patientId }),
        ]);
        setPaymentMethods(methods);
        if (methods.length > 0) {
          const defaultMethod = methods.find((m) => m.code === 'CASH') || methods[0];
          setSelectedMethodId(defaultMethod.id);
        }

        const unpaid = invoices.filter(
          (inv) => inv.status !== 'void' && inv.status !== 'paid' && Number(inv.dueAmount) > 0
        );
        setOpenInvoices(unpaid);

        // If preselected invoice provided, pre-fill its due amount
        if (preselectedInvoiceId) {
          const target = unpaid.find((i) => i.id === preselectedInvoiceId);
          if (target) {
            setAmount(target.dueAmount);
            setAllocations({ [target.id]: target.dueAmount });
          }
        } else if (unpaid.length > 0) {
          setAmount(unpaid[0].dueAmount);
          setAllocations({ [unpaid[0].id]: unpaid[0].dueAmount });
        }
      } catch (err: any) {
        setError(err.message || 'Failed to initialize payment form');
      } finally {
        setLoading(false);
      }
    }
    loadInitial();
  }, [patientId, preselectedInvoiceId]);

  const selectedMethod = paymentMethods.find((m) => String(m.id) === String(selectedMethodId));

  const handleAllocationChange = (invId: string, val: string) => {
    setAllocations((prev) => ({
      ...prev,
      [invId]: val,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedMethodId) {
      setError(isBn ? 'অনুগ্রহ করে একটি পেমেন্ট মাধ্যম নির্বাচন করুন' : 'Please select a payment method');
      return;
    }

    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError(isBn ? 'অনুগ্রহ করে সঠিক পেমেন্টের পরিমাণ দিন' : 'Please enter a valid positive payment amount');
      return;
    }

    if (selectedMethod?.requiresReference && !transactionReference.trim()) {
      setError(
        isBn
          ? `${selectedMethod.name} এর জন্য ট্রানজ্যাকশন আইডি (TrxID) আবশ্যক`
          : `Transaction reference (TrxID) is required for ${selectedMethod.name}`
      );
      return;
    }

    // Build allocations list if not advance
    const allocList: { invoiceId: string; amount: string }[] = [];
    if (!isAdvance) {
      let sumAlloc = 0;
      for (const [invId, val] of Object.entries(allocations)) {
        const valNum = Number(val);
        if (valNum > 0) {
          allocList.push({ invoiceId: invId, amount: valNum.toFixed(2) });
          sumAlloc += valNum;
        }
      }

      if (sumAlloc > amountNum + 0.001) {
        setError(
          isBn
            ? `ইনভয়েস সমন্বয়ের যোগফল (৳ ${sumAlloc}) মোট পেমেন্টের (৳ ${amountNum}) চেয়ে বেশি হতে পারে না`
            : `Allocations sum (৳ ${sumAlloc.toLocaleString()}) cannot exceed payment amount (৳ ${amountNum.toLocaleString()})`
        );
        return;
      }
    }

    try {
      setSubmitting(true);
      const payload: RecordPaymentInput = {
        patientId,
        branchId: 'br-dhk-01',
        paymentMethodId: selectedMethodId,
        amount: amountNum.toFixed(2),
        transactionReference: transactionReference.trim() || undefined,
        notes: notes.trim() || undefined,
        isAdvance,
        allocations: isAdvance ? undefined : allocList,
      };

      const payment = await billingApi.recordPayment(payload);
      onSuccess(payment);
    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err.message || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-600" />
            <div>
              <h3 className="font-semibold text-slate-800">
                {isBn ? 'পেমেন্ট জমা নিন' : 'Record Patient Payment'}
              </h3>
              <p className="text-xs text-slate-500">{patientName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Warning Banner: Manual Staff Record */}
        <div className="bg-amber-50/80 border-b border-amber-200 px-6 py-2.5 flex items-center justify-between text-xs text-amber-800">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
            <span>
              {isBn
                ? 'স্টাফ রেকর্ড: কোনো অটোমেটেড গেটওয়ে ভেরিফিকেশন নেই। ব্যাংক/বিকাশ বিবরণী দেখে নিশ্চিত হন।'
                : 'Staff Recorded: Manual entry with no payment gateway check. Verify physical cash or bank/bKash statement.'}
            </span>
          </div>
          <span className="font-semibold uppercase tracking-wider text-[10px] bg-amber-200/60 px-2 py-0.5 rounded text-amber-900">
            Staff recorded
          </span>
        </div>

        {error && (
          <div className="m-6 mb-0 p-3 rounded-lg bg-rose-50 border border-rose-200 flex items-center gap-2 text-sm text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-emerald-600 border-t-transparent mb-2"></div>
            <p>Loading payment methods and open invoices...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
            {/* Payment Method Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                {isBn ? 'পেমেন্ট মাধ্যম' : 'Payment Method'}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {paymentMethods.map((m) => {
                  const isSelected = String(selectedMethodId) === String(m.id);
                  return (
                    <button
                      key={String(m.id)}
                      type="button"
                      onClick={() => setSelectedMethodId(m.id)}
                      className={`flex flex-col items-start p-3 rounded-xl border text-left transition ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <span className="text-sm font-semibold text-slate-800">{m.name}</span>
                      <span className="text-xs text-slate-500 font-bengali">{m.nameBn}</span>
                      {m.requiresReference && (
                        <span className="mt-1 text-[10px] font-mono font-medium text-emerald-700">
                          TrxID Req
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Amount & TrxID Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  {isBn ? 'পেমেন্ট পরিমাণ (৳)' : 'Amount (BDT ৳)'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 font-semibold">৳</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 4000"
                    className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-2 text-sm font-mono focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  {selectedMethod?.requiresReference ? (
                    <span className="text-slate-800">
                      TrxID / Reference <span className="text-rose-500">*</span>
                    </span>
                  ) : (
                    <span>Reference / Slip No (Optional)</span>
                  )}
                </label>
                <input
                  type="text"
                  required={selectedMethod?.requiresReference}
                  value={transactionReference}
                  onChange={(e) => setTransactionReference(e.target.value)}
                  placeholder={selectedMethod?.requiresReference ? 'e.g. 9KD73HX2' : 'Optional slip no'}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>

            {/* Advance Switch */}
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 border border-slate-200">
              <div>
                <span className="text-sm font-semibold text-slate-800">
                  {isBn ? 'অ্যাডভান্স পেমেন্ট' : 'Advance Payment'}
                </span>
                <p className="text-xs text-slate-500">
                  {isBn
                    ? 'কোনো নির্দিষ্ট ইনভয়েসে সমন্বয় না করে অগ্রিম ব্যালেন্স হিসেবে জমা থাকবে'
                    : 'Hold as unallocated advance credit on patient account for future treatments'}
                </p>
              </div>
              <input
                type="checkbox"
                checked={isAdvance}
                onChange={(e) => setIsAdvance(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
            </div>

            {/* Open Invoices Allocation Grid (if not advance) */}
            {!isAdvance && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    {isBn ? 'ইনভয়েস সমন্বয়' : 'Allocate Across Open Invoices'}
                  </label>
                  <span className="text-xs text-slate-500">
                    {openInvoices.length} open {openInvoices.length === 1 ? 'invoice' : 'invoices'}
                  </span>
                </div>

                {openInvoices.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-lg border border-slate-200">
                    No open invoices with due balance found. Payment will be treated as an advance credit.
                  </p>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-200">
                    {openInvoices.map((inv) => (
                      <div key={inv.id} className="p-3 flex items-center justify-between bg-white hover:bg-slate-50">
                        <div>
                          <p className="text-xs font-mono font-bold text-slate-900">{inv.invoiceNo}</p>
                          <p className="text-[11px] text-slate-500">
                            {inv.invoiceDate} • Total: ৳{Number(inv.totalAmount).toLocaleString()} • Due:
                            <span className="font-semibold text-rose-600 ml-1">
                              ৳{Number(inv.dueAmount).toLocaleString()}
                            </span>
                          </p>
                        </div>
                        <div className="w-32">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1.5 text-xs text-slate-400">৳</span>
                            <input
                              type="number"
                              step="0.01"
                              max={inv.dueAmount}
                              value={allocations[inv.id] || ''}
                              onChange={(e) => handleAllocationChange(inv.id, e.target.value)}
                              placeholder={inv.dueAmount}
                              className="w-full rounded-md border border-slate-300 pl-6 pr-2 py-1 text-xs font-mono text-right focus:border-emerald-500 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                {isBn ? 'মন্তব্য' : 'Payment Notes / Slip Details'}
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes or teller details..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            {/* Submit */}
            <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition"
              >
                {isBn ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition shadow-sm"
              >
                {submitting ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>{isBn ? 'জমা হচ্ছে...' : 'Recording...'}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{isBn ? 'পেমেন্ট সংরক্ষণ করুন' : 'Record Payment'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
