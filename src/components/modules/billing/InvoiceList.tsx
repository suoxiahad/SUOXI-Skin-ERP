import React, { useState, useEffect, useMemo } from 'react';
import {
  CreditCard,
  Plus,
  RefreshCw,
  Search,
  CheckCircle,
  AlertCircle,
  FileText,
  DollarSign,
  ShieldCheck,
  Ban,
  Receipt,
  Calendar,
  Filter,
  Printer,
  Eye,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';
import { api } from '../../../api/client.ts';
import type { Invoice, PaymentMethod } from '../../../types/index.ts';
import { formatBDT, formatDateDhaka, getStatusBadgeClass } from '../../../utils/format.ts';
import { TableSkeleton } from '../../common/Skeleton.tsx';
import { EmptyState } from '../../common/EmptyState.tsx';
import { ConfirmReasonModal } from '../../common/ConfirmReasonModal.tsx';
import { A4InvoiceModal } from './A4InvoiceModal.tsx';

type DateFilterPreset = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'all' | 'custom';

export const InvoiceList: React.FC = () => {
  const { addToast, language, branches } = useApp();
  const isBn = language === 'bn';

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Date Filter State - defaults to 'today' for Today Report
  const [datePreset, setDatePreset] = useState<DateFilterPreset>('today');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [selectedInvoiceForA4, setSelectedInvoiceForA4] = useState<Invoice | null>(null);

  // Modals
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('bkash');
  const [payRef, setPayRef] = useState('');
  const [isSubmittingPay, setIsSubmittingPay] = useState(false);

  const [voidingInvoiceId, setVoidingInvoiceId] = useState<string | null>(null);

  // New Invoice Modal
  const [isCreateInvoiceOpen, setIsCreateInvoiceOpen] = useState(false);
  const [newPatientId, setNewPatientId] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('HydraFacial Deluxe Session');
  const [newItemPrice, setNewItemPrice] = useState<number>(7500);

  const fetchInvoices = async () => {
    setIsLoading(true);
    try {
      const list = await api.invoices.list({
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });
      setInvoices(list);
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Failed to load invoices',
        description: (err as Error).message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [statusFilter]);

  const openPaymentModal = (inv: Invoice) => {
    setPaymentInvoice(inv);
    setPayAmount(inv.dueAmountBDT);
    setPayRef(`BKH-${Math.floor(100000 + Math.random() * 900000)}`);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentInvoice) return;

    if (payAmount <= 0) {
      addToast({ type: 'error', title: 'Invalid Amount', description: 'Payment must be greater than ৳ 0' });
      return;
    }

    if (payAmount > paymentInvoice.dueAmountBDT + 0.01) {
      addToast({
        type: 'error',
        title: 'Amount Exceeds Due',
        description: `Payment of ${formatBDT(payAmount)} exceeds remaining due of ${formatBDT(paymentInvoice.dueAmountBDT)}`,
      });
      return;
    }

    setIsSubmittingPay(true);
    try {
      // Hard Rule 4: Paid & due are derived on server from payment records
      const result = await api.invoices.recordPayment(paymentInvoice.id, {
        amountBDT: payAmount,
        method: payMethod,
        transactionRef: payRef,
      });

      setInvoices((prev) => prev.map((inv) => (inv.id === result.invoice.id ? result.invoice : inv)));

      addToast({
        type: 'success',
        title: 'Payment Recorded Successfully',
        description: `Receipt #${result.payment.receiptNumber} issued. Derived due: ${formatBDT(result.invoice.dueAmountBDT)}`,
      });
      setPaymentInvoice(null);
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Payment Failed',
        description: (err as Error).message,
      });
    } finally {
      setIsSubmittingPay(false);
    }
  };

  const handleVoidInvoice = async (reason: string) => {
    if (!voidingInvoiceId) return;
    try {
      // Hard Rule 3 & 6: Never hard delete, use void row with mandatory audit reason
      const voided = await api.invoices.voidInvoice(voidingInvoiceId, reason);
      setInvoices((prev) => prev.map((inv) => (inv.id === voided.id ? voided : inv)));
      addToast({
        type: 'success',
        title: 'Invoice Voided & Payments Reversed',
        description: `Invoice ${voided.invoiceNumber} voided. Audit event recorded.`,
      });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Failed to void invoice',
        description: (err as Error).message,
      });
    }
  };

  // Date Calculation Helpers (Dhaka timezone aware)
  const now = new Date();
  const todayDhakaStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(now);

  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  const yesterdayDhakaStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(yest);

  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 6);
  const weekAgoDhakaStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(weekAgo);

  const currentMonthPrefix = todayDhakaStr.slice(0, 7);

  // 1. Date Filtered Invoices (Acts as foundation for Today Report and date-filtered KPIs)
  const dateFilteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const invDateStr = (inv.createdAt || '').slice(0, 10);
      if (!invDateStr) return true;

      if (datePreset === 'today') {
        return invDateStr === todayDhakaStr;
      }
      if (datePreset === 'yesterday') {
        return invDateStr === yesterdayDhakaStr;
      }
      if (datePreset === 'this_week') {
        return invDateStr >= weekAgoDhakaStr && invDateStr <= todayDhakaStr;
      }
      if (datePreset === 'this_month') {
        return invDateStr.startsWith(currentMonthPrefix);
      }
      if (datePreset === 'custom') {
        if (customStartDate && invDateStr < customStartDate) return false;
        if (customEndDate && invDateStr > customEndDate) return false;
        return true;
      }
      // 'all'
      return true;
    });
  }, [invoices, datePreset, customStartDate, customEndDate, todayDhakaStr, yesterdayDhakaStr, weekAgoDhakaStr, currentMonthPrefix]);

  // 2. Search Filter applied on top of date-filtered set
  const displayedInvoices = useMemo(() => {
    return dateFilteredInvoices.filter((inv) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.patientName.toLowerCase().includes(q) ||
        (inv.branchName && inv.branchName.toLowerCase().includes(q))
      );
    });
  }, [dateFilteredInvoices, searchQuery]);

  // 3. Dynamic KPI calculations strictly derived from date-filtered invoices (Defaults to Today's Report)
  const totalBilledBDT = useMemo(() => {
    return dateFilteredInvoices.reduce((sum, i) => (i.status !== 'void' ? sum + i.totalAmountBDT : sum), 0);
  }, [dateFilteredInvoices]);

  const totalCollectedBDT = useMemo(() => {
    return dateFilteredInvoices.reduce((sum, i) => (i.status !== 'void' ? sum + i.paidAmountBDT : sum), 0);
  }, [dateFilteredInvoices]);

  const totalDueBDT = useMemo(() => {
    return dateFilteredInvoices.reduce((sum, i) => (i.status !== 'void' ? sum + i.dueAmountBDT : sum), 0);
  }, [dateFilteredInvoices]);

  // Context-aware KPI titles and badges
  const kpiLabels = useMemo(() => {
    switch (datePreset) {
      case 'today':
        return {
          badge: isBn ? `আজকের রিপোর্ট • ${todayDhakaStr}` : `Today's Report • ${todayDhakaStr}`,
          billed: isBn ? 'আজকের মোট বিল্ড রেভিনিউ' : "Today's Billed Revenue",
          collected: isBn ? 'আজকের মোট আদায় (পেইড)' : "Today's Collected (Paid)",
          due: isBn ? 'আজকের বকেয়া ডিউ' : "Today's Outstanding Dues",
          subBilled: isBn ? 'আজকের কার্যকর বিল' : "Excluding voided today",
          subCollected: isBn ? 'আজকের সংগৃহীত ক্যাশ/ব্যাংক' : "Validated today receipts",
          subDue: isBn ? 'আজকের অবশিষ্ট ডিউ' : "Derived receivables today",
        };
      case 'yesterday':
        return {
          badge: isBn ? `গতকালের রিপোর্ট • ${yesterdayDhakaStr}` : `Yesterday • ${yesterdayDhakaStr}`,
          billed: isBn ? 'গতকালের বিল্ড রেভিনিউ' : "Yesterday's Billed Revenue",
          collected: isBn ? 'গতকালের আদায় (পেইড)' : "Yesterday's Collected",
          due: isBn ? 'গতকালের বকেয়া ডিউ' : "Yesterday's Dues",
          subBilled: isBn ? 'গতকালের কার্যকর বিল' : "Excluding voided",
          subCollected: isBn ? 'গতকালের রসিদ' : "Validated receipts",
          subDue: isBn ? 'গতকালের ডিউ' : "Derived receivables",
        };
      case 'this_week':
        return {
          badge: isBn ? 'বিগত ৭ দিনের রিপোর্ট' : 'Past 7 Days Report',
          billed: isBn ? 'এই সপ্তাহের বিল্ড রেভিনিউ' : "This Week's Billed Revenue",
          collected: isBn ? 'এই সপ্তাহের আদায় (পেইড)' : "This Week's Collections",
          due: isBn ? 'এই সপ্তাহের বকেয়া ডিউ' : "This Week's Dues",
          subBilled: isBn ? 'চলতি ৭ দিনের মোট বিল' : "Invoices from last 7 days",
          subCollected: isBn ? 'চলতি ৭ দিনের আদায়' : "Receipts from last 7 days",
          subDue: isBn ? 'চলতি ৭ দিনের বকেয়া' : "Receivables this week",
        };
      case 'this_month':
        return {
          badge: isBn ? 'চলতি মাসের রিপোর্ট' : 'This Month Report',
          billed: isBn ? 'চলতি মাসের মোট বিল্ড রেভিনিউ' : "This Month's Billed Revenue",
          collected: isBn ? 'চলতি মাসের মোট আদায়' : "This Month's Collections",
          due: isBn ? 'চলতি মাসের বকেয়া ডিউ' : "This Month's Dues",
          subBilled: isBn ? 'চলতি মাসের মোট বিল' : "Month-to-date billing",
          subCollected: isBn ? 'চলতি মাসের মোট আদায়' : "Month-to-date receipts",
          subDue: isBn ? 'চলতি মাসের মোট বকেয়া' : "Month-to-date dues",
        };
      case 'custom':
        return {
          badge: isBn
            ? `কাস্টম রেঞ্জ: ${customStartDate || 'শুরু'} হতে ${customEndDate || 'শেষ'}`
            : `Custom: ${customStartDate || 'Start'} to ${customEndDate || 'End'}`,
          billed: isBn ? 'নির্বাচিত রেঞ্জের মোট বিল' : 'Period Billed Revenue',
          collected: isBn ? 'নির্বাচিত রেঞ্জের মোট আদায়' : 'Period Collections',
          due: isBn ? 'নির্বাচিত রেঞ্জের বকেয়া' : 'Period Outstanding Dues',
          subBilled: isBn ? 'নির্দিষ্ট সময়কালের বিল' : 'Selected range billing',
          subCollected: isBn ? 'নির্দিষ্ট সময়কালের আদায়' : 'Selected range receipts',
          subDue: isBn ? 'নির্দিষ্ট সময়কালের বকেয়া' : 'Selected range dues',
        };
      case 'all':
      default:
        return {
          badge: isBn ? 'সর্বকালীন হিসাব' : 'All-Time Financials',
          billed: isBn ? 'সর্বমোট বিল্ড রেভিনিউ' : 'Total Billed Revenue',
          collected: isBn ? 'সর্বমোট আদায় (পেইড)' : 'Total Collected (Paid)',
          due: isBn ? 'সর্বমোট বকেয়া ডিউ' : 'Total Outstanding Dues',
          subBilled: isBn ? 'সকল বৈধ ইনভয়েসের যোগফল' : 'Excluding voided invoices',
          subCollected: isBn ? 'সকল ভ্যালিডেটেড পেমেন্ট' : 'Validated receipts',
          subDue: isBn ? 'সকল বকেয়া প্রাপ্যের যোগফল' : 'Derived receivables',
        };
    }
  }, [datePreset, isBn, todayDhakaStr, yesterdayDhakaStr, customStartDate, customEndDate]);

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            {isBn ? 'বিলিং ও অ্যাকাউন্টস ডেস্ক' : 'Billing & Accounts Desk'}
          </h1>
        </div>

        <button
          onClick={fetchInvoices}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all duration-200 shadow-2xs hover:shadow-xs hover:-translate-y-0.5 active:scale-95 self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#0DA54F]' : 'text-slate-500'}`} />
          <span>{isBn ? 'রিফ্রেশ' : 'Refresh Invoices'}</span>
        </button>
      </div>

      {/* KPI Cards (Dynamic according to Date Filter - Today Report by default) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Billed Revenue */}
        <div className="group p-5 rounded-2xl bg-gradient-to-br from-white via-slate-50/50 to-slate-100/60 border border-slate-200/80 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-28 h-28 bg-[#0DA54F]/5 rounded-bl-full pointer-events-none transition-transform duration-500 group-hover:scale-110" />
          <div className="flex items-center justify-between gap-2 relative z-10">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">{kpiLabels.billed}</span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 group-hover:bg-[#0DA54F]/10 text-slate-700 group-hover:text-[#0DA54F] flex items-center justify-center transition-colors">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 mt-3 tabular-nums font-mono tracking-tight relative z-10">
            {formatBDT(totalBilledBDT)}
          </p>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100/80 text-[11px] text-slate-500 relative z-10">
            <span>{kpiLabels.subBilled}</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
              {kpiLabels.badge}
            </span>
          </div>
        </div>

        {/* Card 2: Collected (Paid) */}
        <div className="group p-5 rounded-2xl bg-gradient-to-br from-white via-emerald-50/30 to-emerald-50/60 border border-emerald-200/70 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-28 h-28 bg-[#0DA54F]/10 rounded-bl-full pointer-events-none transition-transform duration-500 group-hover:scale-110" />
          <div className="flex items-center justify-between gap-2 relative z-10">
            <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">{kpiLabels.collected}</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-[#0DA54F] flex items-center justify-center transition-transform duration-300 group-hover:scale-105 shadow-2xs">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-[#0DA54F] mt-3 tabular-nums font-mono tracking-tight relative z-10">
            {formatBDT(totalCollectedBDT)}
          </p>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-emerald-100/60 text-[11px] text-emerald-700 relative z-10">
            <span>{kpiLabels.subCollected}</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100/80 text-[#0DA54F] border border-emerald-200">
              {kpiLabels.badge}
            </span>
          </div>
        </div>

        {/* Card 3: Outstanding Dues */}
        <div className="group p-5 rounded-2xl bg-gradient-to-br from-white via-rose-50/30 to-rose-50/60 border border-rose-200/70 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-28 h-28 bg-rose-500/5 rounded-bl-full pointer-events-none transition-transform duration-500 group-hover:scale-110" />
          <div className="flex items-center justify-between gap-2 relative z-10">
            <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">{kpiLabels.due}</span>
            <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center transition-transform duration-300 group-hover:scale-105 shadow-2xs">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-rose-600 mt-3 tabular-nums font-mono tracking-tight relative z-10">
            {formatBDT(totalDueBDT)}
          </p>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-rose-100/60 text-[11px] text-rose-600 relative z-10">
            <span>{kpiLabels.subDue}</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100/80 text-rose-700 border border-rose-200">
              {kpiLabels.badge}
            </span>
          </div>
        </div>
      </div>

      {/* Date Filter & Status Filter Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-3 shadow-2xs">
        {/* Row 1: Date Presets */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mr-1">
              <Calendar className="w-3.5 h-3.5 text-[#0DA54F]" />
              <span>{isBn ? 'তারিখ ফিল্টার:' : 'Date Filter:'}</span>
            </span>

            {[
              { id: 'today', labelBn: 'আজকের রিপোর্ট', labelEn: "Today's Report" },
              { id: 'yesterday', labelBn: 'গতকাল', labelEn: 'Yesterday' },
              { id: 'this_week', labelBn: 'এই সপ্তাহ', labelEn: 'This Week' },
              { id: 'this_month', labelBn: 'এই মাস', labelEn: 'This Month' },
              { id: 'all', labelBn: 'সব সময়', labelEn: 'All Time' },
              { id: 'custom', labelBn: 'কাস্টম তারিখ', labelEn: 'Custom Date' },
            ].map((preset) => {
              const active = datePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => setDatePreset(preset.id as DateFilterPreset)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    active
                      ? 'bg-[#0DA54F] text-white shadow-2xs font-bold'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {isBn ? preset.labelBn : preset.labelEn}
                </button>
              );
            })}
          </div>

          <div className="text-xs text-slate-500 shrink-0">
            {isBn ? 'মোট ইনভয়েস: ' : 'Showing: '}
            <span className="font-bold text-slate-900 font-mono">{displayedInvoices.length}</span>
            <span className="text-slate-400 ml-1">
              ({datePreset === 'today' ? (isBn ? 'আজকের' : "Today's") : (isBn ? 'ফিল্টারকৃত' : 'Filtered')})
            </span>
          </div>
        </div>

        {/* Custom Date Range Picker inputs (when custom is selected) */}
        {datePreset === 'custom' && (
          <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex flex-wrap items-center gap-3 text-xs animate-in fade-in duration-150">
            <span className="font-semibold text-slate-700">{isBn ? 'তারিখ নির্বাচন:' : 'Select Range:'}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">{isBn ? 'হতে:' : 'From:'}</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded-md text-xs font-mono text-slate-800"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">{isBn ? 'পর্যন্ত:' : 'To:'}</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded-md text-xs font-mono text-slate-800"
              />
            </div>
            {(customStartDate || customEndDate) && (
              <button
                onClick={() => {
                  setCustomStartDate('');
                  setCustomEndDate('');
                }}
                className="text-[11px] text-rose-600 hover:text-rose-700 font-semibold cursor-pointer ml-2"
              >
                {isBn ? 'তারিখ রিসেট' : 'Reset Dates'}
              </button>
            )}
          </div>
        )}

        {/* Row 2: Status & Search Query */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">{isBn ? 'স্ট্যাটাস ফিল্টার:' : 'Status Filter:'}</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 cursor-pointer"
            >
              <option value="all">{isBn ? 'সকল স্ট্যাটাস' : 'All Status'}</option>
              <option value="unpaid">{isBn ? 'বকেয়া / আনপেইড' : 'Unpaid Only'}</option>
              <option value="partially_paid">{isBn ? 'আংশিক পরিশোধিত' : 'Partially Paid'}</option>
              <option value="paid">{isBn ? 'সম্পূর্ণ পরিশোধিত' : 'Fully Paid'}</option>
              <option value="void">{isBn ? 'বাতিলকৃত ইনভয়েস' : 'Voided Invoices'}</option>
            </select>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isBn ? 'ইনভয়েস নং বা রোগীর নাম খুঁজুন...' : 'Search invoice #, patient...'}
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#0DA54F] w-48 sm:w-64"
            />
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      {isLoading ? (
        <TableSkeleton rows={4} cols={7} />
      ) : displayedInvoices.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-3 shadow-2xs">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto text-[#0DA54F]">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">
              {isBn ? 'এই ফিল্টারে কোনো ইনভয়েস পাওয়া যায়নি' : 'No invoices found for this filter'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              {datePreset === 'today'
                ? isBn
                  ? 'আজকের তারিখে কোনো বিলিং রেকর্ড নেই। পূর্বের সকল ইনভয়েস দেখতে "সব সময়" চাপুন অথবা পিওএস কাউন্টার থেকে নতুন বিল করুন।'
                  : 'No invoices recorded yet today. Switch to "All Time" to view previous records or process a new bill at the POS Counter.'
                : isBn
                ? 'আপনার দেওয়া তারিখ বা সার্চ অনুযায়ী কোনো রেকর্ড মেলেনি।'
                : 'There are no billing records matching your filter criteria.'}
            </p>
          </div>
          {datePreset !== 'all' && (
            <button
              onClick={() => setDatePreset('all')}
              className="px-4 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-[#0DA54F] border border-emerald-200 rounded-lg text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <span>{isBn ? 'সকল ইনভয়েস দেখুন (All Time)' : 'View All Invoices (All Time)'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/90 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Patient</th>
                  <th className="py-3 px-4">Branch</th>
                  <th className="py-3 px-4 text-right">Total Amount</th>
                  <th className="py-3 px-4 text-right">Derived Paid</th>
                  <th className="py-3 px-4 text-right">Derived Due</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedInvoices.map((inv) => {
                  const badge = getStatusBadgeClass(inv.status);
                  return (
                    <tr key={inv.id} className="h-12 hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-4 font-mono font-semibold text-slate-900">
                        {inv.invoiceNumber}
                        <span className="block text-[10px] text-slate-400 font-normal">
                          {formatDateDhaka(inv.createdAt)}
                        </span>
                      </td>

                      <td className="py-2.5 px-4 font-semibold text-slate-800">
                        {inv.patientName}
                      </td>

                      <td className="py-2.5 px-4 text-slate-600 truncate max-w-[120px]">
                        {inv.branchName
                          ? inv.branchName.split(' ')[0]
                          : branches.find((b) => b.id === inv.branchId)?.name || inv.branchId || '—'}
                      </td>

                      <td className="py-2.5 px-4 text-right font-bold text-slate-900 tabular-nums">
                        {formatBDT(inv.totalAmountBDT)}
                      </td>

                      <td className="py-2.5 px-4 text-right font-semibold text-emerald-700 tabular-nums">
                        {formatBDT(inv.paidAmountBDT)}
                      </td>

                      <td className="py-2.5 px-4 text-right font-bold text-rose-700 tabular-nums">
                        {inv.dueAmountBDT > 0 ? formatBDT(inv.dueAmountBDT) : '—'}
                      </td>

                      <td className="py-2.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${badge.bg} ${badge.text} ${badge.border}`}
                        >
                          <span className="capitalize">{inv.status.replace('_', ' ')}</span>
                        </span>
                        {inv.voidReason && (
                          <span className="block text-[10px] text-slate-400 truncate max-w-[110px]">
                            {inv.voidReason}
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View & Print Official A4 Invoice */}
                          <button
                            onClick={() => setSelectedInvoiceForA4(inv)}
                            className="p-1.5 text-slate-500 hover:text-[#0DA54F] hover:bg-emerald-50 rounded-md transition-colors cursor-pointer"
                            title={isBn ? 'অফিসিয়াল A4 ইনভয়েস দেখুন ও প্রিন্ট করুন' : 'View & Print Official A4 Invoice'}
                          >
                            <FileText className="w-4 h-4" />
                          </button>

                          {inv.status !== 'paid' && inv.status !== 'void' && (
                            <button
                              onClick={() => openPaymentModal(inv)}
                              className="px-2.5 py-1 text-xs font-semibold text-white bg-[#0DA54F] hover:bg-[#0a8740] rounded-md transition-colors shadow-2xs cursor-pointer"
                            >
                              Collect Due
                            </button>
                          )}

                          {inv.status !== 'void' && (
                            <button
                              onClick={() => setVoidingInvoiceId(inv.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                              title="Void invoice with mandatory reason"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {paymentInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#0DA54F]" />
                <h3 className="font-bold text-slate-800 text-sm">
                  Record Payment Receipt ({paymentInvoice.invoiceNumber})
                </h3>
              </div>
              <button
                onClick={() => setPaymentInvoice(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="p-4 space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Patient:</span>
                  <span className="font-semibold text-slate-800">{paymentInvoice.patientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Invoice Total:</span>
                  <span className="font-semibold text-slate-800">{formatBDT(paymentInvoice.totalAmountBDT)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Previously Paid:</span>
                  <span className="font-semibold text-emerald-700">{formatBDT(paymentInvoice.paidAmountBDT)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1 font-bold text-rose-700">
                  <span>Current Outstanding Due:</span>
                  <span>{formatBDT(paymentInvoice.dueAmountBDT)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Payment Amount (৳ BDT) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="100"
                  min="1"
                  max={paymentInvoice.dueAmountBDT}
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                  className="w-full text-base font-bold text-slate-800 rounded-lg border border-slate-300 p-2 text-right focus:border-[#0DA54F]"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Remaining due after this payment will be: {formatBDT(Math.max(0, paymentInvoice.dueAmountBDT - payAmount))}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment Method</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2 bg-white font-medium"
                >
                  <option value="bkash">bKash Merchant Payment</option>
                  <option value="nagad">Nagad</option>
                  <option value="card">Credit / Debit Card (POS)</option>
                  <option value="cash">Cash (Dhaka Center Drawer)</option>
                  <option value="bank_transfer">Bank Transfer (EFT)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Transaction / Slip Reference
                </label>
                <input
                  type="text"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="e.g. TrxID / POS Auth Code"
                  className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPaymentInvoice(null)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPay}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-[#0DA54F] hover:bg-[#0a8740] rounded-lg transition-colors shadow-xs"
                >
                  {isSubmittingPay ? 'Processing...' : `Issue Receipt for ${formatBDT(payAmount)}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Void Invoice Reason Modal (Hard Rule 3 & 6) */}
      <ConfirmReasonModal
        isOpen={!!voidingInvoiceId}
        title="Void Invoice & Reverse Payments"
        description="Voiding an invoice marks all associated payments as reversed and leaves an audit trail. Financial records are never hard-deleted."
        confirmLabel="Void Invoice"
        onClose={() => setVoidingInvoiceId(null)}
        onConfirm={handleVoidInvoice}
      />

      {/* Official A4 Clinical Invoice Modal */}
      {selectedInvoiceForA4 && (
        <A4InvoiceModal
          invoice={selectedInvoiceForA4}
          onClose={() => setSelectedInvoiceForA4(null)}
        />
      )}
    </div>
  );
};
