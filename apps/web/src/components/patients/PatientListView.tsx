import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  RefreshCw,
  Phone,
  Calendar,
  AlertTriangle,
  GitMerge,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  CreditCard,
  Building2,
  Lock,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { patientsApi } from '../../api/patients.js';
import { useI18n } from '../../i18n/I18nContext.js';
import { useAuth } from '../../context/AuthContext.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { StatusBadge } from '../common/StatusBadge.js';
import { RegisterPatientDrawer } from './RegisterPatientDrawer.js';
import { PatientDetailDrawer } from './PatientDetailDrawer.js';
import { NewAppointmentDrawer } from '../appointments/NewAppointmentDrawer.js';
import type {
  PatientDto,
  RestrictedCallCenterPatientDto,
  PatientDuplicateCandidateDto,
} from '@suoxi/shared-types';

export const PatientListView: React.FC = () => {
  const { lang, t } = useI18n();
  const { user, activeBranch } = useAuth();
  const { has } = usePermissions();

  // Active view tab: 'list' or 'duplicates'
  const [activeTab, setActiveTab] = useState<'list' | 'duplicates'>('list');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [hasDueFilter, setHasDueFilter] = useState<boolean>(false);

  // Data State
  const [patients, setPatients] = useState<Array<PatientDto | RestrictedCallCenterPatientDto>>([]);
  const [duplicateCandidates, setDuplicateCandidates] = useState<PatientDuplicateCandidateDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drawers and Modals
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [bookingPatient, setBookingPatient] = useState<PatientDto | null>(null);
  const [isBookingOpen, setIsBookingOpen] = useState(false);

  // Merge Modal State
  const [mergeCandidate, setMergeCandidate] = useState<PatientDuplicateCandidateDto | null>(null);
  const [mergeNotes, setMergeNotes] = useState('');
  const [isMerging, setIsMerging] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Debounce search query (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load Patients
  const loadPatients = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await patientsApi.list({
        q: debouncedQuery || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        hasDue: hasDueFilter ? true : undefined,
      });
      setPatients(res || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load patients list');
    } finally {
      setIsLoading(false);
    }
  }, [debouncedQuery, statusFilter, hasDueFilter]);

  // Load Duplicate Candidates
  const loadDuplicateCandidates = useCallback(async () => {
    try {
      const candidates = await patientsApi.getDuplicateCandidates();
      setDuplicateCandidates(candidates || []);
    } catch {
      // Ignore if user lacks permission
    }
  }, []);

  useEffect(() => {
    loadPatients();
    loadDuplicateCandidates();
  }, [loadPatients, loadDuplicateCandidates]);

  // Handle Duplicate Resolution
  const handleResolveDuplicate = async (
    candidateId: string,
    action: 'not_duplicate' | 'confirm' | 'merge',
    notes?: string
  ) => {
    try {
      await patientsApi.resolveDuplicate(candidateId, action, notes);
      setActionSuccessMsg(
        action === 'merge'
          ? 'Profiles merged successfully. Historical appointments and records retained.'
          : action === 'not_duplicate'
          ? 'Marked as not duplicate.'
          : 'Duplicate status confirmed.'
      );
      setTimeout(() => setActionSuccessMsg(null), 4000);
      setMergeCandidate(null);
      setMergeNotes('');
      loadDuplicateCandidates();
      loadPatients();
    } catch (err: any) {
      setError(err.message || 'Failed to resolve duplicate candidate');
    }
  };

  const isFullDto = (p: any): p is PatientDto => {
    return p && 'city' in p && 'primaryMobile' in p;
  };

  const pendingDuplicatesCount = duplicateCandidates.filter((c) => c.status === 'pending').length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner / Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-panel p-5 sm:p-6 rounded-2xl bg-white border border-brand-border shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-muted">
              {activeBranch?.name || 'Dhaka Central Branch'}
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-xs text-brand-primary font-mono bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
              patient.view
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-brand-text mt-0.5">
            {lang === 'bn' ? 'CRM · Patient / সকল রোগীর তালিকা' : 'CRM · Patient / Patient Directory'}
          </h1>
          <p className="text-xs sm:text-sm text-brand-muted mt-1 max-w-2xl">
            {lang === 'bn'
              ? 'নিবন্ধিত সকল রোগীর তালিকা, স্বাস্থ্য ও মেডিকেল হিস্ট্রি, পূর্ববর্তী অ্যাপয়েন্টমেন্ট ও চিকিৎসা ইতিহাস, ডকুমেন্ট ও সরাসরি বুকিং'
              : 'Unified patient demographic records with normalized Bangladesh mobile formatting, real-time duplicate alerts, and instant booking.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsRegisterOpen(true)}
            className="px-4 py-2.5 bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer focus-ring"
          >
            <UserPlus className="w-4 h-4" />
            <span>{lang === 'bn' ? 'নতুন রোগী নিবন্ধন' : 'Register New Patient'}</span>
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] bg-emerald-800/40 rounded text-emerald-100 font-mono">
              Alt+P
            </kbd>
          </button>
        </div>
      </div>

      {/* Action Success Toast */}
      {actionSuccessMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center justify-between shadow-xs animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccessMsg(null)}
            className="text-emerald-700 hover:text-emerald-900"
          >
            ✕
          </button>
        </div>
      )}

      {/* Navigation Tabs (All Patients vs Duplicate Review Queue) */}
      <div className="flex border-b border-brand-border bg-white rounded-t-xl px-4 text-xs font-semibold text-slate-600">
        <button
          type="button"
          onClick={() => setActiveTab('list')}
          className={`py-3.5 px-4 border-b-2 font-medium transition-colors flex items-center gap-2 cursor-pointer ${
            activeTab === 'list'
              ? 'border-brand-primary text-brand-primary font-bold'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>{lang === 'bn' ? 'সকল রোগী' : 'All Patients'}</span>
          <span className="px-2 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-600">
            {patients.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('duplicates')}
          className={`py-3.5 px-4 border-b-2 font-medium transition-colors flex items-center gap-2 cursor-pointer ${
            activeTab === 'duplicates'
              ? 'border-brand-primary text-brand-primary font-bold'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <GitMerge className="w-4 h-4 text-amber-600" />
          <span>{lang === 'bn' ? 'ডুপ্লিকেট পর্যালোচনা কিউ' : 'Duplicate Review Queue'}</span>
          {pendingDuplicatesCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] bg-amber-500 text-white font-bold animate-pulse">
              {pendingDuplicatesCount}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'list' ? (
        /* PATIENTS LIST VIEW */
        <div className="space-y-4">
          {/* Search & Filter Toolbar */}
          <div className="p-4 rounded-xl bg-white border border-brand-border shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative w-full md:w-96">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  lang === 'bn'
                    ? 'নাম, মোবাইল (+8801...), বা কোড দিয়ে খুঁজুন...'
                    : 'Search by name, mobile (+8801...), or patient code...'
                }
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus-ring bg-slate-50/60"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
              {/* Status Filter */}
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 focus-ring"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive</option>
                  <option value="merged">Merged</option>
                </select>
              </div>

              {/* Outstanding Due Filter */}
              <button
                type="button"
                onClick={() => setHasDueFilter(!hasDueFilter)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                  hasDueFilter
                    ? 'bg-amber-500 text-white border-amber-600 font-bold shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Outstanding Dues (৳)</span>
              </button>

              {/* Refresh Button */}
              <button
                type="button"
                onClick={() => loadPatients()}
                className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                title="Refresh table"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="glass-panel rounded-2xl bg-white border border-brand-border overflow-hidden shadow-xs">
            {error && (
              <div className="p-4 bg-rose-50 border-b border-rose-200 text-xs text-rose-700 flex items-center justify-between">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => loadPatients()}
                  className="font-bold underline hover:no-underline ml-3"
                >
                  Retry
                </button>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-brand-border font-semibold">
                  <tr>
                    <th className="py-3 px-4">Patient Code & Name</th>
                    <th className="py-3 px-4">Contact & Location</th>
                    <th className="py-3 px-4">Demographics</th>
                    <th className="py-3 px-4">Financial & Visits</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 text-brand-text">
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="py-4 px-4">
                          <div className="h-4 bg-slate-200 rounded w-32 mb-1" />
                          <div className="h-3 bg-slate-100 rounded w-20" />
                        </td>
                        <td className="py-4 px-4">
                          <div className="h-4 bg-slate-200 rounded w-28 mb-1" />
                          <div className="h-3 bg-slate-100 rounded w-16" />
                        </td>
                        <td className="py-4 px-4">
                          <div className="h-4 bg-slate-200 rounded w-20" />
                        </td>
                        <td className="py-4 px-4">
                          <div className="h-4 bg-slate-200 rounded w-24" />
                        </td>
                        <td className="py-4 px-4">
                          <div className="h-5 bg-slate-200 rounded-full w-16" />
                        </td>
                        <td className="py-4 px-4 text-right">
                          <div className="h-8 bg-slate-200 rounded-lg w-20 ml-auto" />
                        </td>
                      </tr>
                    ))
                  ) : patients.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <span className="font-medium block text-slate-600">No patients found</span>
                        <span className="text-[11px] text-slate-400 mt-1 block">
                          Try searching with another query or register a new patient profile.
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsRegisterOpen(true)}
                          className="mt-4 px-4 py-2 bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-semibold rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Register Patient</span>
                        </button>
                      </td>
                    </tr>
                  ) : (
                    patients.map((p) => {
                      const full = isFullDto(p);
                      return (
                        <tr
                          key={p.id}
                          className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                          onClick={() => {
                            setSelectedPatientId(p.id);
                            setIsDetailOpen(true);
                          }}
                        >
                          {/* Name and Code */}
                          <td className="py-3.5 px-4 font-medium">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center font-bold text-brand-primary text-xs shrink-0">
                                {p.fullName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-bold text-slate-900 group-hover:text-brand-primary transition-colors flex items-center gap-1.5">
                                  <span>{p.fullName}</span>
                                  {p.fullNameBn && (
                                    <span className="text-slate-400 font-normal font-bengali text-[11px]">
                                      ({p.fullNameBn})
                                    </span>
                                  )}
                                </div>
                                <span className="font-mono text-[11px] text-brand-primary bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-100">
                                  {p.patientCode}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Contact */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5 font-mono text-slate-800 font-semibold">
                              <Phone className="w-3 h-3 text-brand-primary" />
                              <span>{p.primaryMobile}</span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {full ? [p.area, p.city].filter(Boolean).join(', ') : 'Dhaka'}
                            </div>
                          </td>

                          {/* Demographics */}
                          <td className="py-3.5 px-4 text-slate-600">
                            <div className="capitalize">
                              {p.gender}
                              {p.approximateAge ? `, ${p.approximateAge}y` : ''}
                            </div>
                            {full && p.bloodGroup && (
                              <span className="text-[11px] text-slate-400 font-mono">
                                Blood: {p.bloodGroup}
                              </span>
                            )}
                          </td>

                          {/* Financials & Last Visit */}
                          <td className="py-3.5 px-4">
                            {full && p.dueAmount && p.dueAmount > 0 ? (
                              <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-[11px]">
                                ৳{p.dueAmount.toLocaleString()} Due
                              </span>
                            ) : (
                              <span className="text-emerald-700 text-[11px] font-medium">
                                Clear
                              </span>
                            )}
                            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>Visit: {p.lastVisit || 'First Visit'}</span>
                            </div>
                          </td>

                          {/* Status */}
                          <td className="py-3.5 px-4">
                            <StatusBadge
                              status={
                                p.status === 'active'
                                  ? 'CONFIRMED'
                                  : p.status === 'merged'
                                  ? 'MERGED'
                                  : 'CANCELLED'
                              }
                              size="sm"
                            />
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => {
                                setBookingPatient(p as PatientDto);
                                setIsBookingOpen(true);
                              }}
                              className="px-2.5 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100 text-xs font-semibold transition-all inline-flex items-center gap-1 cursor-pointer mr-1.5"
                              title={lang === 'bn' ? 'সরাসরি অ্যাপয়েন্টমেন্ট বুকিং' : 'Book Appointment'}
                            >
                              <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                              <span>{lang === 'bn' ? 'বুকিং' : 'Book'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setSelectedPatientId(p.id);
                                setIsDetailOpen(true);
                              }}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-brand-primary hover:border-brand-primary hover:bg-emerald-50 text-xs font-medium transition-all inline-flex items-center gap-1 cursor-pointer"
                            >
                              <span>{lang === 'bn' ? 'প্রোফাইল' : 'View'}</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-3.5 bg-slate-50 border-t border-brand-border flex items-center justify-between text-[11px] text-brand-muted">
              <span>Showing {patients.length} patient records</span>
              <span>All changes tracked in immutable audit log</span>
            </div>
          </div>
        </div>
      ) : (
        /* DUPLICATE REVIEW QUEUE VIEW */
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-amber-950">
                Hard Rule 9 & Bangladesh Identity Protocol:
              </span>
              <p className="mt-0.5">
                Potential duplicate patient profiles are held in this queue for human review. Profiles are NEVER automatically merged.
                When a merge is authorized, the duplicate profile is marked as &apos;merged&apos; and its pointer links to the primary profile. No historical clinical records, prescriptions, or financial invoices are ever deleted.
              </p>
            </div>
          </div>

          {duplicateCandidates.length === 0 ? (
            <div className="glass-panel p-12 text-center rounded-2xl bg-white border border-brand-border">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-slate-800">No Pending Duplicate Candidates</h3>
              <p className="text-xs text-slate-400 mt-1">
                The duplicate queue is completely clear. All registered profiles are clean and verified.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {duplicateCandidates.map((candidate) => (
                <div
                  key={candidate.id}
                  className="glass-panel p-5 rounded-2xl bg-white border border-brand-border shadow-2xs hover:border-amber-300 transition-colors"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left: Comparison Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                      {/* Primary Patient */}
                      <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-1.5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 flex items-center justify-between">
                          <span>Primary Patient (Retained)</span>
                          <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-800">
                            {candidate.primaryPatient.patientCode}
                          </span>
                        </div>
                        <div className="font-bold text-sm text-slate-900">
                          {candidate.primaryPatient.fullName}
                        </div>
                        <div className="text-xs font-mono text-slate-700 flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{candidate.primaryPatient.primaryMobile}</span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Gender: {candidate.primaryPatient.gender} • Age: {candidate.primaryPatient.approximateAge || '—'}
                        </div>
                      </div>

                      {/* Duplicate Patient */}
                      <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/40 space-y-1.5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 flex items-center justify-between">
                          <span>Duplicate Candidate</span>
                          <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-amber-200 text-amber-800">
                            {candidate.duplicatePatient.patientCode}
                          </span>
                        </div>
                        <div className="font-bold text-sm text-slate-900">
                          {candidate.duplicatePatient.fullName}
                        </div>
                        <div className="text-xs font-mono text-slate-700 flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-amber-600" />
                          <span>{candidate.duplicatePatient.primaryMobile}</span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Gender: {candidate.duplicatePatient.gender} • Age: {candidate.duplicatePatient.approximateAge || '—'}
                        </div>
                      </div>
                    </div>

                    {/* Right: Match Reason & Actions */}
                    <div className="flex flex-col justify-between gap-3 lg:w-64 border-t lg:border-t-0 lg:border-l border-slate-100 pt-3 lg:pt-0 lg:pl-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold uppercase text-slate-400">Confidence:</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              candidate.matchConfidence === 'high'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {candidate.matchConfidence}
                          </span>
                        </div>

                        <div className="mt-1.5 text-xs text-slate-600">
                          <span className="text-slate-400 text-[11px]">Reason: </span>
                          <span className="font-medium">
                            {candidate.matchReasons.join(', ')}
                          </span>
                        </div>
                      </div>

                      {candidate.status === 'pending' ? (
                        <div className="flex flex-col gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => setMergeCandidate(candidate)}
                            className="w-full px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-2xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <GitMerge className="w-3.5 h-3.5" />
                            <span>Authorize Merge</span>
                          </button>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleResolveDuplicate(candidate.id, 'not_duplicate')}
                              className="flex-1 px-2.5 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                            >
                              Not Duplicate
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResolveDuplicate(candidate.id, 'confirm')}
                              className="flex-1 px-2.5 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                            >
                              Confirm
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-2 rounded bg-slate-50 border border-slate-200 text-center text-xs font-semibold text-slate-600 capitalize">
                          Status: {candidate.status.replace('_', ' ')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Merge Confirmation Dialog */}
      {mergeCandidate && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-brand-border space-y-4 animate-scale-up">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <GitMerge className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Confirm Non-Destructive Patient Merge
                </h3>
                <p className="text-xs text-slate-500">
                  Enforces Hard Rule 9 (Zero Hard Deletes)
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 space-y-2">
              <div className="font-semibold">
                Merge duplicate record into primary patient:
              </div>
              <div className="grid grid-cols-2 gap-2 text-slate-800 font-mono text-[11px] bg-white p-2.5 rounded-lg border border-amber-200">
                <div>
                  <span className="text-slate-400 block font-sans">Primary Target:</span>
                  <span className="font-bold text-emerald-700">
                    {mergeCandidate.primaryPatient.patientCode} ({mergeCandidate.primaryPatient.fullName})
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-sans">Duplicate to Merge:</span>
                  <span className="font-bold text-rose-700">
                    {mergeCandidate.duplicatePatient.patientCode} ({mergeCandidate.duplicatePatient.fullName})
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-amber-800">
                • Duplicate will be marked as status=&apos;merged&apos;.
                <br />
                • All historical visits, prescriptions, and invoices remain intact.
                <br />
                • Merging is logged in audit_events with staff user ID and IP address.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Resolution Notes / Staff Reason:
              </label>
              <textarea
                rows={2}
                value={mergeNotes}
                onChange={(e) => setMergeNotes(e.target.value)}
                placeholder="e.g. Confirmed same patient across visits, telephone match."
                className="w-full p-2.5 rounded-xl border border-slate-300 text-xs focus-ring"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setMergeCandidate(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isMerging}
                onClick={async () => {
                  setIsMerging(true);
                  await handleResolveDuplicate(mergeCandidate.id, 'merge', mergeNotes);
                  setIsMerging(false);
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <GitMerge className="w-3.5 h-3.5" />
                <span>{isMerging ? 'Merging...' : 'Confirm and Execute Merge'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Patient Registration Drawer */}
      <RegisterPatientDrawer
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        onSuccess={(newPatient) => {
          setIsRegisterOpen(false);
          loadPatients();
          loadDuplicateCandidates();
          setSelectedPatientId(newPatient.id);
          setIsDetailOpen(true);
        }}
        onOpenExisting={(patientId) => {
          setIsRegisterOpen(false);
          setSelectedPatientId(patientId);
          setIsDetailOpen(true);
        }}
      />

      {/* Patient Detail Drawer */}
      <PatientDetailDrawer
        patientId={selectedPatientId}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedPatientId(null);
        }}
        onPatientUpdated={() => {
          loadPatients();
        }}
        onQuickBookAppointment={(p) => {
          setIsDetailOpen(false);
          setBookingPatient(p as PatientDto);
          setIsBookingOpen(true);
        }}
      />

      {/* Appointment Drawer triggered from Patient profile */}
      <NewAppointmentDrawer
        isOpen={isBookingOpen}
        onClose={() => {
          setIsBookingOpen(false);
          setBookingPatient(null);
        }}
        preselectedPatient={bookingPatient}
        onSuccess={() => {
          setIsBookingOpen(false);
          setBookingPatient(null);
          loadPatients();
        }}
      />
    </div>
  );
};
