import React, { useState, useEffect, useCallback } from 'react';
import {
  Package,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  XCircle,
  Sparkles,
  Calendar,
  Layers,
  ArrowRight,
  RefreshCw,
  X,
  Check,
  Undo2,
  ShieldAlert,
} from 'lucide-react';
import { packagesApi } from '../../api/packages.js';
import type {
  PatientPackageDto,
  PackageSessionLedgerEntryDto,
  RemainingHandling,
} from '@suoxi/shared-types';
import { useI18n } from '../../i18n/I18nContext.js';
import { useAuth } from '../../context/AuthContext.js';
import { AssignPackageModal } from './AssignPackageModal.js';

interface PatientPackagesViewProps {
  patientId: string;
  patientName?: string;
}

export const PatientPackagesView: React.FC<PatientPackagesViewProps> = ({
  patientId,
  patientName,
}) => {
  const { lang } = useI18n();
  const isBn = lang === 'bn';
  const { user } = useAuth();

  const [loading, setLoading] = useState<boolean>(true);
  const [packages, setPackages] = useState<PatientPackageDto[]>([]);
  const [selectedPkgId, setSelectedPkgId] = useState<string | null>(null);
  const [showAssignModal, setShowAssignModal] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Renewal Modal
  const [showRenewModal, setShowRenewModal] = useState<boolean>(false);
  const [renewingPkg, setRenewingPkg] = useState<PatientPackageDto | null>(null);
  const [renewPurchaseDate, setRenewPurchaseDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [renewStartDate, setRenewStartDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [renewPrice, setRenewPrice] = useState<string>('');
  const [renewing, setRenewing] = useState<boolean>(false);

  // Cancellation Modal
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [cancellingPkg, setCancellingPkg] = useState<PatientPackageDto | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [cancelHandling, setCancelHandling] = useState<RemainingHandling>('forfeited');
  const [cancelRefundRef, setCancelRefundRef] = useState<string>('');
  const [cancelNotes, setCancelNotes] = useState<string>('');
  const [cancelling, setCancelling] = useState<boolean>(false);

  // Reverse Deduction Modal
  const [showReverseModal, setShowReverseModal] = useState<boolean>(false);
  const [reversingEntry, setReversingEntry] = useState<PackageSessionLedgerEntryDto | null>(null);
  const [reverseReason, setReverseReason] = useState<string>('');
  const [reversing, setReversing] = useState<boolean>(false);

  const loadPackages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await packagesApi.listPatientPackages(patientId);
      setPackages(list);
      if (list.length > 0 && !selectedPkgId) {
        setSelectedPkgId(list[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load patient packages:', err);
      setError(err.message || 'Failed to load patient packages');
    } finally {
      setLoading(false);
    }
  }, [patientId, selectedPkgId]);

  useEffect(() => {
    loadPackages();
  }, [loadPackages]);

  const activePackage = packages.find((p) => p.id === selectedPkgId) || packages[0];

  const handleOpenRenew = (pkg: PatientPackageDto) => {
    setRenewingPkg(pkg);
    setRenewPrice(pkg.priceSold);
    setShowRenewModal(true);
  };

  const handleRenewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renewingPkg) return;

    try {
      setRenewing(true);
      await packagesApi.renewPackage(renewingPkg.id, {
        purchaseDate: renewPurchaseDate,
        startDate: renewStartDate,
        priceSold: renewPrice ? parseFloat(renewPrice) : undefined,
      });
      setShowRenewModal(false);
      await loadPackages();
    } catch (err: any) {
      alert(err.message || 'Failed to renew package');
    } finally {
      setRenewing(false);
    }
  };

  const handleOpenCancel = (pkg: PatientPackageDto) => {
    setCancellingPkg(pkg);
    setCancelReason('');
    setCancelHandling('forfeited');
    setCancelRefundRef('');
    setCancelNotes('');
    setShowCancelModal(true);
  };

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingPkg || !cancelReason.trim()) return;

    try {
      setCancelling(true);
      await packagesApi.cancelPackage(cancellingPkg.id, {
        reason: cancelReason.trim(),
        remainingHandling: cancelHandling,
        refundReference: cancelRefundRef.trim() || undefined,
        notes: cancelNotes.trim() || undefined,
      });
      setShowCancelModal(false);
      await loadPackages();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel package');
    } finally {
      setCancelling(false);
    }
  };

  const handleOpenReverse = (entry: PackageSessionLedgerEntryDto) => {
    setReversingEntry(entry);
    setReverseReason('');
    setShowReverseModal(true);
  };

  const handleReverseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversingEntry || !reverseReason.trim()) return;

    try {
      setReversing(true);
      await packagesApi.reverseDeduction(reversingEntry.id, {
        reason: reverseReason.trim(),
      });
      setShowReverseModal(false);
      await loadPackages();
    } catch (err: any) {
      alert(err.message || 'Failed to reverse session deduction');
    } finally {
      setReversing(false);
    }
  };

  const getStatusBadge = (status: PatientPackageDto['status']) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {isBn ? 'সক্রিয়' : 'Active'}
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Check className="w-3.5 h-3.5" />
            {isBn ? 'সম্পন্ন' : 'Completed'}
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
            <Clock className="w-3.5 h-3.5" />
            {isBn ? 'মেয়াদোত্তীর্ণ' : 'Expired'}
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <XCircle className="w-3.5 h-3.5" />
            {isBn ? 'বাতিল' : 'Cancelled'}
          </span>
        );
      case 'renewed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <RotateCcw className="w-3.5 h-3.5" />
            {isBn ? 'নবায়িত' : 'Renewed'}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-brand-text flex items-center gap-2">
            <Package className="w-5 h-5 text-brand-primary" />
            {isBn ? 'রোগীর ট্রিটমেন্ট প্যাকেজসমূহ' : 'Patient Treatment Packages'}
          </h2>
          <p className="text-xs text-brand-muted mt-0.5">
            {isBn
              ? 'ক্রয়কৃত বান্ডেল সেশন, অবশিষ্ট ব্যালেন্স ও অপরিবর্তনীয় সেশন লেজার।'
              : 'Assigned treatment bundles, real-time remaining sessions, and immutable session ledger.'}
          </p>
        </div>

        <button
          onClick={() => setShowAssignModal(true)}
          className="px-3.5 py-2 bg-brand-primary hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          {isBn ? 'প্যাকেজ বরাদ্দ করুন' : 'Assign Package'}
        </button>
      </div>

      {loading ? (
        <div className="h-48 bg-slate-100 rounded-xl animate-pulse" />
      ) : packages.length === 0 ? (
        <div className="bg-white border border-brand-border rounded-xl p-8 text-center shadow-xs">
          <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <h4 className="text-sm font-semibold text-brand-text">
            {isBn ? 'কোনো প্যাকেজ নেই' : 'No Packages Assigned'}
          </h4>
          <p className="text-xs text-brand-muted mt-1">
            {isBn
              ? 'এই রোগীর কোনো সক্রিয় বা পূর্ববর্তী প্যাকেজ নেই।'
              : 'This patient has no active or past treatment packages.'}
          </p>
          <button
            onClick={() => setShowAssignModal(true)}
            className="mt-4 px-3.5 py-1.5 bg-brand-primary text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            {isBn ? 'এখনই বরাদ্দ করুন' : 'Assign Package Now'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Packages Sidebar / Tabs */}
          <div className="lg:col-span-1 space-y-3">
            <span className="text-xs font-semibold text-brand-muted uppercase tracking-wider block mb-2">
              {isBn ? 'প্যাকেজ তালিকা' : 'Assigned Packages'} ({packages.length})
            </span>
            {packages.map((pkg) => {
              const isSelected = pkg.id === activePackage?.id;
              const totalSessions = pkg.items.reduce((acc, it) => acc + it.initialSessions, 0);
              const completedSessions = pkg.items.reduce((acc, it) => acc + it.completedSessions, 0);
              const remainingSessions = pkg.items.reduce((acc, it) => acc + it.remainingSessions, 0);

              return (
                <div
                  key={pkg.id}
                  onClick={() => setSelectedPkgId(pkg.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-emerald-50/50 border-brand-primary shadow-xs'
                      : 'bg-white border-brand-border hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs font-mono font-medium text-slate-500">
                        {pkg.packageCode}
                      </span>
                      <h4 className="text-sm font-bold text-brand-text mt-0.5">
                        {pkg.packageName}
                      </h4>
                    </div>
                    {getStatusBadge(pkg.status)}
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3">
                    <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                      <span>{isBn ? 'অগ্রগতি' : 'Progress'}</span>
                      <span className="font-mono">
                        {completedSessions} / {totalSessions} ({remainingSessions} left)
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-brand-primary h-1.5 rounded-full transition-all"
                        style={{
                          width: `${totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-brand-muted pt-2 border-t border-slate-100">
                    <span>Exp: {pkg.expiryDate}</span>
                    <span className="font-mono font-semibold text-brand-text">
                      ৳ {Number(pkg.priceSold).toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active Package Details & Ledger */}
          {activePackage && (
            <div className="lg:col-span-2 space-y-6">
              {/* Package Card */}
              <div className="bg-white border border-brand-border rounded-xl p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-brand-border">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-brand-text">
                        {activePackage.packageName}
                      </h3>
                      {getStatusBadge(activePackage.status)}
                    </div>
                    <span className="text-xs font-mono text-brand-muted">
                      {activePackage.packageCode} • Assigned by {activePackage.assignedByName} on{' '}
                      {activePackage.purchaseDate}
                    </span>
                  </div>

                  {/* Actions: Renew / Cancel */}
                  <div className="flex items-center gap-2">
                    {activePackage.status === 'active' && (
                      <>
                        <button
                          onClick={() => handleOpenRenew(activePackage)}
                          className="px-3 py-1.5 border border-brand-border rounded-lg text-xs font-semibold text-brand-text hover:bg-slate-50 flex items-center gap-1 shadow-2xs"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-brand-primary" />
                          {isBn ? 'নবায়ন' : 'Renew'}
                        </button>
                        <button
                          onClick={() => handleOpenCancel(activePackage)}
                          className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-50 flex items-center gap-1 shadow-2xs"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          {isBn ? 'বাতিল' : 'Cancel'}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Balance Progress Overview */}
                <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                  <div>
                    <div className="text-xs text-brand-muted uppercase tracking-wider font-medium">
                      {isBn ? 'মোট সেশন' : 'Total Sessions'}
                    </div>
                    <div className="text-xl font-bold font-mono text-brand-text mt-0.5">
                      {activePackage.items.reduce((acc, it) => acc + it.initialSessions, 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-brand-muted uppercase tracking-wider font-medium">
                      {isBn ? 'সম্পন্ন' : 'Completed'}
                    </div>
                    <div className="text-xl font-bold font-mono text-emerald-600 mt-0.5">
                      {activePackage.items.reduce((acc, it) => acc + it.completedSessions, 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-brand-muted uppercase tracking-wider font-medium">
                      {isBn ? 'অবশিষ্ট' : 'Remaining'}
                    </div>
                    <div className="text-xl font-bold font-mono text-brand-primary mt-0.5">
                      {activePackage.items.reduce((acc, it) => acc + it.remainingSessions, 0)}
                    </div>
                  </div>
                </div>

                {/* Per-Service Item Breakdown */}
                <div>
                  <h4 className="text-xs font-semibold text-brand-text uppercase tracking-wider mb-2">
                    {isBn ? 'সেবা ও সেশন বিভাজন' : 'Included Services Entitlement'}:
                  </h4>
                  <div className="space-y-2">
                    {activePackage.items.map((it) => (
                      <div
                        key={it.id}
                        className="flex items-center justify-between text-xs bg-white border border-slate-200 p-2.5 rounded-lg"
                      >
                        <span className="font-semibold text-brand-text">
                          {it.serviceName} ({it.serviceCode})
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-brand-muted">
                            Completed: <strong className="text-slate-700 font-mono">{it.completedSessions}</strong>
                          </span>
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-brand-primary font-mono font-bold border border-emerald-200">
                            {it.remainingSessions} remaining
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cancellation Banner if cancelled */}
                {activePackage.cancellation && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-red-800">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                      {isBn ? 'প্যাকেজ বাতিল সংক্রান্ত তথ্য' : 'Package Cancellation Record'}:
                    </div>
                    <p className="text-red-700">
                      Reason: <strong>{activePackage.cancellation.reason}</strong>
                    </p>
                    <p className="text-red-600">
                      Remaining handling: <strong className="capitalize">{activePackage.cancellation.remainingHandling}</strong>
                      {activePackage.cancellation.refundReference && ` (${activePackage.cancellation.refundReference})`}
                    </p>
                  </div>
                )}
              </div>

              {/* Append-Only Session Ledger Table */}
              <div className="bg-white border border-brand-border rounded-xl p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-brand-text flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-brand-primary" />
                      {isBn ? 'অপরিবর্তনীয় সেশন লেজার' : 'Append-Only Session Ledger'}
                    </h4>
                    <span className="text-xs text-brand-muted">
                      {isBn
                        ? 'হার্ড রুল ৫ ও ৬: কোনো সেশন দুবার কাটা হবে না, কোনো সারি মোছা হবে না।'
                        : 'Hard Rules 5 & 6: Deductions are unique per session; corrections are reversal rows.'}
                    </span>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono border border-slate-200">
                    {activePackage.ledger?.length || 0} entries
                  </span>
                </div>

                {(!activePackage.ledger || activePackage.ledger.length === 0) ? (
                  <div className="p-6 text-center text-xs text-brand-muted border border-dashed border-slate-200 rounded-lg">
                    {isBn ? 'এই প্যাকেজ থেকে এখনো কোনো সেশন কর্তন করা হয়নি।' : 'No session deductions or adjustments recorded yet.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-600 border-y border-slate-200 font-semibold">
                        <tr>
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Type</th>
                          <th className="py-2.5 px-3">Change</th>
                          <th className="py-2.5 px-3">Session</th>
                          <th className="py-2.5 px-3">Reason / Details</th>
                          <th className="py-2.5 px-3">Staff</th>
                          <th className="py-2.5 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activePackage.ledger.map((entry) => {
                          const isDeduction = entry.entryType === 'deduction';
                          const isReversed = activePackage.ledger?.some(
                            (x) => x.originalLedgerId === entry.id
                          );

                          return (
                            <tr key={entry.id} className="hover:bg-slate-50/60">
                              <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap font-mono">
                                {new Date(entry.createdAt).toLocaleDateString()}
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                                    isDeduction
                                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  }`}
                                >
                                  {entry.entryType}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold">
                                <span
                                  className={
                                    entry.changeQuantity < 0
                                      ? 'text-red-600'
                                      : 'text-emerald-600'
                                  }
                                >
                                  {entry.changeQuantity > 0 ? `+${entry.changeQuantity}` : entry.changeQuantity}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-700">
                                {entry.treatmentSessionCode || '—'}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">
                                {entry.reason}
                                {entry.originalLedgerId && (
                                  <span className="block text-slate-400 font-mono text-3xs">
                                    Reverses: {entry.originalLedgerId}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                                {entry.createdByName || entry.createdBy}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                {isDeduction && !isReversed ? (
                                  <button
                                    onClick={() => handleOpenReverse(entry)}
                                    className="px-2 py-1 text-3xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded border border-amber-200 inline-flex items-center gap-1 shadow-2xs"
                                  >
                                    <Undo2 className="w-3 h-3" />
                                    Reverse
                                  </button>
                                ) : isReversed ? (
                                  <span className="text-3xs text-slate-400 italic font-mono">
                                    Reversed
                                  </span>
                                ) : null}
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
        </div>
      )}

      {/* Assign Package Modal */}
      <AssignPackageModal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        patientId={patientId}
        patientName={patientName}
        onAssigned={async () => {
          await loadPackages();
        }}
      />

      {/* Renew Modal */}
      {showRenewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border border-brand-border rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-brand-border pb-3">
              <h3 className="text-base font-bold text-brand-text flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-brand-primary" />
                {isBn ? 'প্যাকেজ নবায়ন করুন' : 'Renew Patient Package'}
              </h3>
              <button
                onClick={() => setShowRenewModal(false)}
                className="text-brand-muted hover:text-brand-text"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRenewSubmit} className="space-y-3">
              <p className="text-xs text-brand-muted">
                {isBn
                  ? `প্যাকেজ ${renewingPkg?.packageName} (${renewingPkg?.packageCode}) এর ভিত্তিতে একটি নতুন ধারাবাহিক প্যাকেজ তৈরি হবে।`
                  : `Creates a new linked active package based on ${renewingPkg?.packageName} (${renewingPkg?.packageCode}).`}
              </p>

              <div>
                <label className="block text-xs font-semibold text-brand-text mb-1">
                  {isBn ? 'নবায়ন ক্রয়ের তারিখ' : 'Renewal Purchase Date'} *
                </label>
                <input
                  type="date"
                  required
                  value={renewPurchaseDate}
                  onChange={(e) => setRenewPurchaseDate(e.target.value)}
                  className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-brand-primary focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-text mb-1">
                  {isBn ? 'শুরুর তারিখ' : 'Start Date'} *
                </label>
                <input
                  type="date"
                  required
                  value={renewStartDate}
                  onChange={(e) => setRenewStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-brand-primary focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-text mb-1">
                  {isBn ? 'নবায়ন মূল্য (টাকা ৳)' : 'Renewal Price (BDT ৳)'} *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={renewPrice}
                  onChange={(e) => setRenewPrice(e.target.value)}
                  className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-brand-primary focus:outline-hidden"
                />
              </div>

              <div className="pt-3 border-t border-brand-border flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRenewModal(false)}
                  className="px-4 py-2 border border-brand-border rounded-lg text-xs font-semibold text-brand-text hover:bg-slate-50"
                >
                  {isBn ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={renewing}
                  className="px-4 py-2 bg-brand-primary hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                >
                  {renewing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  {isBn ? 'নবায়ন নিশ্চিত করুন' : 'Confirm Renewal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border border-brand-border rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-brand-border pb-3">
              <h3 className="text-base font-bold text-red-600 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                {isBn ? 'প্যাকেজ বাতিল করুন' : 'Cancel Treatment Package'}
              </h3>
              <button
                onClick={() => setShowCancelModal(false)}
                className="text-brand-muted hover:text-brand-text"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCancelSubmit} className="space-y-3">
              <p className="text-xs text-brand-muted">
                {isBn
                  ? `প্যাকেজ ${cancellingPkg?.packageName} বাতিল করতে কারণ এবং অবশিষ্ট সেশন ব্যবস্থাপনার বিকল্প নির্বাচন করুন।`
                  : `Cancelling ${cancellingPkg?.packageName} requires manager approval and remaining session handling.`}
              </p>

              <div>
                <label className="block text-xs font-semibold text-brand-text mb-1">
                  {isBn ? 'বাতিলের কারণ' : 'Cancellation Reason'} *
                </label>
                <textarea
                  rows={2}
                  required
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Patient medical contraindication, relocation..."
                  className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm focus:ring-2 focus:ring-brand-primary focus:outline-hidden resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-text mb-1">
                  {isBn ? 'অবশিষ্ট সেশনের ব্যবস্থা' : 'Remaining Sessions Handling'} *
                </label>
                <select
                  value={cancelHandling}
                  onChange={(e) => setCancelHandling(e.target.value as RemainingHandling)}
                  className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm text-brand-text focus:ring-2 focus:ring-brand-primary focus:outline-hidden"
                >
                  <option value="forfeited">Forfeited (বাজেয়াপ্ত / শূন্য করা)</option>
                  <option value="refunded">Refunded (টাকা ফেরত)</option>
                  <option value="credited">Credited (ক্লিনিক অ্যাকাউন্টে ক্রেডিট)</option>
                  <option value="transferred">Transferred (অন্য রোগীকে হস্তান্তর)</option>
                </select>
              </div>

              {cancelHandling === 'refunded' && (
                <div>
                  <label className="block text-xs font-semibold text-brand-text mb-1">
                    {isBn ? 'রিফান্ড রেফারেন্স' : 'Refund Reference / TrxID'}
                  </label>
                  <input
                    type="text"
                    value={cancelRefundRef}
                    onChange={(e) => setCancelRefundRef(e.target.value)}
                    placeholder="e.g. bKash TrxID or Cash Receipt No."
                    className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm focus:ring-2 focus:ring-brand-primary focus:outline-hidden"
                  />
                </div>
              )}

              <div className="pt-3 border-t border-brand-border flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="px-4 py-2 border border-brand-border rounded-lg text-xs font-semibold text-brand-text hover:bg-slate-50"
                >
                  {isBn ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={cancelling}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                >
                  {cancelling ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )}
                  {isBn ? 'বাতিল কার্যকর করুন' : 'Execute Cancellation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reverse Deduction Modal */}
      {showReverseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border border-brand-border rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-brand-border pb-3">
              <h3 className="text-base font-bold text-amber-700 flex items-center gap-2">
                <Undo2 className="w-5 h-5 text-amber-600" />
                {isBn ? 'সেশন কর্তন রিভার্স করুন' : 'Reverse Session Deduction'}
              </h3>
              <button
                onClick={() => setShowReverseModal(false)}
                className="text-brand-muted hover:text-brand-text"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReverseSubmit} className="space-y-3">
              <p className="text-xs text-brand-muted">
                {isBn
                  ? `লেজার এন্ট্রি ${reversingEntry?.id} এর জন্য একটি রিভার্সাল সারি যুক্ত হবে এবং প্যাকেজের অবশিষ্ট ব্যালেন্স ১ সেশন বৃদ্ধি পাবে।`
                  : `Appends a reversal row pointing to ${reversingEntry?.id} and restores +1 session to the remaining allowance.`}
              </p>

              <div>
                <label className="block text-xs font-semibold text-brand-text mb-1">
                  {isBn ? 'রিভার্সালের কারণ' : 'Reason for Reversal'} *
                </label>
                <textarea
                  rows={2}
                  required
                  value={reverseReason}
                  onChange={(e) => setReverseReason(e.target.value)}
                  placeholder="e.g. Incomplete therapy session, client reacted to serum..."
                  className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm focus:ring-2 focus:ring-brand-primary focus:outline-hidden resize-none"
                />
              </div>

              <div className="pt-3 border-t border-brand-border flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowReverseModal(false)}
                  className="px-4 py-2 border border-brand-border rounded-lg text-xs font-semibold text-brand-text hover:bg-slate-50"
                >
                  {isBn ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={reversing}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                >
                  {reversing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  {isBn ? 'রিভার্সাল নিশ্চিত করুন' : 'Confirm Reversal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
