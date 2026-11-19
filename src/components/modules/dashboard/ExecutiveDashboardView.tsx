import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard,
  Users,
  Calendar,
  Stethoscope,
  Sparkles,
  Package,
  CreditCard,
  DollarSign,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  PhoneCall,
  Clock,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  Eye,
  EyeOff,
  Filter,
  RefreshCw,
  Wallet,
  Building2,
  Receipt,
  Tag,
  Share2,
  Globe,
  MessageCircle,
  ShieldCheck,
  Award,
  Activity,
  ArrowRight,
  ExternalLink,
  Plus,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';
import { api } from '../../../api/client.ts';
import type { Appointment, Patient, Invoice, TreatmentPackage } from '../../../types/index.ts';
import { formatBDT, formatDateDhaka } from '../../../utils/format.ts';

type DashboardMode = 'general' | 'private';
type TimeRange = 'today' | 'month' | 'year' | 'all';
type InvoiceStatusFilter = 'all' | 'paid' | 'partial' | 'pending' | 'refunded';

export const ExecutiveDashboardView: React.FC = () => {
  const { navigate, setSelectedPatientId, setIsQuickBookOpen, setIsPatientRegistrationOpen, language } = useApp();
  const isBn = language === 'bn';

  const [mode, setMode] = useState<DashboardMode>('general');
  const [timeRange, setTimeRange] = useState<TimeRange>('today');
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceStatusFilter>('all');
  const [showWalletBalances, setShowWalletBalances] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // Live Data States
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [packages, setPackages] = useState<TreatmentPackage[]>([]);

  // Load clinic data
  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      const [apts, pts, invs, pkgs] = await Promise.all([
        api.appointments.list().catch(() => [] as Appointment[]),
        api.patients.list().catch(() => [] as Patient[]),
        api.invoices.list().catch(() => [] as Invoice[]),
        api.packages.list().catch(() => [] as TreatmentPackage[]),
      ]);
      setAppointments(apts);
      setPatients(pts);
      setInvoices(invs);
      setPackages(pkgs);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Filter multiplier based on selected time range (simulating aggregate view when changing range)
  const rangeMultiplier = useMemo(() => {
    switch (timeRange) {
      case 'today': return 1;
      case 'month': return 8.5;
      case 'year': return 42;
      case 'all': return 65;
    }
  }, [timeRange]);

  // Derived General Metrics
  const generalMetrics = useMemo(() => {
    const todayCount = appointments.length;
    const completedCount = appointments.filter((a) => a.status === 'visited').length;
    const waitingCount = appointments.filter((a) => a.status === 'confirmed' || a.status === 'booked').length;
    const inProgressCount = appointments.filter((a) => a.status === 'confirmed').length;

    return {
      newLeads: Math.max(14, Math.round(patients.length * 0.4 * (timeRange === 'today' ? 1 : rangeMultiplier * 0.3))),
      openConsultations: Math.max(12, Math.round((todayCount || 20) * (timeRange === 'today' ? 1 : rangeMultiplier * 0.4))),
      newClients: Math.max(6, Math.round(patients.length * (timeRange === 'today' ? 0.3 : rangeMultiplier * 0.25))),
      activeTreatments: Math.max(8, inProgressCount || 15),
      activePackages: packages.length || 24,
      followupsDue: Math.max(5, Math.round((todayCount || 10) * 0.6)),
    };
  }, [appointments, patients, packages, timeRange, rangeMultiplier]);

  // Derived Private / Financial Metrics
  const financialMetrics = useMemo(() => {
    const totalRawRevenue = invoices.reduce((sum, inv) => sum + (inv.paidAmountBDT || inv.totalAmountBDT || 0), 0) || 185000;
    const baseRevenue = timeRange === 'today' ? totalRawRevenue : totalRawRevenue * rangeMultiplier;
    const completedOrders = timeRange === 'today' ? (invoices.length || 18) : Math.round((invoices.length || 18) * rangeMultiplier);
    const newPayingCustomers = Math.max(8, Math.round(patients.length * (timeRange === 'today' ? 0.5 : rangeMultiplier * 0.4)));

    return {
      totalRevenue: baseRevenue,
      completedOrders,
      newCustomers: newPayingCustomers,
      productsSold: Math.round(completedOrders * 1.8),
    };
  }, [invoices, patients, timeRange, rangeMultiplier]);

  // Wallets Definition with dynamic values
  const wallets = useMemo(() => [
    {
      id: 'cash-counter',
      name: 'Cash Counter (Dhanmondi)',
      subtitle: 'Cash Drawer Desk 1 & 2',
      balance: 111160,
      gradient: 'from-violet-600 via-indigo-600 to-indigo-800',
      badge: 'CASH',
      accountNumber: 'Terminal #DH-01',
      trend: '+12.5%',
    },
    {
      id: 'city-bank',
      name: 'City Bank Merchant POS',
      subtitle: 'Visa / MasterCard Gateway',
      balance: 49600,
      gradient: 'from-sky-500 via-blue-600 to-blue-700',
      badge: 'POS CARD',
      accountNumber: 'MID-7729104',
      trend: '+8.2%',
    },
    {
      id: 'bkash',
      name: 'bKash Merchant Account',
      subtitle: 'Online & QR Direct Pay',
      balance: 14490,
      gradient: 'from-rose-500 via-pink-600 to-rose-700',
      badge: 'bKash',
      accountNumber: '+8801711223344',
      trend: '+19.4%',
    },
    {
      id: 'nagad',
      name: 'Nagad Business Wallet',
      subtitle: 'Mobile Money Gateway',
      balance: 7180,
      gradient: 'from-amber-500 via-orange-600 to-red-600',
      badge: 'NAGAD',
      accountNumber: '+8801911882200',
      trend: '+4.1%',
    },
    {
      id: 'brac-bank',
      name: 'BRAC Bank Corporate',
      subtitle: 'Main Operating Account',
      balance: 1815800,
      gradient: 'from-emerald-500 via-teal-600 to-cyan-700',
      badge: 'BANK',
      accountNumber: 'A/C ...8921-001',
      trend: '+15.0%',
    },
    {
      id: 'petty-cash',
      name: 'Clinic Petty Cash Float',
      subtitle: 'Daily Operating & Consumables',
      balance: 16530,
      gradient: 'from-purple-500 via-purple-700 to-indigo-900',
      badge: 'FLOAT',
      accountNumber: 'Vault Box #03',
      trend: '+2.0%',
    },
  ], []);

  // Filtered Invoices for Private Table
  const filteredInvoices = useMemo(() => {
    type InvoiceRow = {
      id: string;
      invoiceNumber: string;
      patientName: string;
      totalAmountBDT: number;
      status: 'paid' | 'partially_paid' | 'unpaid' | 'void' | 'refunded';
      createdAt: string;
    };

    const list: InvoiceRow[] = invoices.length > 0
      ? invoices.map((i) => ({
          id: i.id,
          invoiceNumber: i.invoiceNumber,
          patientName: i.patientName,
          totalAmountBDT: i.totalAmountBDT,
          status: i.status === 'partially_paid' ? 'partially_paid' : i.status,
          createdAt: i.createdAt,
        }))
      : [
          { id: 'inv-1', invoiceNumber: 'INV-2026-0101', patientName: 'Tomasz Nowak', totalAmountBDT: 8500, status: 'paid', createdAt: '2026-11-03T10:30:00Z' },
          { id: 'inv-2', invoiceNumber: 'INV-2026-0102', patientName: 'Ines Varga', totalAmountBDT: 4500, status: 'unpaid', createdAt: '2026-11-03T11:15:00Z' },
          { id: 'inv-3', invoiceNumber: 'INV-2026-0103', patientName: 'Priya Raman', totalAmountBDT: 12500, status: 'partially_paid', createdAt: '2026-11-03T12:00:00Z' },
          { id: 'inv-4', invoiceNumber: 'INV-2026-0104', patientName: 'Sumaiya Rahman', totalAmountBDT: 15000, status: 'paid', createdAt: '2026-11-03T14:20:00Z' },
          { id: 'inv-5', invoiceNumber: 'INV-2026-0105', patientName: 'Fahim Ahsan', totalAmountBDT: 3500, status: 'unpaid', createdAt: '2026-11-03T15:10:00Z' },
          { id: 'inv-6', invoiceNumber: 'INV-2026-0106', patientName: 'Nusrat Jahan', totalAmountBDT: 6000, status: 'void', createdAt: '2026-11-03T16:00:00Z' },
        ];

    if (invoiceFilter === 'paid') {
      return list.filter((i) => i.status === 'paid');
    }
    if (invoiceFilter === 'partial') {
      return list.filter((i) => i.status === 'partially_paid');
    }
    if (invoiceFilter === 'pending') {
      return list.filter((i) => i.status === 'unpaid');
    }
    if (invoiceFilter === 'refunded') {
      return list.filter((i) => i.status === 'void' || i.status === 'refunded');
    }
    return list;
  }, [invoices, invoiceFilter]);

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-300">
      {/* ======================================================== */}
      {/* 1. TOP HEADER & SWITCHER BAR                             */}
      {/* ======================================================== */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-[#0DA54F] flex items-center justify-center text-white shadow-xs">
              <LayoutDashboard className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  {mode === 'general' ? 'Clinic Executive Dashboard' : 'Private Financial Dashboard'}
                </h1>
                {mode === 'private' && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 uppercase tracking-wider animate-pulse">
                    Private Mode
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {mode === 'general'
                  ? 'Real-time overview of clinic flow, patient pipeline, staff roster, and daily follow-ups'
                  : 'Executive money flow, cash drawers, merchant wallets, invoices, and sales distribution'}
              </p>
            </div>
          </div>
        </div>

        {/* Right Controls: Mode Toggle & Date Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Mode Switcher (General vs Private) */}
          <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              onClick={() => setMode('general')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                mode === 'general'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5 text-indigo-600" />
              <span>General</span>
            </button>
            <button
              onClick={() => setMode('private')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                mode === 'private'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-rose-600'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Private</span>
            </button>
          </div>

          {/* Time Range Pills */}
          <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200">
            {(['today', 'month', 'year', 'all'] as TimeRange[]).map((range) => {
              const labelMap: Record<TimeRange, string> = {
                today: 'Today',
                month: 'This Month',
                year: 'This Year',
                all: 'All',
              };
              const isActive = timeRange === range;
              return (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {labelMap[range]}
                </button>
              );
            })}
          </div>

          {/* Refresh Button */}
          <button
            onClick={loadDashboardData}
            disabled={isLoading}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. MODE: GENERAL DASHBOARD (OPERATIONS & CLINICAL CRM)   */}
      {/* ======================================================== */}
      {mode === 'general' && (
        <div className="space-y-6">
          {/* Row 1: 6 Top KPI Metrics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5">
            {/* 1. New Leads */}
            <div
              onClick={() => navigate('/crm/followups')}
              className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs hover:-translate-y-1 hover:shadow-md transition-all duration-200 cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">New Leads</span>
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Sparkles className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-slate-900">{generalMetrics.newLeads}</span>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                  <ArrowUpRight className="w-3 h-3" /> +14%
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 truncate">Total leads received</p>
            </div>

            {/* 2. Open Consultations */}
            <div
              onClick={() => navigate('/consultation/desk')}
              className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs hover:-translate-y-1 hover:shadow-md transition-all duration-200 cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Consultations</span>
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Stethoscope className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-slate-900">{generalMetrics.openConsultations}</span>
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                  <Activity className="w-3 h-3" /> Live
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 truncate">Aesthetic consultations</p>
            </div>

            {/* 3. New Clients */}
            <div
              onClick={() => navigate('/crm/patients')}
              className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs hover:-translate-y-1 hover:shadow-md transition-all duration-200 cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">New Clients</span>
                <div className="w-8 h-8 rounded-xl bg-cyan-100 text-cyan-700 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-slate-900">{generalMetrics.newClients}</span>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                  <ArrowUpRight className="w-3 h-3" /> +100%
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 truncate">Registered patients</p>
            </div>

            {/* 4. Active Treatments */}
            <div
              onClick={() => navigate('/crm/appointments')}
              className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs hover:-translate-y-1 hover:shadow-md transition-all duration-200 cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Treatments</span>
                <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Sparkles className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-slate-900">{generalMetrics.activeTreatments}</span>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                  <CheckCircle className="w-3 h-3" /> In-Clinic
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 truncate">Laser & peel sessions</p>
            </div>

            {/* 5. Active Packages */}
            <div
              onClick={() => navigate('/packages')}
              className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs hover:-translate-y-1 hover:shadow-md transition-all duration-200 cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Active Packages</span>
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Package className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-slate-900">{generalMetrics.activePackages}</span>
                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md">
                  Bundles
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 truncate">Multi-session plans</p>
            </div>

            {/* 6. Follow-ups Due */}
            <div
              onClick={() => navigate('/crm/followups')}
              className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs hover:-translate-y-1 hover:shadow-md transition-all duration-200 cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Followups Due</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <PhoneCall className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-slate-900">{generalMetrics.followupsDue}</span>
                <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md">
                  Action Req
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 truncate">Post-treatment calls</p>
            </div>
          </div>

          {/* Row 2: Treatment Pipeline & Where Leads Come From */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left Column: Deal / Treatment Pipeline (7 cols) */}
            <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Patient Treatment Pipeline</h3>
                  <p className="text-xs text-slate-500">4 stages progression across active aesthetic journey</p>
                </div>
                <button
                  onClick={() => navigate('/crm/appointments')}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  View all <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Multi-color connected progress bar */}
              <div className="h-3 w-full rounded-full bg-slate-100 flex overflow-hidden p-0.5 gap-0.5 shadow-2xs">
                <div className="h-full bg-blue-500 rounded-l-full" style={{ width: '30%' }} title="New Inquiry: 30%" />
                <div className="h-full bg-purple-500" style={{ width: '28%' }} title="Consultation: 28%" />
                <div className="h-full bg-pink-500" style={{ width: '25%' }} title="Procedure Booked: 25%" />
                <div className="h-full bg-emerald-500 rounded-r-full" style={{ width: '17%' }} title="Completed: 17%" />
              </div>

              {/* 4 Pipeline Stage Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase">1. New Lead</span>
                  </div>
                  <p className="text-lg font-black text-slate-900">14</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">30% of pipeline</p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-2 h-2 rounded-full bg-purple-500" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase">2. Consulted</span>
                  </div>
                  <p className="text-lg font-black text-slate-900">13</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">28% of pipeline</p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-2 h-2 rounded-full bg-pink-500" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase">3. Procedure</span>
                  </div>
                  <p className="text-lg font-black text-slate-900">14</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">25% of pipeline</p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase">4. Retained</span>
                  </div>
                  <p className="text-lg font-black text-slate-900">7</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">17% of pipeline</p>
                </div>
              </div>

              {/* Bottom Pipeline Status */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <strong>21 Completed</strong>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <strong>12 In-Session</strong>
                  </span>
                </div>
                <span className="font-semibold text-emerald-600">63% Conversion Realized</span>
              </div>
            </div>

            {/* Right Column: Where Leads Come From (5 cols) */}
            <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Where Leads Come From</h3>
                  <p className="text-xs text-slate-500">Inquiry channels & acquisition sources</p>
                </div>
              </div>

              {/* Channels list with colored progress bars */}
              <div className="space-y-3">
                {[
                  { name: 'Facebook & Instagram Ads', count: 37, pct: 45, color: 'bg-purple-600', icon: Share2 },
                  { name: 'Website Direct Booking', count: 22, pct: 26, color: 'bg-cyan-500', icon: Globe },
                  { name: 'WhatsApp Helpline (+88017...)', count: 18, pct: 21, color: 'bg-emerald-500', icon: MessageCircle },
                  { name: 'Doctor & Partner Referrals', count: 12, pct: 15, color: 'bg-amber-500', icon: Award },
                  { name: 'Walk-in / Reception Counter', count: 9, pct: 11, color: 'bg-rose-500', icon: Building2 },
                ].map((channel, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <channel.icon className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-semibold text-slate-700">{channel.name}</span>
                      </div>
                      <span className="font-bold text-slate-900">{channel.count}</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full ${channel.color} rounded-full transition-all duration-500`}
                        style={{ width: `${channel.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Row 3: Today's Attendance / Duty Roster & Due This Week Followups */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left: Today's HRM & Attendance Widget (5 cols) */}
            <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Today's Clinic Desk & Staff</h3>
                  <p className="text-xs text-slate-500">{formatDateDhaka(new Date().toISOString())}</p>
                </div>
                <button
                  onClick={() => navigate('/users/roster')}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                >
                  Roster →
                </button>
              </div>

              {/* 3 Pills: Present, Half Day, Absent */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200/70 text-center">
                  <p className="text-xl font-black text-emerald-800">16</p>
                  <p className="text-[10px] font-bold text-emerald-700 uppercase mt-0.5">Present</p>
                </div>
                <div className="p-3 rounded-xl bg-purple-50 border border-purple-200/70 text-center">
                  <p className="text-xl font-black text-purple-800">1</p>
                  <p className="text-[10px] font-bold text-purple-700 uppercase mt-0.5">Half Day</p>
                </div>
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200/70 text-center">
                  <p className="text-xl font-black text-rose-800">2</p>
                  <p className="text-[10px] font-bold text-rose-700 uppercase mt-0.5">Absent / Off</p>
                </div>
              </div>

              {/* Quick Communication & Waiting Indicators */}
              <div className="space-y-2 pt-1">
                <div
                  onClick={() => navigate('/crm/reception')}
                  className="p-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 flex items-center justify-between cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                    <span className="text-xs font-semibold text-slate-700">Waiting in Reception Queue</span>
                  </div>
                  <span className="text-xs font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                    {Math.max(3, appointments.filter((a) => a.status === 'confirmed').length)} Patients
                  </span>
                </div>

                <div
                  onClick={() => navigate('/crm/followups')}
                  className="p-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 flex items-center justify-between cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <MessageCircle className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-semibold text-slate-700">Live WhatsApp Inquiries</span>
                  </div>
                  <span className="text-xs font-extrabold text-slate-700 bg-slate-200 px-2 py-0.5 rounded-md">
                    7 Pending
                  </span>
                </div>

                <div
                  onClick={() => navigate('/crm/followups')}
                  className="p-3 rounded-xl bg-rose-50/70 hover:bg-rose-50 border border-rose-200/80 flex items-center justify-between cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    <span className="text-xs font-semibold text-rose-900">Post-Treatment Followup Due</span>
                  </div>
                  <span className="text-xs font-extrabold text-rose-800 bg-rose-200 px-2 py-0.5 rounded-md">
                    {generalMetrics.followupsDue} Urgent
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Due This Week / Clinical Followup Tasks (7 cols) */}
            <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Due This Week & Clinical Tasks</h3>
                  <p className="text-xs text-slate-500">Upcoming follow-ups, skin barrier reviews & test sessions</p>
                </div>
                <button
                  onClick={() => navigate('/crm/followups')}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                >
                  All Tasks →
                </button>
              </div>

              {/* Calendar square block tasks list */}
              <div className="space-y-2.5">
                {[
                  {
                    date: '04',
                    month: 'NOV',
                    title: 'Post-Laser HydraFacial Review — Sumaiya Rahman',
                    assignee: 'Dr. Nusrat Jahan',
                    badge: 'Overdue',
                    badgeColor: 'bg-rose-100 text-rose-700 border-rose-200',
                    isRedDate: true,
                  },
                  {
                    date: '05',
                    month: 'NOV',
                    title: 'Fractional CO2 Session 2 Assessment — Tomasz Nowak',
                    assignee: 'Senior Dermatologist',
                    badge: 'Pending',
                    badgeColor: 'bg-amber-100 text-amber-700 border-amber-200',
                    isRedDate: false,
                  },
                  {
                    date: '06',
                    month: 'NOV',
                    title: 'Skin Barrier Recovery Followup — Priya Raman',
                    assignee: 'Call Center Followup Desk',
                    badge: 'Overdue',
                    badgeColor: 'bg-rose-100 text-rose-700 border-rose-200',
                    isRedDate: true,
                  },
                  {
                    date: '07',
                    month: 'NOV',
                    title: 'Autologous PRP Second Dose Schedule — Fahim Ahsan',
                    assignee: 'Room 302 Desk',
                    badge: 'Confirmed',
                    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                    isRedDate: false,
                  },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl border border-slate-200/80 hover:border-indigo-300 hover:bg-slate-50/70 transition-all flex items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center gap-3">
                      {/* Date block like in video */}
                      <div
                        className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center font-bold shrink-0 ${
                          item.isRedDate
                            ? 'bg-rose-500 text-white'
                            : 'bg-slate-800 text-white'
                        }`}
                      >
                        <span className="text-sm leading-none">{item.date}</span>
                        <span className="text-[9px] uppercase tracking-wider opacity-90">{item.month}</span>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Assigned: {item.assignee}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${item.badgeColor} shrink-0`}>
                      {item.badge}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. MODE: PRIVATE FINANCIAL & EXECUTIVE DASHBOARD         */}
      {/* ======================================================== */}
      {mode === 'private' && (
        <div className="space-y-6">
          {/* Row 1: 4 Financial KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Revenue */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:-translate-y-1 hover:shadow-md transition-all duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Revenue</span>
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <DollarSign className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-2xl font-black text-slate-900">
                  {formatBDT(financialMetrics.totalRevenue)}
                </span>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-0.5">
                  <ArrowUpRight className="w-3.5 h-3.5" /> +24.8%
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Cash, Card, bKash & Bank Collections</p>
            </div>

            {/* Completed Invoices / Orders */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:-translate-y-1 hover:shadow-md transition-all duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Completed Invoices</span>
                <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <Receipt className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-2xl font-black text-slate-900">{financialMetrics.completedOrders}</span>
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md flex items-center gap-0.5">
                  <CheckCircle className="w-3.5 h-3.5" /> Settled
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Paid in full with zero dispute</p>
            </div>

            {/* Paying Customers */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:-translate-y-1 hover:shadow-md transition-all duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Paying Patients</span>
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-2xl font-black text-slate-900">{financialMetrics.newCustomers}</span>
                <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md">
                  Active Base
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Transactions during period</p>
            </div>

            {/* Procedures & Retail Products Sold */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:-translate-y-1 hover:shadow-md transition-all duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Items & Procedures</span>
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                  <Tag className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-2xl font-black text-slate-900">{financialMetrics.productsSold}</span>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-0.5">
                  <ArrowUpRight className="w-3.5 h-3.5" /> +16%
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Derma creams, lasers & peels</p>
            </div>
          </div>

          {/* Row 2: Accounts & Wallets (VIDEO'S HIGHLIGHT FEATURE) & Money In & Out */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left: Accounts & Wallets Gradients (8 cols) */}
            <div className="lg:col-span-8 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-indigo-600" />
                  <h3 className="font-bold text-slate-900 text-sm">Accounts & Wallets</h3>
                  <span className="text-xs text-slate-400">({wallets.length} active channels)</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowWalletBalances(!showWalletBalances)}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs flex items-center gap-1 cursor-pointer"
                    title={showWalletBalances ? 'Hide Balances' : 'Show Balances'}
                  >
                    {showWalletBalances ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showWalletBalances ? 'Hide' : 'Show'}</span>
                  </button>
                  <button
                    onClick={() => navigate('/billing/counter')}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                  >
                    Finance →
                  </button>
                </div>
              </div>

              {/* 6 Gradient Wallet Cards (Exact visual inspiration from video) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                {wallets.map((wallet) => (
                  <div
                    key={wallet.id}
                    className={`p-4 rounded-2xl bg-gradient-to-br ${wallet.gradient} text-white shadow-xs relative overflow-hidden group hover:scale-[1.02] hover:shadow-lg transition-all duration-200 cursor-pointer`}
                  >
                    {/* Background subtle watermark circles */}
                    <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-white/10 rounded-full blur-xs pointer-events-none" />
                    <div className="absolute right-6 -top-6 w-16 h-16 bg-white/10 rounded-full blur-xs pointer-events-none" />

                    <div className="relative z-10 flex flex-col justify-between h-full space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold uppercase tracking-widest bg-white/20 backdrop-blur-xs px-2 py-0.5 rounded-full">
                          {wallet.badge}
                        </span>
                        <span className="text-[10px] font-bold text-white/90 bg-white/15 px-1.5 py-0.5 rounded-md">
                          {wallet.trend}
                        </span>
                      </div>

                      <div>
                        <p className="text-[11px] font-medium text-white/85 truncate">{wallet.name}</p>
                        <p className="text-xl font-black tracking-tight text-white mt-0.5">
                          {showWalletBalances ? formatBDT(wallet.balance) : '••••••••'}
                        </p>
                      </div>

                      <div className="pt-1 border-t border-white/20 flex items-center justify-between text-[10px] text-white/80">
                        <span className="font-mono">{wallet.accountNumber}</span>
                        <span className="group-hover:translate-x-1 transition-transform">→</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Money In & Out Widget (4 cols) */}
            <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 text-sm">Money In & Out</h3>
                <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                  Positive Flow
                </span>
              </div>

              <div className="space-y-4">
                {/* Income */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      Total Income
                    </span>
                    <span className="font-black text-emerald-600">
                      {formatBDT(financialMetrics.totalRevenue)}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: '82%' }} />
                  </div>
                </div>

                {/* Expenses */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                      Clinic Expenses & Supplies
                    </span>
                    <span className="font-black text-rose-600">
                      {formatBDT(financialMetrics.totalRevenue * 0.28)}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-rose-500 rounded-full" style={{ width: '28%' }} />
                  </div>
                </div>

                {/* Bill Still To Pay / Unpaid Invoices */}
                <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-900">BILLS STILL TO PAY / DUE:</span>
                    <span className="text-xs font-black text-amber-900">
                      {formatBDT(financialMetrics.totalRevenue * 0.08)}
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-700">6 invoices currently awaiting partial/due settlements</p>
                </div>

                {/* Net Operating Realization */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-600">Net Realized Margin:</span>
                  <span className="text-sm font-black text-[#0DA54F]">
                    {formatBDT(financialMetrics.totalRevenue * 0.72)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Row 3: Filterable Invoices Table & Revenue Distribution by Status (Donut Chart) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left: Filterable Invoices Table (8 cols) */}
            <div className="lg:col-span-8 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Recent Billing & Orders</h3>
                  <p className="text-xs text-slate-500">Live invoices, payment receipts and settlement statuses</p>
                </div>

                {/* Filter Tabs like in Video */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { id: 'all', label: 'All', count: invoices.length || 68 },
                    { id: 'paid', label: 'Paid', count: 52 },
                    { id: 'partial', label: 'Partial', count: 8 },
                    { id: 'pending', label: 'Pending', count: 6 },
                    { id: 'refunded', label: 'Refunded', count: 2 },
                  ].map((tab) => {
                    const isActive = invoiceFilter === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setInvoiceFilter(tab.id as InvoiceStatusFilter)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          isActive
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span className={`text-[10px] px-1 py-0.2 rounded-full ${
                          isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Invoices Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="py-2.5 px-3">Order / Invoice</th>
                      <th className="py-2.5 px-3">Patient</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredInvoices.slice(0, 7).map((inv, idx) => (
                      <tr key={inv.id || idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-indigo-600">
                          {inv.invoiceNumber || `INV-${260100 + idx}`}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">
                          {inv.patientName || 'Clinic Patient'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">
                          {formatDateDhaka(inv.createdAt || new Date().toISOString())}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold text-[10px] uppercase ${
                              inv.status === 'paid'
                                ? 'bg-emerald-100 text-emerald-800'
                                : inv.status === 'partially_paid'
                                ? 'bg-indigo-100 text-indigo-800'
                                : inv.status === 'void' || inv.status === 'refunded'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {inv.status === 'partially_paid' ? 'PARTIAL' : inv.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-black text-slate-900">
                          {formatBDT(inv.totalAmountBDT || 8500)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right: Orders by Status Donut Chart & Top Products (4 cols) */}
            <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 text-sm">Orders / Revenue by Status</h3>
                <p className="text-xs text-slate-500">Distribution of billing realization</p>
              </div>

              {/* Donut Chart Simulation (SVG with exact clean aesthetics) */}
              <div className="flex items-center justify-center py-2">
                <div className="relative w-40 h-40">
                  <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    {/* Circle 1: Paid (75%) */}
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="#10B981"
                      strokeWidth="4"
                      strokeDasharray="75 100"
                      strokeDashoffset="0"
                    />
                    {/* Circle 2: Partial (12%) */}
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="#6366F1"
                      strokeWidth="4"
                      strokeDasharray="12 100"
                      strokeDashoffset="-75"
                    />
                    {/* Circle 3: Pending (9%) */}
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="#F59E0B"
                      strokeWidth="4"
                      strokeDasharray="9 100"
                      strokeDashoffset="-87"
                    />
                    {/* Circle 4: Refunded (4%) */}
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="#EF4444"
                      strokeWidth="4"
                      strokeDasharray="4 100"
                      strokeDashoffset="-96"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-xs font-semibold text-slate-400">Total</span>
                    <span className="text-xl font-black text-slate-900">68</span>
                    <span className="text-[10px] text-emerald-600 font-bold">75% Paid</span>
                  </div>
                </div>
              </div>

              {/* Chart Legend */}
              <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-slate-600">Paid (52)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                  <span className="text-slate-600">Partial (8)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="text-slate-600">Pending (6)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  <span className="text-slate-600">Refunded (2)</span>
                </div>
              </div>

              {/* Top Revenue Treatments */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Top Treatments & Skincare</h4>
                {[
                  { name: 'HydraFacial MD with GlySal', price: 4500, count: 28 },
                  { name: 'Fractional CO2 Laser Resurfacing', price: 8500, count: 19 },
                  { name: 'Q-Switched Nd:YAG Laser Toning', price: 6500, count: 14 },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded-lg bg-slate-50">
                    <div>
                      <p className="font-semibold text-slate-800">{item.name}</p>
                      <p className="text-[10px] text-slate-400">{item.count} sessions completed</p>
                    </div>
                    <span className="font-bold text-slate-900">{formatBDT(item.price)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
