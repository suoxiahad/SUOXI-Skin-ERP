import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  Users,
  PhoneCall,
  Package,
  Share2,
  MessageSquare,
  Calendar,
  Filter,
  Download,
  FileSpreadsheet,
  FileText,
  RotateCcw,
  AlertCircle,
  Building2,
  DollarSign,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { reportsApi } from '../../../api/reports.js';
import type {
  ReportType,
  RevenueReportDto,
  DoctorActivityReportDto,
  FollowUpReportDto,
  InventoryReportDto,
  ReferralReportDto,
  SmsReportDto,
  ReportFilterParams,
} from '@suoxi/shared-types';
import { useI18n } from '../../../i18n/I18nContext.js';
import { useAuth } from '../../../context/AuthContext.js';
import { usePermissions } from '../../../hooks/usePermissions.js';
import { TableSkeleton } from '../../common/TableSkeleton.js';

// Brand colors
const BRAND_GREEN = '#0DA54F';
const ACCENT_PINK = '#F06E84';
const CHART_COLORS = ['#0DA54F', '#0284C7', '#8B5CF6', '#F59E0B', '#F06E84', '#10B981', '#6366F1'];

export const ReportsHubView: React.FC = () => {
  const { lang } = useI18n();
  const { user } = useAuth();
  const { has } = usePermissions();

  // Permission evaluation for cards
  const canViewRevenue = has('report.revenue.view') || user?.roles.includes('super_admin') || user?.roles.includes('admin_manager') || user?.roles.includes('cashier');
  const canViewClinical = has('report.clinical.view') || user?.roles.includes('super_admin') || user?.roles.includes('admin_manager') || user?.roles.includes('doctor');
  const canViewCallCenter = has('report.call_center.view') || user?.roles.includes('super_admin') || user?.roles.includes('admin_manager') || user?.roles.includes('call_center');
  const canViewInventory = has('report.inventory.view') || user?.roles.includes('super_admin') || user?.roles.includes('admin_manager') || user?.roles.includes('inventory_manager');
  const canViewReferral = has('report.referral.view') || user?.roles.includes('super_admin') || user?.roles.includes('admin_manager') || user?.roles.includes('cashier');
  const canViewSms = has('report.notifications.view') || user?.roles.includes('super_admin') || user?.roles.includes('admin_manager');
  const canExport = has('export.run') || user?.roles.includes('super_admin') || user?.roles.includes('admin_manager');

  // Determine available tabs
  const availableTabs = useMemo(() => {
    const list: Array<{ id: ReportType; label: string; labelBn: string; icon: any }> = [];
    if (canViewRevenue) list.push({ id: 'revenue', label: 'Revenue & Sales', labelBn: 'আয় ও বিক্রয় প্রতিবেদন', icon: TrendingUp });
    if (canViewClinical) list.push({ id: 'doctor_activity', label: 'Doctor Activity', labelBn: 'ডাক্তার কার্যক্রম', icon: Users });
    if (canViewCallCenter) list.push({ id: 'follow_up', label: 'Follow-ups & Calls', labelBn: 'ফলো-আপ ও কল রিপোর্ট', icon: PhoneCall });
    if (canViewInventory) list.push({ id: 'inventory', label: 'Inventory & Usage', labelBn: 'ইনভেন্টরি ও ব্যবহার', icon: Package });
    if (canViewReferral) list.push({ id: 'referral', label: 'Referrals & Commissions', labelBn: 'রেফারাল ও কমিশন', icon: Share2 });
    if (canViewSms) list.push({ id: 'sms', label: 'SMS & Reminders', labelBn: 'এসএমএস ও বার্তা রিপোর্ট', icon: MessageSquare });
    return list;
  }, [canViewRevenue, canViewClinical, canViewCallCenter, canViewInventory, canViewReferral, canViewSms]);

  // Selected active report tab
  const [activeTab, setActiveTab] = useState<ReportType>('revenue');

  // Ensure active tab aligns with permissions
  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.some((t) => t.id === activeTab)) {
      setActiveTab(availableTabs[0].id);
    }
  }, [availableTabs, activeTab]);

  // Date range state (Default: last 30 days)
  const defaultTo = new Date().toISOString().slice(0, 10);
  const defaultFrom = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState<string>(defaultFrom);
  const [toDate, setToDate] = useState<string>(defaultTo);
  const [dateRangeError, setDateRangeError] = useState<string | null>(null);

  // Filters state
  const [branchId, setBranchId] = useState<string>('all');
  const [doctorId, setDoctorId] = useState<string>('all');
  const [serviceId, setServiceId] = useState<string>('all');
  const [paymentMethod, setPaymentMethod] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Data states
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [revenueData, setRevenueData] = useState<RevenueReportDto | null>(null);
  const [doctorData, setDoctorData] = useState<DoctorActivityReportDto | null>(null);
  const [followUpData, setFollowUpData] = useState<FollowUpReportDto | null>(null);
  const [inventoryData, setInventoryData] = useState<InventoryReportDto | null>(null);
  const [referralData, setReferralData] = useState<ReferralReportDto | null>(null);
  const [smsData, setSmsData] = useState<SmsReportDto | null>(null);

  // Export action state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Validate date range (< 90 days limit)
  const validateDates = (start: string, end: string): boolean => {
    if (!start || !end) {
      setDateRangeError(lang === 'bn' ? 'তারিখ নির্বাচন আবশ্যক' : 'Date range is required');
      return false;
    }
    const d1 = new Date(start);
    const d2 = new Date(end);
    if (d1 > d2) {
      setDateRangeError(lang === 'bn' ? 'শুরুর তারিখ শেষের তারিখের চেয়ে আগের হতে হবে' : '"From" date cannot be after "To" date');
      return false;
    }
    const diffDays = Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 90) {
      setDateRangeError(lang === 'bn' ? 'তারিখের পরিসীমা সর্বোচ্চ ৯০ দিন হতে পারবে' : 'Date range exceeds maximum 90-day window');
      return false;
    }
    setDateRangeError(null);
    return true;
  };

  // Preset date selector helpers
  const applyPreset = (days: number) => {
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10);
    setFromDate(start);
    setToDate(end);
    setDateRangeError(null);
    setCurrentPage(1);
  };

  const applyThisMonth = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const end = now.toISOString().slice(0, 10);
    setFromDate(start);
    setToDate(end);
    setDateRangeError(null);
    setCurrentPage(1);
  };

  // Fetch report data
  const fetchReport = useCallback(async () => {
    if (!validateDates(fromDate, toDate)) return;
    if (availableTabs.length === 0) return;

    setLoading(true);
    setError(null);

    const params: ReportFilterParams = {
      from: fromDate,
      to: toDate,
      branchId: branchId === 'all' ? undefined : branchId,
      doctorId: doctorId === 'all' ? undefined : doctorId,
      serviceId: serviceId === 'all' ? undefined : serviceId,
      paymentMethod: paymentMethod === 'all' ? undefined : paymentMethod,
      page: currentPage,
      limit: 15,
    };

    try {
      switch (activeTab) {
        case 'revenue': {
          const res = await reportsApi.getRevenueReport(params);
          setRevenueData(res);
          break;
        }
        case 'doctor_activity': {
          const res = await reportsApi.getDoctorActivityReport(params);
          setDoctorData(res);
          break;
        }
        case 'follow_up': {
          const res = await reportsApi.getFollowUpReport(params);
          setFollowUpData(res);
          break;
        }
        case 'inventory': {
          const res = await reportsApi.getInventoryReport(params);
          setInventoryData(res);
          break;
        }
        case 'referral': {
          const res = await reportsApi.getReferralReport(params);
          setReferralData(res);
          break;
        }
        case 'sms': {
          const res = await reportsApi.getSmsReport(params);
          setSmsData(res);
          break;
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load report data from server');
    } finally {
      setLoading(false);
    }
  }, [activeTab, fromDate, toDate, branchId, doctorId, serviceId, paymentMethod, currentPage, availableTabs.length]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Export CSV handler
  const handleExportCsv = async () => {
    if (!canExport) return;
    setIsExporting(true);
    try {
      const res = await reportsApi.exportReport({
        reportType: activeTab,
        format: 'csv',
        from: fromDate,
        to: toDate,
        branchId: branchId === 'all' ? undefined : branchId,
        doctorId: doctorId === 'all' ? undefined : doctorId,
        serviceId: serviceId === 'all' ? undefined : serviceId,
        paymentMethod: paymentMethod === 'all' ? undefined : paymentMethod,
      });

      // Browser download trigger
      const blob = new Blob([res.content], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', res.fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportNotice(
        lang === 'bn'
          ? `সফলভাবে এক্সপোর্ট সম্পন্ন হয়েছে: ${res.fileName} (${res.rowCount} টি রেকর্ড)`
          : `Export completed: ${res.fileName} (${res.rowCount} records logged)`
      );
      setTimeout(() => setExportNotice(null), 5000);
    } catch (err: any) {
      alert(err?.message || 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  // Format currency in BDT ৳
  const formatBdt = (val: number): string => {
    return `৳ ${Number(val || 0).toLocaleString('en-IN')}`;
  };

  if (availableTabs.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-4" />
        <h3 className="text-base font-bold text-slate-800">
          {lang === 'bn' ? 'প্রতিবেদন অ্যাক্সেস সীমাবদ্ধ' : 'Reports Access Restricted'}
        </h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto mt-2">
          {lang === 'bn'
            ? 'আপনার প্রোফাইলে কোনো রিপোর্ট দেখার অনুমতি বরাদ্দ নেই। অনুমোদনের জন্য অ্যাডমিন বা সুপার অ্যাডমিনের সাথে যোগাযোগ করুন।'
            : 'You do not have functional permissions to view operational or financial reports. Please contact your branch administrator.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              {lang === 'bn' ? 'অ্যানালিটিক্স ও রিপোর্টস হাব' : 'Reports & Analytics Hub'}
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
              SQL Engine
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {lang === 'bn'
              ? 'ক্লিনিক্যাল, আর্থিক ও অপারেশনাল ইন্টেলিজেন্স (সার্ভার-সাইড অ্যাগ্রিগেশন ও ফিল্টারিং)'
              : 'Direct SQL business intelligence with server-side aggregation, 90-day window limits, and audit tracking'}
          </p>
        </div>

        {/* Export Button (Strictly permission gated: export.run) */}
        {canExport && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              disabled={isExporting || loading || !!dateRangeError}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-emerald-700 hover:border-emerald-200 transition-colors shadow-sm disabled:opacity-50"
              title="Export filtered data to CSV with formula-injection neutralization"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>{isExporting ? (lang === 'bn' ? 'এক্সপোর্ট হচ্ছে...' : 'Exporting...') : (lang === 'bn' ? 'এক্সপোর্ট CSV' : 'Export CSV')}</span>
            </button>
          </div>
        )}
      </div>

      {/* Export Toast / Notice */}
      {exportNotice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{exportNotice}</span>
          </div>
          <button onClick={() => setExportNotice(null)} className="text-emerald-700 hover:text-emerald-900 font-bold ml-4">
            ✕
          </button>
        </div>
      )}

      {/* Permission-gated Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-200 scrollbar-none">
        {availableTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setCurrentPage(1);
              }}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-slate-200'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
              <span>{lang === 'bn' ? tab.labelBn : tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Filter Toolbar & Date Range Controls */}
      <div className="bg-white/80 backdrop-blur-md rounded-xl p-4 border border-slate-200/90 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Quick Date Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">
              {lang === 'bn' ? 'কুইক ফিল্টার:' : 'Quick Range:'}
            </span>
            <button
              onClick={() => applyPreset(0)}
              className="px-2.5 py-1 rounded text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
            >
              {lang === 'bn' ? 'আজ' : 'Today'}
            </button>
            <button
              onClick={() => applyPreset(1)}
              className="px-2.5 py-1 rounded text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
            >
              {lang === 'bn' ? 'গতকাল' : 'Yesterday'}
            </button>
            <button
              onClick={() => applyPreset(7)}
              className="px-2.5 py-1 rounded text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
            >
              {lang === 'bn' ? 'গত ৭ দিন' : 'Last 7 Days'}
            </button>
            <button
              onClick={() => applyPreset(30)}
              className="px-2.5 py-1 rounded text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
            >
              {lang === 'bn' ? 'গত ৩০ দিন' : 'Last 30 Days'}
            </button>
            <button
              onClick={applyThisMonth}
              className="px-2.5 py-1 rounded text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
            >
              {lang === 'bn' ? 'চলতি মাস' : 'This Month'}
            </button>
            <button
              onClick={() => applyPreset(90)}
              className="px-2.5 py-1 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition"
            >
              {lang === 'bn' ? 'সর্বোচ্চ ৯০ দিন' : 'Max 90 Days'}
            </button>
          </div>

          {/* Refresh action */}
          <button
            onClick={() => fetchReport()}
            disabled={loading}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
            title="Refresh Report"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
        </div>

        {/* Date Inputs & Dropdown Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 pt-2 border-t border-slate-100 text-xs">
          {/* From Date */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              {lang === 'bn' ? 'হতে (From):' : 'From Date:'}
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                validateDates(e.target.value, toDate);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
            />
          </div>

          {/* To Date */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              {lang === 'bn' ? 'পর্যন্ত (To):' : 'To Date:'}
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                validateDates(fromDate, e.target.value);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
            />
          </div>

          {/* Branch Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              {lang === 'bn' ? 'ক্লিনিক শাখা:' : 'Branch:'}
            </label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
            >
              <option value="all">{lang === 'bn' ? 'সকল শাখা (All Branches)' : 'All Branches'}</option>
              <option value="SKC-01">Dhanmondi Main Clinic (ধানমন্ডি শাখা)</option>
              <option value="SKC-02">Gulshan Aesthetic Suite (গুলশান শাখা)</option>
            </select>
          </div>

          {/* Tab Specific Filter (Doctor / Method) */}
          {activeTab === 'revenue' && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                {lang === 'bn' ? 'পেমেন্ট মাধ্যম:' : 'Payment Method:'}
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
              >
                <option value="all">{lang === 'bn' ? 'সকল মাধ্যম (All)' : 'All Methods'}</option>
                <option value="CASH">Cash (কাউন্টার নগদ)</option>
                <option value="BKASH">bKash (বিকাশ মার্চেন্ট)</option>
                <option value="NAGAD">Nagad (নগদ)</option>
                <option value="CARD">POS Card Terminal</option>
                <option value="BANK">Bank Transfer</option>
              </select>
            </div>
          )}

          {(activeTab === 'revenue' || activeTab === 'doctor_activity') && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                {lang === 'bn' ? 'বিশেষজ্ঞ চিকিৎসক:' : 'Doctor:'}
              </label>
              <select
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
              >
                <option value="all">{lang === 'bn' ? 'সকল চিকিৎসক (All Doctors)' : 'All Doctors'}</option>
                <option value="doc-01">Dr. Sabrina Karim, MBBS, DDV</option>
                <option value="doc-02">Dr. Tanvir Ahmed, MBBS, FCPS</option>
              </select>
            </div>
          )}
        </div>

        {/* Date Validation Error Warning */}
        {dateRangeError && (
          <div className="flex items-center gap-1.5 text-xs text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{dateRangeError}</span>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="h-64 bg-slate-100 rounded-xl animate-pulse mt-4" />
          <TableSkeleton cols={6} rows={6} />
        </div>
      ) : error ? (
        <div className="bg-white rounded-xl border border-rose-200 p-8 text-center text-rose-600 space-y-3">
          <AlertCircle className="w-8 h-8 mx-auto text-rose-500" />
          <p className="text-sm font-semibold">{error}</p>
          <button
            onClick={() => fetchReport()}
            className="px-4 py-2 bg-rose-600 text-white rounded-lg text-xs font-semibold hover:bg-rose-700 transition"
          >
            {lang === 'bn' ? 'পুনরায় চেষ্টা করুন' : 'Retry'}
          </button>
        </div>
      ) : (
        <>
          {/* TAB 1: REVENUE & SALES */}
          {activeTab === 'revenue' && revenueData && (
            <div className="space-y-6">
              {/* Summary KPI Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    {lang === 'bn' ? 'মোট আয় (Gross)' : 'Total Gross'}
                  </div>
                  <div className="text-lg font-bold text-slate-900 mt-1 tabular-nums">
                    {formatBdt(revenueData.kpi.totalRevenue)}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    {lang === 'bn' ? 'কালেকশন (Cash In)' : 'Collections'}
                  </div>
                  <div className="text-lg font-bold text-emerald-600 mt-1 tabular-nums">
                    {formatBdt(revenueData.kpi.collections)}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    {lang === 'bn' ? 'প্যাকেজ বিক্রয়' : 'Package Sales'}
                  </div>
                  <div className="text-lg font-bold text-blue-600 mt-1 tabular-nums">
                    {formatBdt(revenueData.kpi.packageSales)}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    {lang === 'bn' ? 'দৈনিক গড় আয়' : 'Daily Average'}
                  </div>
                  <div className="text-lg font-bold text-slate-800 mt-1 tabular-nums">
                    {formatBdt(revenueData.kpi.dailyAverage)}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    {lang === 'bn' ? 'মোট বকেয়া (Dues)' : 'Outstanding Dues'}
                  </div>
                  <div className="text-lg font-bold text-amber-600 mt-1 tabular-nums">
                    {formatBdt(revenueData.kpi.dues)}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    {lang === 'bn' ? 'ডিসকাউন্ট' : 'Discounts'}
                  </div>
                  <div className="text-lg font-bold text-slate-700 mt-1 tabular-nums">
                    {formatBdt(revenueData.kpi.discounts)}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    {lang === 'bn' ? 'রিফান্ড (Refunds)' : 'Refunds'}
                  </div>
                  <div className="text-lg font-bold text-rose-600 mt-1 tabular-nums">
                    {formatBdt(revenueData.kpi.refunds)}
                  </div>
                </div>
              </div>

              {/* Charts Row: Bar Chart (Treatments), Line Chart (Daily Trend), Donut (Payment Methods) */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 1. Bar Chart: Revenue by Treatment */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4">
                    {lang === 'bn' ? 'ট্রিটমেন্টভিত্তিক আয় (Top Treatments)' : 'Revenue by Treatment'}
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revenueData.treatmentWise.slice(0, 5)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tickFormatter={(v: number) => `৳${v / 1000}k`} tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="serviceName" width={110} tick={{ fontSize: 9 }} />
                        <Tooltip formatter={(value: any) => [formatBdt(Number(value)), 'Revenue']} />
                        <Bar dataKey="revenue" fill={BRAND_GREEN} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 2. Line Chart: Daily Collections vs Net */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4">
                    {lang === 'bn' ? 'দৈনিক কালেকশন ট্রেন্ড (Daily Collections)' : 'Daily Collections Trend'}
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={revenueData.dailyRevenue.slice(-14)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 10 }} />
                        <YAxis tickFormatter={(v: number) => `৳${v / 1000}k`} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(value: any) => [formatBdt(Number(value)), 'Amount']} />
                        <Line type="monotone" dataKey="collections" stroke={BRAND_GREEN} strokeWidth={2} dot={{ r: 3 }} />
                        <Line type="monotone" dataKey="refunds" stroke={ACCENT_PINK} strokeWidth={2} strokeDasharray="3 3" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 3. Donut Chart: Payment Methods Breakdown */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4">
                    {lang === 'bn' ? 'পেমেন্ট মাধ্যম অনুপাত (Payment Methods)' : 'Payment Methods Distribution'}
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={revenueData.paymentMethods}
                          dataKey="amount"
                          nameKey="label"
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={3}
                        >
                          {revenueData.paymentMethods.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: any) => [formatBdt(Number(value)), 'Total Collected']} />
                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Data Table: Detailed Invoices */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    {lang === 'bn' ? 'ইনভয়েস ও কালেকশন বিবরণী' : 'Invoice & Collection Ledger'}
                  </h3>
                  <span className="text-xs text-slate-500">
                    {revenueData.pagination.total} {lang === 'bn' ? 'টি এন্ট্রি' : 'records'}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-bold uppercase text-[11px]">
                        <th className="py-3 px-4">{lang === 'bn' ? 'তারিখ' : 'Date'}</th>
                        <th className="py-3 px-4">{lang === 'bn' ? 'ইনভয়েস নং' : 'Invoice No'}</th>
                        <th className="py-3 px-4">{lang === 'bn' ? 'রোগী' : 'Patient'}</th>
                        <th className="py-3 px-4">{lang === 'bn' ? 'ট্রিটমেন্ট' : 'Service'}</th>
                        <th className="py-3 px-4 text-right">{lang === 'bn' ? 'মোট বিল' : 'Gross'}</th>
                        <th className="py-3 px-4 text-right">{lang === 'bn' ? 'ডিসকাউন্ট' : 'Discount'}</th>
                        <th className="py-3 px-4 text-right">{lang === 'bn' ? 'পরিশোধিত' : 'Paid'}</th>
                        <th className="py-3 px-4 text-right">{lang === 'bn' ? 'বকেয়া' : 'Due'}</th>
                        <th className="py-3 px-4">{lang === 'bn' ? 'পদ্ধতি' : 'Method'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {revenueData.table.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors h-12">
                          <td className="py-2.5 px-4 whitespace-nowrap text-slate-600 font-mono">{row.date}</td>
                          <td className="py-2.5 px-4 whitespace-nowrap font-bold text-slate-900">{row.invoiceNumber}</td>
                          <td className="py-2.5 px-4">
                            <div className="font-semibold text-slate-800">{row.patientName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{row.patientCode}</div>
                          </td>
                          <td className="py-2.5 px-4 text-slate-700 max-w-xs truncate">{row.serviceName}</td>
                          <td className="py-2.5 px-4 text-right font-semibold text-slate-900 tabular-nums">{formatBdt(row.grossAmount)}</td>
                          <td className="py-2.5 px-4 text-right text-slate-500 tabular-nums">{formatBdt(row.discountAmount)}</td>
                          <td className="py-2.5 px-4 text-right font-bold text-emerald-600 tabular-nums">{formatBdt(row.paidAmount)}</td>
                          <td className="py-2.5 px-4 text-right font-bold text-amber-600 tabular-nums">{formatBdt(row.dueAmount)}</td>
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                              {row.paymentMethod}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {revenueData.pagination.totalPages > 1 && (
                  <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                    <div>
                      {lang === 'bn'
                        ? `পৃষ্ঠা ${currentPage} / ${revenueData.pagination.totalPages}`
                        : `Page ${currentPage} of ${revenueData.pagination.totalPages}`}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage <= 1}
                        className="px-2.5 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setCurrentPage((p) => Math.min(revenueData.pagination.totalPages, p + 1))}
                        disabled={currentPage >= revenueData.pagination.totalPages}
                        className="px-2.5 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: DOCTOR ACTIVITY */}
          {activeTab === 'doctor_activity' && doctorData && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{lang === 'bn' ? 'মোট অ্যাপয়েন্টমেন্ট' : 'Total Bookings'}</div>
                  <div className="text-lg font-bold text-slate-900 mt-1 tabular-nums">{doctorData.kpi.totalAppointments}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{lang === 'bn' ? 'সম্পন্ন কনসালটেশন' : 'Consultations'}</div>
                  <div className="text-lg font-bold text-emerald-600 mt-1 tabular-nums">{doctorData.kpi.completedConsultations}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{lang === 'bn' ? 'ট্রিটমেন্ট সেশন' : 'Sessions'}</div>
                  <div className="text-lg font-bold text-blue-600 mt-1 tabular-nums">{doctorData.kpi.treatmentSessions}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{lang === 'bn' ? 'নো-শো হার (No-Show)' : 'No-Show Rate'}</div>
                  <div className="text-lg font-bold text-rose-600 mt-1 tabular-nums">{doctorData.kpi.noShowRate}%</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{lang === 'bn' ? 'ডাক্তারভিত্তিক মোট আয়' : 'Doctor Revenue'}</div>
                  <div className="text-lg font-bold text-purple-700 mt-1 tabular-nums">{formatBdt(doctorData.kpi.totalDoctorRevenue)}</div>
                </div>
              </div>

              {/* Chart */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4">
                  {lang === 'bn' ? 'ডাক্তারদের অ্যাপয়েন্টমেন্ট বনাম সমাপ্তি' : 'Doctor Workload & Completion'}
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={doctorData.doctorPerformance}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="doctorName" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: '10px' }} />
                      <Bar dataKey="appointmentCount" name="Appointments" fill="#0284C7" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="completedCount" name="Completed" fill={BRAND_GREEN} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="noShowCount" name="No-Shows" fill={ACCENT_PINK} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 font-bold text-xs uppercase text-slate-800">
                  {lang === 'bn' ? 'ডাক্তার অ্যাপয়েন্টমেন্ট ও কনসালটেশন লগ' : 'Doctor Appointments & Consultation Log'}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase text-[11px]">
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Doctor</th>
                        <th className="py-3 px-4">Patient</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Service</th>
                        <th className="py-3 px-4 text-right">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {doctorData.table.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 h-12">
                          <td className="py-2.5 px-4 font-mono text-slate-600">{row.date}</td>
                          <td className="py-2.5 px-4 font-bold text-slate-900">{row.doctorName}</td>
                          <td className="py-2.5 px-4 font-semibold text-slate-800">{row.patientName}</td>
                          <td className="py-2.5 px-4 capitalize font-medium text-slate-600">{row.type}</td>
                          <td className="py-2.5 px-4 uppercase font-semibold text-emerald-700">{row.status}</td>
                          <td className="py-2.5 px-4 text-slate-600">{row.serviceName}</td>
                          <td className="py-2.5 px-4 text-right font-bold tabular-nums text-slate-900">{formatBdt(row.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: FOLLOW-UP REPORT */}
          {activeTab === 'follow_up' && followUpData && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{lang === 'bn' ? 'মোট কল টাস্ক' : 'Total Call Tasks'}</div>
                  <div className="text-lg font-bold text-slate-900 mt-1 tabular-nums">{followUpData.kpi.totalTasks}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{lang === 'bn' ? 'সম্পন্ন কল' : 'Completed Calls'}</div>
                  <div className="text-lg font-bold text-emerald-600 mt-1 tabular-nums">{followUpData.kpi.completedTasks}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{lang === 'bn' ? 'পুনঃনির্ধারণ (Rescheduled)' : 'Rescheduled'}</div>
                  <div className="text-lg font-bold text-amber-600 mt-1 tabular-nums">{followUpData.kpi.rescheduledAppointments}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{lang === 'bn' ? 'যোগাযোগহীন (Unreachable)' : 'Unreachable'}</div>
                  <div className="text-lg font-bold text-rose-600 mt-1 tabular-nums">{followUpData.kpi.unreachableTasks}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{lang === 'bn' ? 'সফলতার হার' : 'Conversion Rate'}</div>
                  <div className="text-lg font-bold text-blue-600 mt-1 tabular-nums">{followUpData.kpi.conversionRate}%</div>
                </div>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4">
                    {lang === 'bn' ? 'কল ফলাফলের বিশ্লেষণ (Call Outcomes)' : 'Call Outcomes Breakdown'}
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={followUpData.outcomeBreakdown}
                          dataKey="count"
                          nameKey="label"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                        >
                          {followUpData.outcomeBreakdown.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4">
                    {lang === 'bn' ? 'রুলভিত্তিক টাস্ক ও অগ্রগতি' : 'Tasks by Automation Rule'}
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={followUpData.ruleBreakdown}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                        <Bar dataKey="count" name="Total Tasks" fill="#0284C7" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="completed" name="Completed" fill={BRAND_GREEN} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 font-bold text-xs uppercase text-slate-800">
                  {lang === 'bn' ? 'কল সেন্টার ফলো-আপ তালিকা' : 'Call Center Follow-up Tasks'}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase text-[11px]">
                        <th className="py-3 px-4">Due Date</th>
                        <th className="py-3 px-4">Patient</th>
                        <th className="py-3 px-4">Mobile</th>
                        <th className="py-3 px-4">Rule</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Outcome</th>
                        <th className="py-3 px-4">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {followUpData.table.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 h-12">
                          <td className="py-2.5 px-4 font-mono text-slate-600">{row.dueDate}</td>
                          <td className="py-2.5 px-4 font-bold text-slate-900">{row.patientName}</td>
                          <td className="py-2.5 px-4 font-mono text-slate-700">{row.patientMobile}</td>
                          <td className="py-2.5 px-4 text-slate-600">{row.ruleType}</td>
                          <td className="py-2.5 px-4 uppercase font-semibold text-emerald-700">{row.status}</td>
                          <td className="py-2.5 px-4 font-medium text-slate-800">{row.outcome || '—'}</td>
                          <td className="py-2.5 px-4 text-slate-500 max-w-xs truncate">{row.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: INVENTORY REPORT */}
          {activeTab === 'inventory' && inventoryData && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{lang === 'bn' ? 'মোট প্রোডাক্ট' : 'Total SKUs'}</div>
                  <div className="text-lg font-bold text-slate-900 mt-1 tabular-nums">{inventoryData.kpi.totalProducts}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{lang === 'bn' ? 'স্বল্প মজুদ সতর্কবার্তা' : 'Low Stock Alerts'}</div>
                  <div className="text-lg font-bold text-rose-600 mt-1 tabular-nums">{inventoryData.kpi.lowStockCount}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{lang === 'bn' ? 'মোট মজুদ মূল্য' : 'Stock Value'}</div>
                  <div className="text-lg font-bold text-emerald-600 mt-1 tabular-nums">{formatBdt(inventoryData.kpi.stockValue)}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{lang === 'bn' ? 'ব্যবহার খরচ (Consumption)' : 'Consumption Cost'}</div>
                  <div className="text-lg font-bold text-blue-600 mt-1 tabular-nums">{formatBdt(inventoryData.kpi.consumptionCost)}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{lang === 'bn' ? 'স্টক অ্যাডজাস্টমেন্ট' : 'Adjustments'}</div>
                  <div className="text-lg font-bold text-slate-700 mt-1 tabular-nums">{inventoryData.kpi.totalAdjustments}</div>
                </div>
              </div>

              {/* Consumption & Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 font-bold text-xs uppercase text-slate-800">
                  {lang === 'bn' ? 'প্রোডাক্ট মজুদ ও সতর্কতা লেজার' : 'Current Stock & Inventory Alerts'}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase text-[11px]">
                        <th className="py-3 px-4">Code</th>
                        <th className="py-3 px-4">Product Name</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4 text-right">Stock On Hand</th>
                        <th className="py-3 px-4 text-right">Min Alert</th>
                        <th className="py-3 px-4">Unit</th>
                        <th className="py-3 px-4 text-right">Cost Price</th>
                        <th className="py-3 px-4 text-right">Total Value</th>
                        <th className="py-3 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {inventoryData.table.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 h-12">
                          <td className="py-2.5 px-4 font-mono font-bold text-slate-900">{row.productCode}</td>
                          <td className="py-2.5 px-4 font-semibold text-slate-800">{row.productName}</td>
                          <td className="py-2.5 px-4 text-slate-600">{row.category}</td>
                          <td className="py-2.5 px-4 text-right font-bold tabular-nums text-slate-900">{row.currentStock}</td>
                          <td className="py-2.5 px-4 text-right tabular-nums text-slate-500">{row.minStockAlert}</td>
                          <td className="py-2.5 px-4 text-slate-600">{row.unit}</td>
                          <td className="py-2.5 px-4 text-right tabular-nums">{formatBdt(row.costPrice)}</td>
                          <td className="py-2.5 px-4 text-right font-bold tabular-nums text-emerald-700">{formatBdt(row.totalValue)}</td>
                          <td className="py-2.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                row.status === 'low_stock'
                                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              {row.status === 'low_stock' ? 'Low Stock' : 'In Stock'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: REFERRAL REPORT */}
          {activeTab === 'referral' && referralData && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{lang === 'bn' ? 'মোট রেফারার' : 'Total Referrers'}</div>
                  <div className="text-lg font-bold text-slate-900 mt-1 tabular-nums">{referralData.kpi.totalReferrers}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{lang === 'bn' ? 'রেফারকৃত রোগী' : 'Referred Patients'}</div>
                  <div className="text-lg font-bold text-blue-600 mt-1 tabular-nums">{referralData.kpi.convertedPatients}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{lang === 'bn' ? 'মোট অর্জিত কমিশন' : 'Commission Accrued'}</div>
                  <div className="text-lg font-bold text-purple-700 mt-1 tabular-nums">{formatBdt(referralData.kpi.totalCommissionAccrued)}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{lang === 'bn' ? 'পরিশোধিত কমিশন' : 'Commission Paid'}</div>
                  <div className="text-lg font-bold text-emerald-600 mt-1 tabular-nums">{formatBdt(referralData.kpi.commissionPaid)}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{lang === 'bn' ? 'অপেক্ষমান কমিশন' : 'Pending Payout'}</div>
                  <div className="text-lg font-bold text-amber-600 mt-1 tabular-nums">{formatBdt(referralData.kpi.commissionPending)}</div>
                </div>
              </div>

              {/* Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 font-bold text-xs uppercase text-slate-800">
                  {lang === 'bn' ? 'রেফারাল কমিশন লেজার' : 'Referral Commission Transactions'}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase text-[11px]">
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Referrer</th>
                        <th className="py-3 px-4">Patient</th>
                        <th className="py-3 px-4">Invoice No</th>
                        <th className="py-3 px-4 text-right">Bill Amount</th>
                        <th className="py-3 px-4 text-right">Commission</th>
                        <th className="py-3 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {referralData.table.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 h-12">
                          <td className="py-2.5 px-4 font-mono text-slate-600">{row.date}</td>
                          <td className="py-2.5 px-4 font-bold text-slate-900">{row.referrerName}</td>
                          <td className="py-2.5 px-4 font-semibold text-slate-800">{row.patientName}</td>
                          <td className="py-2.5 px-4 font-mono text-slate-700">{row.invoiceNumber}</td>
                          <td className="py-2.5 px-4 text-right tabular-nums text-slate-700">{formatBdt(row.billAmount)}</td>
                          <td className="py-2.5 px-4 text-right font-bold tabular-nums text-purple-700">{formatBdt(row.commissionAmount)}</td>
                          <td className="py-2.5 px-4 uppercase font-semibold text-emerald-700">{row.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: SMS & NOTIFICATIONS REPORT */}
          {activeTab === 'sms' && smsData && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{lang === 'bn' ? 'মোট প্রেরিত বার্তা' : 'Total SMS Sent'}</div>
                  <div className="text-lg font-bold text-slate-900 mt-1 tabular-nums">{smsData.kpi.totalSent}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{lang === 'bn' ? 'গেটওয়ে গৃহীত' : 'Gateway Accepted'}</div>
                  <div className="text-lg font-bold text-emerald-600 mt-1 tabular-nums">{smsData.kpi.gatewayAccepted}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{lang === 'bn' ? 'ক্যারিয়ার ডেলিভার্ড' : 'Carrier Delivered'}</div>
                  <div className="text-lg font-bold text-blue-600 mt-1 tabular-nums">{smsData.kpi.carrierDelivered}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{lang === 'bn' ? 'ব্যর্থ বার্তা (Failed)' : 'Delivery Failed'}</div>
                  <div className="text-lg font-bold text-rose-600 mt-1 tabular-nums">{smsData.kpi.deliveryFailed}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{lang === 'bn' ? 'মোট এসএমএস খরচ' : 'SMS Cost Credits'}</div>
                  <div className="text-lg font-bold text-slate-800 mt-1 tabular-nums">{formatBdt(smsData.kpi.totalCostCredits)}</div>
                </div>
              </div>

              {/* Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 font-bold text-xs uppercase text-slate-800">
                  {lang === 'bn' ? 'এসএমএস ডেলিভারি রসিদ ও গেটওয়ে লগ' : 'SMS Gateway Logs & Delivery Receipts'}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase text-[11px]">
                        <th className="py-3 px-4">Timestamp</th>
                        <th className="py-3 px-4">Recipient Mobile</th>
                        <th className="py-3 px-4">Template</th>
                        <th className="py-3 px-4">Channel</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Gateway Message ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {smsData.table.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 h-12">
                          <td className="py-2.5 px-4 font-mono text-slate-600">{row.sentAt}</td>
                          <td className="py-2.5 px-4 font-mono font-bold text-slate-900">{row.recipientMobile}</td>
                          <td className="py-2.5 px-4 text-slate-700">{row.templateCode || '—'}</td>
                          <td className="py-2.5 px-4 uppercase text-slate-600">{row.messageType}</td>
                          <td className="py-2.5 px-4 uppercase font-semibold text-emerald-700">{row.status}</td>
                          <td className="py-2.5 px-4 font-mono text-slate-500">{row.gatewayResponse || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
