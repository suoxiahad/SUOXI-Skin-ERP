import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Percent,
  RefreshCw,
  Plus,
  DollarSign,
  CheckCircle,
  Clock,
  Search,
  Filter,
  CreditCard,
  Scale,
  ShieldCheck,
  Lock,
  ArrowUpRight,
  RotateCcw,
  AlertCircle,
  ExternalLink,
  CheckSquare,
  Square,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';
import { api } from '../../../api/client.ts';
import type {
  ReferrerDto,
  CommissionDto,
  CommissionRuleDto,
  CommissionPayoutDto,
  ReferrerType,
} from '@suoxi/shared-types';
import { formatBDT, formatDateDhaka } from '../../../utils/format.ts';
import { TableSkeleton } from '../../common/Skeleton.tsx';
import { EmptyState } from '../../common/EmptyState.tsx';
import { AddReferrerModal } from './AddReferrerModal.tsx';
import { ReferrerDetailModal } from './ReferrerDetailModal.tsx';
import { CreatePayoutModal } from './CreatePayoutModal.tsx';
import { CommissionRuleModal } from './CommissionRuleModal.tsx';

export const ReferralCommissionsView: React.FC = () => {
  const { addToast, language, currentUser, currentView, navigate } = useApp();
  const isBn = language === 'bn';

  // Active Main Tab synchronized with currentView & navigation routes
  const activeTab = useMemo<'referrers' | 'commissions' | 'rules' | 'payouts'>(() => {
    if (currentView === 'referrals-commissions') return 'commissions';
    if (currentView === 'referrals-rules') return 'rules';
    if (currentView === 'referrals-payouts') return 'payouts';
    return 'referrers';
  }, [currentView]);

  const handleTabChange = (tab: 'referrers' | 'commissions' | 'rules' | 'payouts') => {
    switch (tab) {
      case 'referrers':
        navigate('/referrals/directory');
        break;
      case 'commissions':
        navigate('/referrals/commissions');
        break;
      case 'rules':
        navigate('/referrals/rules');
        break;
      case 'payouts':
        navigate('/referrals/payouts');
        break;
    }
  };

  // Modals state
  const [isAddReferrerOpen, setIsAddReferrerOpen] = useState(false);
  const [selectedDetailReferrerId, setSelectedDetailReferrerId] = useState<string | null>(null);
  const [selectedPayoutReferrerId, setSelectedPayoutReferrerId] = useState<string | null>(null);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);

  // Data states
  const [referrers, setReferrers] = useState<ReferrerDto[]>([]);
  const [commissions, setCommissions] = useState<CommissionDto[]>([]);
  const [rules, setRules] = useState<CommissionRuleDto[]>([]);
  const [payouts, setPayouts] = useState<CommissionPayoutDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncingOutbox, setIsSyncingOutbox] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [commissionStatusFilter, setCommissionStatusFilter] = useState<string>('all');
  const [selectedCommissionIds, setSelectedCommissionIds] = useState<Set<string>>(new Set());

  const canManageRules =
    currentUser?.role === 'super_admin' || currentUser?.role === 'admin_manager';
  const canApprove =
    currentUser?.role === 'super_admin' ||
    currentUser?.role === 'admin_manager' ||
    currentUser?.role === 'cashier';

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const [refRes, commRes, rulesRes, payoutRes] = await Promise.all([
        api.referrals.list({
          search: searchQuery || undefined,
          type: typeFilter !== 'all' ? typeFilter : undefined,
          limit: 100,
        }),
        api.commissions.list({
          status: commissionStatusFilter !== 'all' ? commissionStatusFilter : undefined,
        }),
        api.commissions.listRules(),
        api.commissions.listPayouts(),
      ]);

      setReferrers(refRes.data);
      setCommissions(commRes);
      setRules(rulesRes);
      setPayouts(payoutRes);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: language === 'bn' ? 'ডাটা লোড করতে ব্যর্থ' : 'Failed to load referral data',
        description: err.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [searchQuery, typeFilter, commissionStatusFilter]);

  // Sync outbox domain events manually
  const handleSyncOutbox = async () => {
    setIsSyncingOutbox(true);
    try {
      const result = await api.commissions.processOutbox();
      addToast({
        type: 'success',
        title: language === 'bn' ? 'আউটবক্স সিঙ্ক সম্পন্ন' : 'Outbox synced successfully',
        description:
          language === 'bn'
            ? `${result.commissionsCreated} নতুন কমিশন অর্জিত, ${result.reversalsCreated} রিভার্সাল প্রক্রিয়াকৃত`
            : `${result.commissionsCreated} new commissions accrued, ${result.reversalsCreated} reversals processed`,
      });
      loadAllData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: language === 'bn' ? 'সিঙ্ক ব্যর্থ' : 'Sync failed',
        description: err.message,
      });
    } finally {
      setIsSyncingOutbox(false);
    }
  };

  // Bulk approve commissions
  const handleApproveCommissions = async () => {
    if (selectedCommissionIds.size === 0) return;
    try {
      const approved = await api.commissions.approve(Array.from(selectedCommissionIds));
      addToast({
        type: 'success',
        title: language === 'bn' ? 'কমিশন অনুমোদিত' : 'Commissions approved',
        description: `${approved.length} commissions marked as approved for payout`,
      });
      setSelectedCommissionIds(new Set());
      loadAllData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: language === 'bn' ? 'অনুমোদন ব্যর্থ' : 'Approval failed',
        description: err.message,
      });
    }
  };

  // Selection toggle
  const toggleSelectCommission = (id: string) => {
    const next = new Set(selectedCommissionIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedCommissionIds(next);
  };

  // Total summary metrics
  const totalPendingBDT = referrers.reduce((sum, r) => sum + r.totalPendingAmount, 0);
  const totalPaidBDT = referrers.reduce((sum, r) => sum + r.totalPaidAmount, 0);
  const totalPatientsCount = referrers.reduce((sum, r) => sum + (r.referredPatientCount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white shadow-xs shrink-0">
            <Percent className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Referrals & Commissions
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-[#0DA54F] border border-emerald-200 rounded-full uppercase tracking-wider">
                Dhaka Realized
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
          <button
            onClick={handleSyncOutbox}
            disabled={isSyncingOutbox}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-xl transition-all shadow-2xs cursor-pointer"
            title="Process pending payment/refund domain events into commissions"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isSyncingOutbox ? 'animate-spin text-[#0DA54F]' : ''}`} />
            <span>Sync Outbox</span>
          </button>

          <button
            onClick={loadAllData}
            className="p-2 text-slate-500 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-all shadow-2xs cursor-pointer"
            title="Refresh All"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#0DA54F]' : ''}`} />
          </button>

          <button
            onClick={() => setIsAddReferrerOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0DA54F] hover:bg-[#0b8a42] rounded-xl transition-all shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Referrer</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs hover:shadow-xs hover:-translate-y-0.5 transition-all">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Referrers</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
            {referrers.length}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {totalPatientsCount} patients attributed
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs hover:shadow-xs hover:-translate-y-0.5 transition-all">
          <div className="flex items-center justify-between text-amber-700 text-xs font-semibold">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Pending</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-amber-600 mt-1 tabular-nums">
            {formatBDT(totalPendingBDT)}
          </div>
          <span className="text-[11px] text-amber-600/80 mt-1 block">
            {commissions.filter((c) => c.status === 'pending').length} pending approvals
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs hover:shadow-xs hover:-translate-y-0.5 transition-all">
          <div className="flex items-center justify-between text-emerald-700 text-xs font-semibold">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Paid Out</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-[#0DA54F] flex items-center justify-center">
              <CheckCircle className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-[#0DA54F] mt-1 tabular-nums">
            {formatBDT(totalPaidBDT)}
          </div>
          <span className="text-[11px] text-emerald-600/80 mt-1 block">
            {payouts.length} payout settlement batches
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs hover:shadow-xs hover:-translate-y-0.5 transition-all">
          <div className="flex items-center justify-between text-purple-700 text-xs font-semibold">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Active Rules</span>
            <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Scale className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-purple-600 mt-1 tabular-nums">
            {rules.filter((r) => r.isActive).length}
          </div>
          <span className="text-[11px] text-purple-500 mt-1 block">
            {rules.length} total active rule slabs
          </span>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="border-b border-slate-200 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-6">
          <button
            onClick={() => handleTabChange('referrers')}
            className={`pb-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'referrers'
                ? 'border-[#0DA54F] text-[#0DA54F]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>{isBn ? 'রেফারার ডিরেক্টরি' : 'Referrers Directory'}</span>
            <span
              className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                activeTab === 'referrers'
                  ? 'bg-emerald-100 text-[#0DA54F]'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {referrers.length}
            </span>
          </button>

          <button
            onClick={() => handleTabChange('commissions')}
            className={`pb-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'commissions'
                ? 'border-[#0DA54F] text-[#0DA54F]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>{isBn ? 'কমিশন লেজার' : 'Commissions Ledger'}</span>
            <span
              className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                activeTab === 'commissions'
                  ? 'bg-emerald-100 text-[#0DA54F]'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {commissions.length}
            </span>
          </button>

          <button
            onClick={() => handleTabChange('rules')}
            className={`pb-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'rules'
                ? 'border-[#0DA54F] text-[#0DA54F]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Scale className="w-4 h-4" />
            <span>{isBn ? 'কমিশন রুলস' : 'Commission Rules'}</span>
            <span
              className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                activeTab === 'rules'
                  ? 'bg-emerald-100 text-[#0DA54F]'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {rules.length}
            </span>
          </button>

          <button
            onClick={() => handleTabChange('payouts')}
            className={`pb-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'payouts'
                ? 'border-[#0DA54F] text-[#0DA54F]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>{isBn ? 'পে-আউট ও নিষ্পত্তি' : 'Payouts & Settlement'}</span>
            <span
              className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                activeTab === 'payouts'
                  ? 'bg-emerald-100 text-[#0DA54F]'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {payouts.length}
            </span>
          </button>
        </div>

        {/* Tab contextual quick action */}
        {activeTab === 'rules' && canManageRules && (
          <button
            onClick={() => setIsRuleModalOpen(true)}
            className="mb-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{language === 'bn' ? 'নতুন রুল যুক্ত করুন' : 'New Commission Rule'}</span>
          </button>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: REFERRERS DIRECTORY */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'referrers' && (
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder={
                  language === 'bn'
                    ? 'রেফারার নাম, কোড, মোবাইল বা প্রতিষ্ঠান দিয়ে খুঁজুন...'
                    : 'Search referrer by code, name, phone, or org...'
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
              >
                <option value="all">{language === 'bn' ? 'সকল ধরন' : 'All Types'}</option>
                <option value="doctor">{language === 'bn' ? 'ডাক্তার (Doctor)' : 'Doctor'}</option>
                <option value="patient">{language === 'bn' ? 'রোগী (Patient)' : 'Patient'}</option>
                <option value="staff">{language === 'bn' ? 'স্টাফ (Staff)' : 'Staff'}</option>
                <option value="agent">{language === 'bn' ? 'এজেন্ট (Agent)' : 'Agent'}</option>
                <option value="organization">{language === 'bn' ? 'প্রতিষ্ঠান (Org)' : 'Organization'}</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            {isLoading ? (
              <TableSkeleton cols={7} rows={6} />
            ) : referrers.length === 0 ? (
              <EmptyState
                icon={Users}
                title={language === 'bn' ? 'কোন রেফারার পাওয়া যায়নি' : 'No referrers found'}
                description={
                  language === 'bn'
                    ? 'আপনার সার্চ ফিল্টারে কোন তথ্য মেলেনি অথবা নতুন রেফারার নিবন্ধন করুন।'
                    : 'Register external doctors, clinic partners, or agents to start attribution.'
                }
                actionLabel={language === 'bn' ? 'রেফারার নিবন্ধন' : 'Register Referrer'}
                onAction={() => setIsAddReferrerOpen(true)}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/90 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Referrer</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Contact</th>
                      <th className="px-4 py-3 text-center">Patients</th>
                      <th className="px-4 py-3 text-right">Pending Due</th>
                      <th className="px-4 py-3 text-right">Total Paid</th>
                      <th className="px-4 py-3">Payout Details</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {referrers.map((ref) => (
                      <tr key={ref.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">
                            {ref.fullName}
                          </div>
                          {ref.fullNameBn && (
                            <div className="text-[11px] text-slate-500 font-normal">
                              {ref.fullNameBn}
                            </div>
                          )}
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {ref.referrerCode}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <span className="inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-md bg-slate-100 text-slate-700 capitalize">
                            {ref.referrerType}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-slate-600">
                          <div>{ref.mobile}</div>
                          {ref.organizationName && (
                            <div className="text-[10px] text-slate-400 truncate max-w-[150px]">
                              {ref.organizationName}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex px-2 py-0.5 text-[11px] font-bold rounded-full bg-slate-100 text-slate-700 tabular-nums">
                            {ref.referredPatientCount || 0}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-amber-700">
                          {formatBDT(ref.totalPendingAmount)}
                        </td>

                        <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                          {formatBDT(ref.totalPaidAmount)}
                        </td>

                        <td className="px-4 py-3 text-slate-500">
                          <div className="flex items-center gap-1.5">
                            <span className="capitalize text-slate-700 font-semibold">{ref.payoutMethod}</span>
                            {ref.hasPayoutDetails && (
                              <span title="Encrypted" className="text-emerald-600">
                                <Lock className="w-3 h-3" />
                              </span>
                            )}
                          </div>
                          {ref.payoutDetailsMasked && (
                            <div className="text-[10px] font-mono text-slate-400">
                              {ref.payoutDetailsMasked}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedDetailReferrerId(ref.id)}
                              className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                            >
                              {language === 'bn' ? 'বিস্তারিত' : 'Detail'}
                            </button>

                            {ref.totalPendingAmount > 0 && (
                              <button
                                onClick={() => setSelectedPayoutReferrerId(ref.id)}
                                className="px-2.5 py-1 text-xs font-semibold text-white bg-[#0DA54F] hover:bg-[#0b8a42] rounded-lg transition-colors shadow-2xs"
                              >
                                {language === 'bn' ? 'পে-আউট' : 'Payout'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: COMMISSIONS LEDGER */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'commissions' && (
        <div className="space-y-4">
          {/* Filter Bar & Bulk Actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <select
                value={commissionStatusFilter}
                onChange={(e) => setCommissionStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
              >
                <option value="all">{language === 'bn' ? 'সকল স্ট্যাটাস' : 'All Statuses'}</option>
                <option value="pending">{language === 'bn' ? 'অমীমাংসিত (Pending)' : 'Pending'}</option>
                <option value="approved">{language === 'bn' ? 'অনুমোদিত (Approved)' : 'Approved'}</option>
                <option value="paid">{language === 'bn' ? 'পরিশোধিত (Paid)' : 'Paid'}</option>
                <option value="adjusted">{language === 'bn' ? 'সমন্বিত / রিভার্সড' : 'Adjusted / Reversed'}</option>
              </select>

              {selectedCommissionIds.size > 0 && canApprove && (
                <button
                  onClick={handleApproveCommissions}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-2xs flex items-center gap-1.5"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>
                    {language === 'bn'
                      ? `অনুমোদন করুন (${selectedCommissionIds.size})`
                      : `Approve Selected (${selectedCommissionIds.size})`}
                  </span>
                </button>
              )}
            </div>

            <span className="text-xs text-slate-500">
              {commissions.length} {language === 'bn' ? 'টি কমিশন রেকর্ড' : 'ledger entries'}
            </span>
          </div>

          {/* Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            {isLoading ? (
              <TableSkeleton cols={8} rows={6} />
            ) : commissions.length === 0 ? (
              <EmptyState
                icon={DollarSign}
                title={language === 'bn' ? 'কোন কমিশন রেকর্ড নেই' : 'No commissions recorded'}
                description={
                  language === 'bn'
                    ? 'পেমেন্ট সম্পন্ন হলে স্বয়ংক্রিয়ভাবে কমিশন লেজারে হিসাবভুক্ত হবে।'
                    : 'Commissions accrue automatically when payments are recorded.'
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/90 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-3.5 py-3 w-8">
                        <input
                          type="checkbox"
                          checked={
                            selectedCommissionIds.size > 0 &&
                            selectedCommissionIds.size ===
                              commissions.filter((c) => c.status === 'pending').length
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCommissionIds(
                                new Set(
                                  commissions.filter((c) => c.status === 'pending').map((c) => c.id)
                                )
                              );
                            } else {
                              setSelectedCommissionIds(new Set());
                            }
                          }}
                          className="w-3.5 h-3.5 rounded text-[#0DA54F] focus:ring-[#0DA54F]"
                        />
                      </th>
                      <th className="px-3.5 py-3">Code & Kind</th>
                      <th className="px-3.5 py-3">Date</th>
                      <th className="px-3.5 py-3">Referrer</th>
                      <th className="px-3.5 py-3">Patient</th>
                      <th className="px-3.5 py-3 text-right">Base Amount</th>
                      <th className="px-3.5 py-3 text-right">Applied Rate</th>
                      <th className="px-3.5 py-3 text-right">Net Amount</th>
                      <th className="px-3.5 py-3 text-center">Status</th>
                      <th className="px-3.5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {commissions.map((c) => {
                      const isChecked = selectedCommissionIds.has(c.id);
                      return (
                        <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-3.5 py-3">
                            {c.status === 'pending' ? (
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleSelectCommission(c.id)}
                                className="w-3.5 h-3.5 rounded text-[#0DA54F] focus:ring-[#0DA54F]"
                              />
                            ) : null}
                          </td>

                          <td className="px-3.5 py-3">
                            <div className="font-mono font-bold text-slate-800">
                              {c.commissionCode}
                            </div>
                            {c.kind === 'reversal' ? (
                              <span className="inline-flex px-1.5 py-0.2 text-[9px] font-bold uppercase rounded bg-rose-100 text-rose-700">
                                Reversal
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-mono">
                                Accrual
                              </span>
                            )}
                          </td>

                          <td className="px-3.5 py-3 text-slate-500 tabular-nums">
                            {formatDateDhaka(c.createdAt)}
                          </td>

                          <td className="px-3.5 py-3">
                            <div className="font-semibold text-slate-800">{c.referrerName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{c.referrerCode}</div>
                          </td>

                          <td className="px-3.5 py-3">
                            <div className="text-slate-800">{c.patientName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{c.patientCode}</div>
                          </td>

                          <td className="px-3.5 py-3 text-right font-mono tabular-nums text-slate-600">
                            {formatBDT(c.baseAmount)}
                          </td>

                          <td className="px-3.5 py-3 text-right text-slate-600">
                            {c.appliedCalculationType === 'percentage'
                              ? `${c.appliedRate}%`
                              : `৳ ${c.appliedRate}`}
                          </td>

                          <td
                            className={`px-3.5 py-3 text-right font-mono font-bold tabular-nums ${
                              c.netAmount < 0 ? 'text-rose-600' : 'text-emerald-700'
                            }`}
                          >
                            {formatBDT(c.netAmount)}
                          </td>

                          <td className="px-3.5 py-3 text-center">
                            <span
                              className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full capitalize ${
                                c.status === 'paid'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : c.status === 'approved'
                                  ? 'bg-blue-100 text-blue-800'
                                  : c.status === 'adjusted'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {c.status}
                            </span>
                          </td>

                          <td className="px-3.5 py-3 text-right">
                            {c.status === 'pending' && canApprove && (
                              <button
                                onClick={async () => {
                                  await api.commissions.approve([c.id]);
                                  addToast({
                                    type: 'success',
                                    title: 'Commission Approved',
                                    description: `${c.commissionCode} ready for payout`,
                                  });
                                  loadAllData();
                                }}
                                className="px-2 py-1 text-[11px] font-semibold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                              >
                                {language === 'bn' ? 'অনুমোদন' : 'Approve'}
                              </button>
                            )}
                            {c.status === 'paid' && c.payoutNumber && (
                              <span className="text-[10px] font-mono text-slate-400">
                                {c.payoutNumber}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: COMMISSION RULES */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          {/* Immutability Notice Banner */}
          <div className="p-4 rounded-xl bg-purple-50/70 border border-purple-200/70 flex items-start gap-3 text-xs text-purple-950">
            <Scale className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-sm block mb-0.5">
                {language === 'bn'
                  ? 'কমিশন রুলস এবং পয়েন্ট-ইন-টাইম স্ন্যাপশট নীতি'
                  : 'Commission Calculation Engine & Immutable Snapshot Guarantee'}
              </span>
              <p className="text-purple-900 leading-relaxed">
                {language === 'bn'
                  ? 'প্রতিটি কমিশন রেকর্ডের সময় তৎক্ষণাৎ প্রযোজ্য রুলের মান (Calculation Type, Rate, Basis, Cap) স্থায়ীভাবে স্ন্যাপশট হিসেবে সংরক্ষণ করা হয়। পরবর্তীতে রুল সম্পাদনা বা নিষ্ক্রিয় করা হলেও পূর্ববর্তী অর্জিত কমিশনের মান সম্পূর্ণ অপরিবর্তিত থাকে।'
                  : 'Each accrued commission creates an immutable snapshot of applied rule values at calculation time. Subsequent edits to commission rules apply strictly to future realized payments, guaranteeing zero historical accounting distortion.'}
              </p>
            </div>
          </div>

          {/* Rules Cards / Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`p-4 rounded-xl border bg-white shadow-xs flex flex-col justify-between ${
                  rule.isActive ? 'border-slate-200' : 'border-slate-200/50 opacity-75'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-purple-100 text-purple-800 font-mono">
                      {rule.ruleCode}
                    </span>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-semibold rounded-full capitalize ${
                        rule.isActive
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {rule.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 mb-1">{rule.ruleName}</h3>
                  {rule.description && (
                    <p className="text-xs text-slate-500 mb-3">{rule.description}</p>
                  )}

                  <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-3">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Target Referrer:</span>
                      <span className="font-semibold capitalize text-slate-800">
                        {rule.referrerType}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-400">Commission Rate:</span>
                      <span className="font-bold text-emerald-700">
                        {rule.calculationType === 'percentage'
                          ? `${rule.rateValue}% of ${rule.basis}`
                          : `${formatBDT(rule.rateValue)} Flat`}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-400">Min Base Required:</span>
                      <span className="font-mono text-slate-700">
                        {formatBDT(rule.minBaseAmount)}
                      </span>
                    </div>

                    {rule.maxCommissionAmount && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Max Cap:</span>
                        <span className="font-mono font-bold text-amber-700">
                          {formatBDT(rule.maxCommissionAmount)}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between">
                      <span className="text-slate-400">Withholding Tax (AIT):</span>
                      <span className="text-slate-800">{rule.withholdingTaxPercent}%</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-400">Refund Policy:</span>
                      <span className="capitalize text-slate-700">{rule.refundPolicy}</span>
                    </div>

                    {rule.firstPurchaseOnly && (
                      <div className="pt-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-800 rounded-md">
                          <Sparkles className="w-2.5 h-2.5" /> First Purchase Only
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 text-[10px] text-slate-400 flex items-center justify-between mt-3">
                  <span>Valid: {rule.validFrom}</span>
                  {rule.validTo ? <span>Until: {rule.validTo}</span> : <span>Open-ended</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 4: PAYOUTS HISTORY */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'payouts' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            {isLoading ? (
              <TableSkeleton cols={7} rows={5} />
            ) : payouts.length === 0 ? (
              <EmptyState
                icon={CreditCard}
                title={language === 'bn' ? 'কোন পে-আউট রেকর্ড নেই' : 'No payout settlements yet'}
                description={
                  language === 'bn'
                    ? 'অনুমোদিত কমিশন নিষ্পত্তির মাধ্যমে পে-আউট তৈরি করুন।'
                    : 'Create payout batches from approved commissions in the referrers directory.'
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/90 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Payout Number</th>
                      <th className="px-4 py-3">Paid Date</th>
                      <th className="px-4 py-3">Referrer</th>
                      <th className="px-4 py-3">Payment Reference</th>
                      <th className="px-4 py-3 text-right">Gross</th>
                      <th className="px-4 py-3 text-right">Tax Withheld</th>
                      <th className="px-4 py-3 text-right">Net Paid</th>
                      <th className="px-4 py-3">Authorized By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payouts.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-slate-900">
                          {p.payoutNumber}
                          <div className="text-[10px] font-normal text-slate-400 capitalize">
                            {p.payoutMethod}
                          </div>
                        </td>

                        <td className="px-4 py-3 text-slate-500 tabular-nums">
                          {p.paidDate}
                        </td>

                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-800">{p.referrerName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{p.referrerCode}</div>
                        </td>

                        <td className="px-4 py-3 font-mono text-slate-700">
                          {p.paymentReference}
                          {p.notes && (
                            <div className="text-[10px] text-slate-400 truncate max-w-xs">{p.notes}</div>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                          {formatBDT(p.grossAmount)}
                        </td>

                        <td className="px-4 py-3 text-right font-mono tabular-nums text-amber-700">
                          {formatBDT(p.withholdingAmount)}
                        </td>

                        <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-emerald-700">
                          {formatBDT(p.netPayoutAmount)}
                        </td>

                        <td className="px-4 py-3 text-slate-600">
                          {p.authorizedByName}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Global Referral Modals */}
      <AddReferrerModal
        isOpen={isAddReferrerOpen}
        onClose={() => setIsAddReferrerOpen(false)}
        onSuccess={loadAllData}
      />

      <ReferrerDetailModal
        referrerId={selectedDetailReferrerId}
        isOpen={Boolean(selectedDetailReferrerId)}
        onClose={() => setSelectedDetailReferrerId(null)}
        onOpenPayout={(refId) => setSelectedPayoutReferrerId(refId)}
      />

      <CreatePayoutModal
        referrerId={selectedPayoutReferrerId}
        isOpen={Boolean(selectedPayoutReferrerId)}
        onClose={() => setSelectedPayoutReferrerId(null)}
        onSuccess={loadAllData}
      />

      <CommissionRuleModal
        isOpen={isRuleModalOpen}
        onClose={() => setIsRuleModalOpen(false)}
        onSuccess={loadAllData}
      />
    </div>
  );
};
