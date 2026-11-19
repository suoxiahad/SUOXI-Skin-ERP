import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Plus,
  RefreshCw,
  Phone,
  AlertTriangle,
  Calendar,
  FileText,
  CreditCard,
  Package,
  X,
  Building2,
  Clock,
  ShieldAlert,
  Percent,
  ArrowLeft,
  User,
  CheckCircle2,
  Copy,
  Edit3,
  Mail,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';
import { api } from '../../../api/client.ts';
import type { Patient } from '../../../types/index.ts';
import { formatDateDhaka, formatBDT } from '../../../utils/format.ts';
import { TableSkeleton } from '../../common/Skeleton.tsx';
import { EmptyState } from '../../common/EmptyState.tsx';
import { AssignPatientReferrerModal } from '../referrals/AssignPatientReferrerModal.tsx';
import { PatientEditModal } from './PatientEditModal.tsx';

export const PatientListView: React.FC = () => {
  const {
    selectedPatientId,
    setSelectedPatientId,
    setIsQuickBookOpen,
    setIsPatientRegistrationOpen,
    addToast,
    language,
    navigate,
  } = useApp();
  const isBn = language === 'bn';
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Selected patient detail drawer data
  const [patientDetail, setPatientDetail] = useState<any>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [portalAccount, setPortalAccount] = useState<any>(null);
  const [portalLinkInfo, setPortalLinkInfo] = useState<{ url: string; token: string } | null>(null);
  const [isPortalBusy, setIsPortalBusy] = useState(false);
  const [currentReferral, setCurrentReferral] = useState<any>(null);
  const [isAssignReferrerOpen, setIsAssignReferrerOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [patientToEdit, setPatientToEdit] = useState<Patient | null>(null);

  const fetchPatients = async () => {
    setIsLoading(true);
    try {
      const list = await api.patients.list(searchQuery);
      setPatients(list);
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Failed to load patients',
        description: (err as Error).message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, [searchQuery]);

  // Listen to cross-component patient updates
  useEffect(() => {
    const handlePatientUpdate = (e: any) => {
      fetchPatients();
      if (selectedPatientId) {
        api.patients
          .getById(selectedPatientId)
          .then((data) => setPatientDetail(data))
          .catch(() => {});
      }
    };
    window.addEventListener('patients-updated', handlePatientUpdate);
    return () => window.removeEventListener('patients-updated', handlePatientUpdate);
  }, [selectedPatientId]);

  // Reset selected patient when navigating away / exiting Patient Directory
  useEffect(() => {
    return () => {
      setSelectedPatientId(null);
    };
  }, [setSelectedPatientId]);

  useEffect(() => {
    if (selectedPatientId) {
      setIsDetailLoading(true);
      setPortalLinkInfo(null);
      setCurrentReferral(null);
      api.patients
        .getById(selectedPatientId)
        .then((data) => {
          setPatientDetail(data);
          api.patients
            .getPortalAccount(selectedPatientId)
            .then((acc) => setPortalAccount(acc))
            .catch(() => setPortalAccount(null));

          api.referrals
            .getPatientReferralHistory(selectedPatientId)
            .then((res) => setCurrentReferral(res.current))
            .catch(() => setCurrentReferral(null));
        })
        .catch((err) => {
          console.error('Failed to load patient record:', err);
          addToast({
            type: 'error',
            title: 'Patient Profile Notice',
            description: err?.message || 'Failed to load patient record',
          });
        })
        .finally(() => {
          setIsDetailLoading(false);
        });
    } else {
      setPatientDetail(null);
      setPortalAccount(null);
      setPortalLinkInfo(null);
      setCurrentReferral(null);
    }
  }, [selectedPatientId]);

  // =========================================================================
  // STANDALONE PAGE: PATIENT RECORD & CLINICAL FILE (একক পেজ)
  // =========================================================================
  if (selectedPatientId) {
    if (isDetailLoading || !patientDetail) {
      return (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-4 border-b border-slate-200">
            <button
              type="button"
              onClick={() => setSelectedPatientId(null)}
              className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{isBn ? 'রোগী তালিকায় ফিরুন' : 'Back to Patient Directory'}</span>
            </button>
            <span className="text-xs text-slate-500">
              {isBn ? 'রোগীর বিবরণ লোড হচ্ছে...' : 'Loading patient records...'}
            </span>
          </div>
          <div className="p-8 bg-white rounded-2xl border border-slate-200 text-center">
            <TableSkeleton rows={6} />
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6 animate-in fade-in duration-150">
        {/* Standalone Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelectedPatientId(null)}
              className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-2 shadow-2xs cursor-pointer transition-all hover:border-[#0DA54F]/40"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{isBn ? 'রোগী তালিকায় ফিরুন' : 'Back to Patient Directory'}</span>
            </button>
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>{isBn ? 'রোগী ডিরেক্টরি' : 'CRM Patient Directory'}</span>
                <span>/</span>
                <span className="font-mono text-emerald-700 font-bold">{patientDetail.patient.patientIdCode}</span>
              </div>
              <h1 className="text-xl font-bold text-slate-900 mt-0.5 flex items-center gap-2">
                <span>{patientDetail.patient.name}</span>
                {patientDetail.patient.nameBn && (
                  <span className="text-sm font-normal text-slate-500">({patientDetail.patient.nameBn})</span>
                )}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setPatientToEdit(patientDetail.patient);
                setIsEditModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:text-[#0DA54F] rounded-xl transition-all shadow-2xs cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5 text-[#0DA54F]" />
              <span>{isBn ? 'তথ্য পরিবর্তন / এডিট' : 'Edit Patient'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsAssignReferrerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all shadow-2xs cursor-pointer"
            >
              <Percent className="w-3.5 h-3.5 text-[#0DA54F]" />
              <span>{currentReferral ? (isBn ? 'রেফারার পরিবর্তন' : 'Change Referrer') : (isBn ? 'রেফারার যুক্ত করুন' : 'Assign Referrer')}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsQuickBookOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0DA54F] hover:bg-[#0b8841] text-white rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer"
            >
              <Calendar className="w-4 h-4" />
              <span>{isBn ? 'সরাসরি অ্যাপয়েন্টমেন্ট বুকিং' : 'Book Appointment'}</span>
            </button>
          </div>
        </div>

        {/* Duplicate Flag Alert (Hard Rule 9) */}
        {patientDetail.patient.isFlaggedDuplicate && (
          <div className="p-4 bg-amber-50/80 border border-amber-300 rounded-2xl text-xs text-amber-900 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-amber-950">
                Hard Rule 9 Enforced: Flagged for Human Review (Never Auto-Merged)
              </span>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                {patientDetail.patient.duplicateReason || 'Shared phone number detected with existing clinical file.'}
              </p>
            </div>
          </div>
        )}

        {/* Patient Hero Profile Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
            {/* Column 1: Avatar & Identity */}
            <div className="flex items-center gap-4 md:col-span-2">
              <div className="w-16 h-16 rounded-2xl bg-[#0DA54F]/10 border border-[#0DA54F]/20 flex items-center justify-center text-[#0DA54F] font-bold text-2xl shrink-0">
                {patientDetail.patient.name ? patientDetail.patient.name.charAt(0).toUpperCase() : <User className="w-8 h-8" />}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                    {patientDetail.patient.patientIdCode}
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700">
                    {patientDetail.patient.gender} • {patientDetail.patient.age || 32} yrs
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-[#0DA54F] border border-emerald-100 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Verified Patient
                  </span>
                </div>
                <div className="text-xs text-slate-600 flex flex-wrap items-center gap-3 pt-1">
                  <span className="flex items-center gap-1 font-mono">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    {patientDetail.patient.phone}
                  </span>
                  {patientDetail.patient.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      {patientDetail.patient.email}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    Dhanmondi Main Branch
                  </span>
                </div>
              </div>
            </div>

            {/* Column 2: Outstanding Financial Balance */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Outstanding Balance
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className={`text-xl font-bold font-mono ${patientDetail.patient.dueAmount && patientDetail.patient.dueAmount > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>
                  {formatBDT(patientDetail.patient.dueAmount || 0)}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  {patientDetail.patient.dueAmount && patientDetail.patient.dueAmount > 0 ? 'Pending Payment' : 'All Clear'}
                </span>
              </div>
            </div>

            {/* Column 3: Active Treatment Sessions */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Active Packages
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-xl font-bold font-mono text-[#0DA54F]">
                  {patientDetail.packages?.length || 0}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  {patientDetail.packages?.reduce((acc: number, p: any) => acc + (p.remainingSessions || 0), 0) || 0} sessions remaining
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Clinical & Financial Grid (2 Columns) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT COLUMN: Clinical Treatments & Packages */}
          <div className="space-y-6">
            {/* Prescriptions & Clinical Consultations */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#0DA54F]" />
                  <span>Prescriptions & Clinical Consultations ({patientDetail.prescriptions?.length || 0})</span>
                </h3>
              </div>

              {patientDetail.prescriptions?.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  No prescriptions recorded yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {patientDetail.prescriptions.map((rx: any) => (
                    <div key={rx.id} className="p-4 bg-slate-50 hover:bg-slate-50/80 rounded-xl border border-slate-200 text-xs space-y-2 transition-colors">
                      <div className="flex justify-between items-center font-bold text-slate-800">
                        <span className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-800">{rx.prescriptionCode}</span>
                        <span className="text-[#0DA54F] font-semibold">Dr. {rx.doctorName}</span>
                      </div>
                      <p className="text-slate-700 leading-relaxed font-medium">Diagnosis: {rx.diagnosis}</p>
                      {rx.nextSessionDate && (
                        <p className="text-emerald-700 font-semibold text-[11px] flex items-center gap-1.5 pt-1 border-t border-slate-200/60">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Prescribed Next Session: {formatDateDhaka(rx.nextSessionDate)}</span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Treatment Packages */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Package className="w-4 h-4 text-[#0DA54F]" />
                  <span>Packages & Remaining Sessions ({patientDetail.packages?.length || 0})</span>
                </h3>
              </div>

              {patientDetail.packages?.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  No active treatment packages found for this patient.
                </div>
              ) : (
                <div className="space-y-3">
                  {patientDetail.packages.map((pkg: any) => {
                    const completed = pkg.completedSessions || 0;
                    const total = pkg.totalSessions || 1;
                    const pct = Math.min(100, Math.round((completed / total) * 100));
                    const perSession = pkg.perSessionPriceBDT || (total > 0 ? pkg.priceBDT / total : 0);
                    const paid = pkg.paidAmountBDT ?? 0;
                    const due = pkg.dueAmountBDT ?? Math.max(0, (pkg.priceBDT || 0) - paid);
                    const unlocked = pkg.unlockedSessions ?? Math.min(total, Math.floor((paid + 0.01) / (perSession || 1)));

                    return (
                      <div key={pkg.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2.5">
                        <div className="flex justify-between items-start font-bold text-slate-900">
                          <div>
                            <span className="text-sm block">{pkg.packageName}</span>
                            <span className="text-[11px] text-slate-500 font-mono mt-0.5">
                              Total: {formatBDT(pkg.priceBDT)} • {formatBDT(perSession)}/session
                            </span>
                          </div>
                          <span className="text-xs font-mono font-bold text-[#0DA54F] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 shrink-0">
                            {pkg.remainingSessions} sessions left
                          </span>
                        </div>

                        {/* Financial Ledger Mini-Bar */}
                        <div className="flex items-center justify-between text-[11px] bg-white p-2 rounded-lg border border-slate-200/80">
                          <div>
                            <span className="text-slate-400">Paid: </span>
                            <span className="font-bold text-emerald-600 font-mono">{formatBDT(paid)}</span>
                          </div>
                          <div>
                            <span className="text-slate-400">Due: </span>
                            <span className={`font-bold font-mono ${due > 0 ? 'text-amber-600' : 'text-slate-500'}`}>
                              {due > 0 ? formatBDT(due) : '৳ 0'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400">Unlocked: </span>
                            <span className="font-bold text-slate-700">{unlocked}/{total}</span>
                          </div>
                        </div>

                        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                          <div className="bg-[#0DA54F] h-1.5 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                        </div>

                        <div className="flex justify-between items-center text-[11px] pt-0.5">
                          <span className="text-slate-500">
                            Completed {completed} of {total} sessions ({pct}%)
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              navigate('/packages/sessions');
                            }}
                            className="text-[#0DA54F] hover:text-[#0b8841] font-bold text-xs hover:underline cursor-pointer flex items-center gap-1"
                          >
                            <span>{due > 0 ? 'Pay / Deduct' : 'Deduct Session'}</span>
                            <span>&rarr;</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Financial, Referrer & Portal */}
          <div className="space-y-6">
            {/* Billing Invoices */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-[#0DA54F]" />
                  <span>Billing Invoices & Collections ({patientDetail.invoices?.length || 0})</span>
                </h3>
              </div>

              {patientDetail.invoices?.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  No billing invoices issued.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {patientDetail.invoices.map((inv: any) => (
                    <div key={inv.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs flex justify-between items-center hover:bg-slate-100/60 transition-colors">
                      <div>
                        <p className="font-bold text-slate-800 font-mono">{inv.invoiceNumber}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{formatDateDhaka(inv.createdAt)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-900 font-mono">{formatBDT(inv.totalAmountBDT)}</p>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md inline-block mt-0.5 ${inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                          {inv.status === 'paid' ? 'Paid in Full' : `Due: ${formatBDT(inv.dueAmountBDT)}`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Referral Attribution */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Percent className="w-4 h-4 text-[#0DA54F]" />
                  <span>Referral Attribution</span>
                </h3>
                {currentReferral ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    Active
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500">
                    Unassigned
                  </span>
                )}
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-3">
                {currentReferral ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-sm">{currentReferral.referrerName}</span>
                      <span className="font-mono text-xs text-slate-500 font-semibold bg-white px-2 py-0.5 rounded border border-slate-200">{currentReferral.referrerCode}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 capitalize">
                      {currentReferral.referrerType} • Attributed on {formatDateDhaka(currentReferral.effectiveFrom)}
                    </div>
                    {currentReferral.attributionReason && (
                      <div className="text-[11px] text-slate-600 italic bg-white p-2 rounded-lg border border-slate-100 mt-1">
                        "{currentReferral.attributionReason}"
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-slate-500 text-xs">
                    No referrer is currently attributed to this patient.
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setIsAssignReferrerOpen(true)}
                  className="w-full py-2 px-3 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-700 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Percent className="w-3.5 h-3.5 text-[#0DA54F]" />
                  <span>{currentReferral ? 'Change Referrer' : 'Assign Referrer'}</span>
                </button>
              </div>
            </div>

            {/* Patient Portal Account */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-emerald-700" />
                  <span>Patient Portal Account (portal.manage)</span>
                </h3>
                {portalAccount && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize border ${
                      portalAccount.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : portalAccount.status === 'pending_setup'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}
                  >
                    {portalAccount.status}
                  </span>
                )}
              </div>

              {portalAccount ? (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Login Identifier:</span>
                    <span className="font-mono font-bold text-slate-800">
                      {portalAccount.loginIdentifier}
                    </span>
                  </div>

                  {portalAccount.lastLoginAt && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Last Login:</span>
                      <span className="text-slate-700">{formatDateDhaka(portalAccount.lastLoginAt)}</span>
                    </div>
                  )}

                  {portalLinkInfo && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1.5">
                      <span className="text-[11px] font-bold text-emerald-900 block">
                        Generated Setup Link (Expires in 24 hours):
                      </span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          readOnly
                          value={`${window.location.origin}${portalLinkInfo.url}`}
                          className="w-full text-xs font-mono bg-white px-2.5 py-1.5 rounded-lg border border-emerald-300"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}${portalLinkInfo.url}`);
                            addToast({ type: 'success', title: 'Link copied to clipboard' });
                          }}
                          className="px-3 py-1.5 text-xs bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-semibold cursor-pointer shrink-0"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isPortalBusy}
                      onClick={async () => {
                        setIsPortalBusy(true);
                        try {
                          const res = await api.patients.sendPortalLink(patientDetail.patient.id, 'setup', 'sms');
                          setPortalLinkInfo({ url: res.setupUrl, token: res.token });
                          addToast({ type: 'success', title: 'Setup link generated successfully' });
                        } catch (err: any) {
                          addToast({ type: 'error', title: 'Failed to generate link', description: err.message });
                        } finally {
                          setIsPortalBusy(false);
                        }
                      }}
                      className="flex-1 py-2 px-3 bg-white border border-slate-300 rounded-xl text-slate-700 text-xs font-semibold hover:bg-slate-100 cursor-pointer text-center shadow-2xs"
                    >
                      Send Setup Link
                    </button>

                    <button
                      type="button"
                      disabled={isPortalBusy || portalAccount.status === 'deactivated'}
                      onClick={async () => {
                        setIsPortalBusy(true);
                        try {
                          await api.patients.deactivatePortalAccount(patientDetail.patient.id);
                          setPortalAccount((prev: any) => ({ ...prev, status: 'deactivated' }));
                          addToast({ type: 'warning', title: 'Portal account deactivated' });
                        } catch (err: any) {
                          addToast({ type: 'error', title: 'Failed to deactivate', description: err.message });
                        } finally {
                          setIsPortalBusy(false);
                        }
                      }}
                      className="py-2 px-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold hover:bg-rose-100 cursor-pointer"
                    >
                      Deactivate
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-3">
                  <p className="text-slate-500 text-xs">
                    No patient portal account is provisioned for this patient yet.
                  </p>
                  <button
                    type="button"
                    disabled={isPortalBusy}
                    onClick={async () => {
                      setIsPortalBusy(true);
                      try {
                        const res = await api.patients.createPortalAccount(patientDetail.patient.id);
                        setPortalAccount(res.account);
                        setPortalLinkInfo({ url: res.setupUrl, token: res.setupToken });
                        addToast({ type: 'success', title: 'Portal account created with setup link' });
                      } catch (err: any) {
                        addToast({ type: 'error', title: 'Failed to provision account', description: err.message });
                      } finally {
                        setIsPortalBusy(false);
                      }
                    }}
                    className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span>Provision Patient Portal Account</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Assign / Change Patient Referrer Modal */}
        <AssignPatientReferrerModal
          patientId={selectedPatientId}
          patientName={patientDetail?.patient?.name}
          isOpen={isAssignReferrerOpen}
          onClose={() => setIsAssignReferrerOpen(false)}
          onSuccess={() => {
            api.referrals
              .getPatientReferralHistory(selectedPatientId)
              .then((res) => setCurrentReferral(res.current))
              .catch(() => setCurrentReferral(null));
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            CRM · Patients
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Registered patients directory, clinical history, and treatment records
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPatientRegistrationOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 rounded-xl transition-all shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Patient Registration</span>
          </button>
          <button
            type="button"
            onClick={() => setIsQuickBookOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0DA54F] hover:bg-[#0a8740] rounded-xl transition-all shadow-xs"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Book Appointment</span>
          </button>
        </div>
      </div>

      {/* Hard Rule 9 Banner */}
      <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl flex items-start gap-2.5">
        <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900">
          <span className="font-bold">Hard Rule #9: Human-Review Duplicate Policy: </span>
          Potential duplicate patients sharing phone numbers or national IDs are flagged for clinic manager review. The system NEVER auto-merges clinical records to avoid medical record corruption.
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between shadow-2xs">
        <div className="relative w-full max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search patient name, +880 phone, or SX ID..."
            className="pl-8 pr-3 py-1 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#0DA54F] w-full"
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton rows={4} cols={6} />
      ) : patients.length === 0 ? (
        <EmptyState
          title="No patients found"
          description="Try searching with a different phone number or name."
        />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/90 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Patient ID</th>
                  <th className="py-3 px-4">Patient Name</th>
                  <th className="py-3 px-4">Phone Number</th>
                  <th className="py-3 px-4">Gender & Age</th>
                  <th className="py-3 px-4">Skin Type</th>
                  <th className="py-3 px-4">Flag / Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {patients.map((p) => (
                  <tr
                    key={p.id}
                    className={`h-12 hover:bg-slate-50/80 transition-colors ${
                      selectedPatientId === p.id ? 'bg-[#0DA54F]/5' : ''
                    }`}
                  >
                    <td className="py-2.5 px-4 font-mono font-semibold text-slate-700">
                      {p.patientIdCode}
                    </td>

                    <td className="py-2.5 px-4 font-semibold text-slate-900">
                      <span>{p.name}</span>
                    </td>

                    <td className="py-2.5 px-4 font-mono text-slate-600">
                      {p.phone}
                    </td>

                    <td className="py-2.5 px-4 text-slate-700 capitalize">
                      {p.gender} {p.age ? `, ${p.age} yrs` : ''}
                    </td>

                    <td className="py-2.5 px-4 text-[#0DA54F] font-medium capitalize">
                      {p.skinType || 'Combination'}
                    </td>

                    {/* Hard Rule 9: Duplicate flag */}
                    <td className="py-2.5 px-4">
                      {p.isFlaggedDuplicate ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          Duplicate Flagged (Review)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
                          Active File
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setPatientToEdit(p);
                            setIsEditModalOpen(true);
                          }}
                          title={isBn ? 'তথ্য পরিবর্তন / এডিট' : 'Edit Patient'}
                          className="p-1.5 text-slate-600 hover:text-[#0DA54F] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedPatientId(p.id)}
                          className="px-2.5 py-1 text-xs font-semibold text-white bg-[#0DA54F] hover:bg-[#0a8740] rounded-md transition-colors cursor-pointer"
                        >
                          View Records
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Patient Edit Modal */}
      <PatientEditModal
        isOpen={isEditModalOpen}
        patient={patientToEdit}
        onClose={() => {
          setIsEditModalOpen(false);
          setPatientToEdit(null);
        }}
        onSuccess={(updated) => {
          fetchPatients();
          if (selectedPatientId === updated.id || patientDetail?.patient?.id === updated.id) {
            setPatientDetail((prev: any) => (prev ? { ...prev, patient: updated } : prev));
          }
        }}
      />

      {/* Assign / Change Patient Referrer Modal */}
      {selectedPatientId && (
        <AssignPatientReferrerModal
          patientId={selectedPatientId}
          patientName={patientDetail?.patient?.fullName}
          isOpen={isAssignReferrerOpen}
          onClose={() => setIsAssignReferrerOpen(false)}
          onSuccess={() => {
            api.referrals
              .getPatientReferralHistory(selectedPatientId)
              .then((res) => setCurrentReferral(res.current))
              .catch(() => setCurrentReferral(null));
          }}
        />
      )}
    </div>
  );
};
