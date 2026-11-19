import React, { useEffect, useState } from 'react';
import {
  CreditCard,
  Receipt,
  Package,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';
import type { PortalBillingSummaryDto } from '@suoxi/shared-types';
import { portalApi } from '../api/portalClient.js';
import { usePortalAuth } from '../context/PortalAuthContext.js';

export const PortalBillingView: React.FC = () => {
  const { language } = usePortalAuth();
  const [billing, setBilling] = useState<PortalBillingSummaryDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'invoices' | 'payments' | 'packages'>('invoices');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setIsLoading(true);
        const data = await portalApi.getBilling();
        if (mounted) setBilling(data);
      } catch (err: any) {
        if (mounted) setError(err.message || 'Failed to load billing history');
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-slate-800">
          {language === 'bn' ? 'বিলিং ও পেমেন্ট বিবরণী' : 'Billing & Payment Ledger'}
        </h2>
        <p className="text-xs text-slate-500">
          {language === 'bn'
            ? 'আপনার ইনভয়েস, পেমেন্ট রসিদ এবং সক্রিয় প্যাকেজের হিসাব'
            : 'Track your invoices, official receipts, and package validity balances'}
        </p>
      </div>

      {/* Summary Cards */}
      {billing && (
        <div className="grid grid-cols-3 gap-2.5">
          <div className="p-3 bg-white rounded-2xl border border-slate-100 shadow-2xs space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              {language === 'bn' ? 'মোট বিল' : 'Invoiced'}
            </span>
            <span className="text-sm font-extrabold text-slate-800">
              ৳ {billing.totalInvoiced.toLocaleString()}
            </span>
          </div>

          <div className="p-3 bg-white rounded-2xl border border-slate-100 shadow-2xs space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              {language === 'bn' ? 'মোট পরিশোধ' : 'Paid'}
            </span>
            <span className="text-sm font-extrabold text-emerald-700">
              ৳ {billing.totalPaid.toLocaleString()}
            </span>
          </div>

          <div
            className={`p-3 rounded-2xl border shadow-2xs space-y-1 ${
              billing.outstandingDue > 0
                ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                : 'bg-white border-slate-100'
            }`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              {language === 'bn' ? 'বকেয়া' : 'Due'}
            </span>
            <span
              className={`text-sm font-extrabold ${
                billing.outstandingDue > 0 ? 'text-amber-700' : 'text-slate-800'
              }`}
            >
              ৳ {billing.outstandingDue.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* Tabs (44px min touch target) */}
      <div className="flex bg-slate-200/70 p-1 rounded-xl">
        <button
          type="button"
          onClick={() => setActiveTab('invoices')}
          className={`flex-1 min-h-[44px] rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
            activeTab === 'invoices'
              ? 'bg-white text-emerald-800 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>{language === 'bn' ? 'ইনভয়েস' : 'Invoices'}</span>
          {billing && <span className="opacity-70">({billing.invoices.length})</span>}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('payments')}
          className={`flex-1 min-h-[44px] rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
            activeTab === 'payments'
              ? 'bg-white text-emerald-800 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>{language === 'bn' ? 'পেমেন্ট রসিদ' : 'Receipts'}</span>
          {billing && <span className="opacity-70">({billing.payments.length})</span>}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('packages')}
          className={`flex-1 min-h-[44px] rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
            activeTab === 'packages'
              ? 'bg-white text-emerald-800 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>{language === 'bn' ? 'প্যাকেজ' : 'Packages'}</span>
          {billing && <span className="opacity-70">({billing.packages.length})</span>}
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          <div className="h-28 bg-white rounded-2xl animate-pulse border border-slate-100" />
          <div className="h-28 bg-white rounded-2xl animate-pulse border border-slate-100" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Invoices List */}
      {!isLoading && !error && activeTab === 'invoices' && (
        <div className="space-y-3">
          {billing?.invoices.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-slate-100 text-slate-400 text-xs">
              {language === 'bn' ? 'কোনো ইনভয়েস পাওয়া যায়নি' : 'No invoices found'}
            </div>
          ) : (
            billing?.invoices.map((inv) => (
              <div
                key={inv.id}
                className="p-4 rounded-2xl bg-white border border-slate-100 shadow-2xs space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-800 text-xs">
                    {inv.invoiceNumber}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize border ${
                      inv.status === 'paid'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : inv.status === 'partial'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}
                  >
                    {inv.status}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-500 text-[11px]">
                  <span>{inv.date}</span>
                  <span className="font-extrabold text-slate-800 text-xs">
                    ৳ {inv.totalAmount.toLocaleString()}
                  </span>
                </div>
                {inv.dueAmount > 0 && (
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px]">
                    <span className="text-amber-800 font-medium">
                      {language === 'bn' ? 'বকেয়া পরিমাণ:' : 'Due balance:'}
                    </span>
                    <span className="font-bold text-amber-700">
                      ৳ {inv.dueAmount.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Payments List */}
      {!isLoading && !error && activeTab === 'payments' && (
        <div className="space-y-3">
          {billing?.payments.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-slate-100 text-slate-400 text-xs">
              {language === 'bn' ? 'কোনো পেমেন্ট রসিদ নেই' : 'No payment receipts found'}
            </div>
          ) : (
            billing?.payments.map((p) => (
              <div
                key={p.id}
                className="p-4 rounded-2xl bg-white border border-slate-100 shadow-2xs space-y-1 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-emerald-800 text-xs">
                    {p.receiptNumber}
                  </span>
                  <span className="font-extrabold text-emerald-700 text-sm">
                    ৳ {p.amount.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-500 text-[11px]">
                  <span>{p.date}</span>
                  <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] text-slate-600 font-medium">
                    {p.paymentMethod}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Packages List */}
      {!isLoading && !error && activeTab === 'packages' && (
        <div className="space-y-3">
          {billing?.packages.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-slate-100 text-slate-400 text-xs">
              {language === 'bn' ? 'কোনো প্যাকেজ নেই' : 'No packages enrolled'}
            </div>
          ) : (
            billing?.packages.map((pkg) => (
              <div
                key={pkg.id}
                className="p-4 rounded-2xl bg-white border border-slate-100 shadow-2xs space-y-3 text-xs"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800 text-xs">{pkg.packageName}</h4>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      pkg.isExpired
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}
                  >
                    {pkg.isExpired
                      ? language === 'bn'
                        ? 'মেয়াদোত্তীর্ণ'
                        : 'Expired'
                      : language === 'bn'
                      ? 'সক্রিয়'
                      : 'Active'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-slate-600 text-[11px]">
                  <div>
                    <span className="text-slate-400 block">{language === 'bn' ? 'মোট সেশন' : 'Total'}</span>
                    <span className="font-bold text-slate-800">{pkg.totalSessions}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">{language === 'bn' ? 'অবশিষ্ট সেশন' : 'Remaining'}</span>
                    <span className="font-bold text-emerald-700">{pkg.remainingSessions}</span>
                  </div>
                  <div className="col-span-2 pt-1 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-slate-400">{language === 'bn' ? 'মেয়াদ শেষ:' : 'Valid until:'}</span>
                    <span className="font-semibold text-slate-700">{pkg.validityEnd}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
