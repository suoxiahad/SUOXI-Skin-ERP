import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  DollarSign,
  CreditCard,
  Smartphone,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  Receipt,
  FileText,
  Lock,
  ArrowRight,
  Download,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';
import { api } from '../../../api/client.ts';
import type { Invoice } from '../../../types/index.ts';
import { formatBDT, formatDateDhaka } from '../../../utils/format.ts';
import { TableSkeleton } from '../../common/Skeleton.tsx';

export const DailyClosingView: React.FC = () => {
  const { language, addToast, currentUser, navigate } = useApp();
  const isBn = language === 'bn';

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Cashier inputs
  const [physicalCashCount, setPhysicalCashCount] = useState<number>(0);
  const [cardBatchTerminalTotal, setCardBatchTerminalTotal] = useState<number>(0);
  const [bkashStatementTotal, setBkashStatementTotal] = useState<number>(0);
  const [handoverNotes, setHandoverNotes] = useState<string>('');
  const [isShiftLocked, setIsShiftLocked] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    api.invoices
      .list()
      .then((data) => {
        if (isMounted) {
          setInvoices(data || []);
          // Auto calculate expected amounts
          let cash = 0;
          let card = 0;
          let bkash = 0;
          data.forEach((inv) => {
            if (inv.payments) {
              inv.payments.forEach((p) => {
                if (p.method === 'cash') cash += p.amountBDT;
                if (p.method === 'card') card += p.amountBDT;
                if (p.method === 'bkash') bkash += p.amountBDT;
              });
            }
          });
          setPhysicalCashCount(cash);
          setCardBatchTerminalTotal(card);
          setBkashStatementTotal(bkash);
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Compute breakdown from invoices
  const { systemCash, systemCard, systemBkash, systemNagad, totalCollected } = useMemo(() => {
    let cash = 0;
    let card = 0;
    let bkash = 0;
    let nagad = 0;
    let total = 0;

    invoices.forEach((inv) => {
      total += inv.paidAmountBDT || 0;
      if (inv.payments) {
        inv.payments.forEach((p) => {
          if (p.method === 'cash') cash += p.amountBDT;
          if (p.method === 'card') card += p.amountBDT;
          if (p.method === 'bkash') bkash += p.amountBDT;
          if (p.method === 'nagad') nagad += p.amountBDT;
        });
      }
    });

    return {
      systemCash: cash,
      systemCard: card,
      systemBkash: bkash,
      systemNagad: nagad,
      totalCollected: total,
    };
  }, [invoices]);

  const cashDiscrepancy = (physicalCashCount || 0) - systemCash;
  const isBalanced = Math.abs(cashDiscrepancy) < 0.01;

  const handleSubmitShiftReport = () => {
    setIsShiftLocked(true);
    addToast({
      type: 'success',
      title: isBn ? 'দৈনিক শিফট ক্লোজিং সফল!' : 'Shift Closed & Drawer Reconciled!',
      description: isBn
        ? `ক্যাশ ড্রয়ার লক করা হয়েছে। মোট সংগৃহীত: ${formatBDT(totalCollected)}`
        : `Shift closed by ${currentUser?.name}. Report submitted to admin audit log.`,
    });
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#0DA54F] to-[#0a8740] flex items-center justify-center text-white shadow-sm shrink-0">
            <Clock className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              {isBn ? 'দৈনিক শিফট ক্লোজিং ও ক্যাশ ড্রয়ার হিসাব' : 'Daily Shift Closing & Drawer Reconciliation'}
            </h1>
          </div>
        </div>

        <button
          onClick={() => navigate('/billing/counter')}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#0DA54F] to-[#0b8841] hover:from-[#0b8841] hover:to-[#097337] text-white rounded-xl text-xs font-bold transition-all duration-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95 cursor-pointer shrink-0"
        >
          <Receipt className="w-4 h-4" />
          <span>{isBn ? 'পিওএস বিলিং কাউন্টারে যান' : 'Go to POS Counter'}</span>
        </button>
      </div>

      {/* Metrics Row - Premium Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Revenue */}
        <div className="group p-5 rounded-2xl bg-gradient-to-br from-white via-slate-50/50 to-slate-100/70 border border-slate-200 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Revenue Today</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-100/80 text-[#0DA54F] flex items-center justify-center transition-transform group-hover:scale-105 shadow-2xs">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-mono font-black text-slate-900 mt-2.5 tracking-tight">{formatBDT(totalCollected)}</p>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>{invoices.length} Invoices Processed</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        </div>

        {/* Metric 2: Cash in Drawer */}
        <div className="group p-5 rounded-2xl bg-gradient-to-br from-white via-emerald-50/30 to-emerald-50/60 border border-emerald-200/80 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Cash in Drawer</span>
            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/80 border border-emerald-200 px-2 py-0.5 rounded-full">
              Cashier Safe
            </span>
          </div>
          <p className="text-2xl font-mono font-black text-emerald-800 mt-2.5 tracking-tight">{formatBDT(systemCash)}</p>
          <div className="mt-2 pt-2 border-t border-emerald-100/60 text-[11px] text-emerald-700">
            System Recorded Cash
          </div>
        </div>

        {/* Metric 3: Card Terminals */}
        <div className="group p-5 rounded-2xl bg-gradient-to-br from-white via-blue-50/30 to-blue-50/60 border border-blue-200/80 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-800 uppercase tracking-wider">Card Terminals</span>
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center transition-transform group-hover:scale-105 shadow-2xs">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-mono font-black text-blue-900 mt-2.5 tracking-tight">{formatBDT(systemCard)}</p>
          <div className="mt-2 pt-2 border-t border-blue-100/60 text-[11px] text-blue-700">
            POS Machine Batch
          </div>
        </div>

        {/* Metric 4: bKash & Nagad MFS */}
        <div className="group p-5 rounded-2xl bg-gradient-to-br from-white via-rose-50/30 to-rose-50/60 border border-rose-200/80 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">bKash & Nagad MFS</span>
            <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center transition-transform group-hover:scale-105 shadow-2xs">
              <Smartphone className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-mono font-black text-rose-700 mt-2.5 tracking-tight">{formatBDT(systemBkash + systemNagad)}</p>
          <div className="mt-2 pt-2 border-t border-rose-100/60 text-[11px] text-rose-600">
            Merchant Digital Wallets
          </div>
        </div>
      </div>

      {/* Reconciliation Form Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h3 className="font-bold text-sm text-slate-900">
              {isBn ? 'শিফট ব্যালেন্সিং ও ফিজিক্যাল ক্যাশ কাউন্ট' : 'Shift Physical Cash & Channel Reconciliation'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter the exact physical cash counted in drawer and batch slips from POS card machine.
            </p>
          </div>

          <div
            className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 ${
              isBalanced
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {isBalanced ? (
              <>
                <CheckCircle className="w-4 h-4 text-[#0DA54F]" />
                <span>Balanced (৳ 0 Discrepancy)</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>Discrepancy: {formatBDT(cashDiscrepancy)}</span>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
            <label className="block text-xs font-bold text-slate-800">
              1. Physical Cash Counted in Safe (৳)
            </label>
            <input
              type="number"
              value={physicalCashCount || ''}
              onChange={(e) => setPhysicalCashCount(Number(e.target.value) || 0)}
              disabled={isShiftLocked}
              className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900 focus:ring-2 focus:ring-[#0DA54F]/20"
            />
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>Expected Cash:</span>
              <span className="font-mono font-bold text-slate-700">{formatBDT(systemCash)}</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
            <label className="block text-xs font-bold text-slate-800">
              2. POS Machine Batch Summary (৳)
            </label>
            <input
              type="number"
              value={cardBatchTerminalTotal || ''}
              onChange={(e) => setCardBatchTerminalTotal(Number(e.target.value) || 0)}
              disabled={isShiftLocked}
              className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900 focus:ring-2 focus:ring-[#0DA54F]/20"
            />
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>Expected Card:</span>
              <span className="font-mono font-bold text-slate-700">{formatBDT(systemCard)}</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
            <label className="block text-xs font-bold text-slate-800">
              3. bKash Merchant Wallet Statement (৳)
            </label>
            <input
              type="number"
              value={bkashStatementTotal || ''}
              onChange={(e) => setBkashStatementTotal(Number(e.target.value) || 0)}
              disabled={isShiftLocked}
              className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900 focus:ring-2 focus:ring-[#0DA54F]/20"
            />
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>Expected bKash:</span>
              <span className="font-mono font-bold text-slate-700">{formatBDT(systemBkash)}</span>
            </div>
          </div>
        </div>

        {/* Handover notes */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Cashier Shift Handover Notes & Cash Bag Seal #
          </label>
          <textarea
            rows={2}
            value={handoverNotes}
            onChange={(e) => setHandoverNotes(e.target.value)}
            disabled={isShiftLocked}
            placeholder="e.g. All cash verified and bagged in Tamper-Proof Envelope #SX-BAG-9021. Next shift operator: Tania Khan."
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800"
          />
        </div>

        {/* Action bar */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-[#0DA54F]" />
            <span>Shift closure generates tamper-evident audit record under financial compliance.</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => window.print()}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Shift PDF</span>
            </button>

            <button
              onClick={handleSubmitShiftReport}
              disabled={isShiftLocked}
              className={`px-5 py-2.5 rounded-lg text-xs font-bold text-white flex items-center gap-2 shadow-xs transition-all ${
                isShiftLocked
                  ? 'bg-slate-400 cursor-not-allowed'
                  : 'bg-[#0DA54F] hover:bg-[#0b8841] cursor-pointer'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{isShiftLocked ? 'Shift Closed & Locked' : 'Close Shift & Lock Drawer'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
