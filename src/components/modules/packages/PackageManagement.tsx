import React, { useState, useEffect } from 'react';
import {
  Package,
  CheckCircle,
  Plus,
  RefreshCw,
  Search,
  AlertCircle,
  Clock,
  Sparkles,
  Lock,
  Layers,
  Calendar,
  UserCheck,
  ShieldCheck,
  Percent,
  CheckCircle2,
  X,
  ChevronRight,
  ClipboardList,
  Tag,
  Flame,
  ArrowLeft,
  CreditCard,
  Banknote,
  DollarSign,
  AlertTriangle,
  Unlock,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';
import { api } from '../../../api/client.ts';
import type { TreatmentPackage, MasterPackage, PackageDeduction, Patient } from '../../../types/index.ts';
import { formatBDT, formatDateDhaka, getStatusBadgeClass } from '../../../utils/format.ts';
import { TableSkeleton } from '../../common/Skeleton.tsx';
import { EmptyState } from '../../common/EmptyState.tsx';

export const PackageManagement: React.FC = () => {
  const {
    currentUser,
    addToast,
    language,
    packageActiveTab,
    setPackageActiveTab,
    isAddPackageOpen,
    setIsAddPackageOpen,
    navigate,
  } = useApp();
  const isBn = language === 'bn';

  // Data states
  const [masterPackages, setMasterPackages] = useState<MasterPackage[]>([]);
  const [patientPackages, setPatientPackages] = useState<TreatmentPackage[]>([]);
  const [deductionsHistory, setDeductionsHistory] = useState<PackageDeduction[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Deduct Session Modal
  const [deductingPackage, setDeductingPackage] = useState<TreatmentPackage | null>(null);
  const [treatmentNotes, setTreatmentNotes] = useState('');
  const [machineSettings, setMachineSettings] = useState('');
  const [therapistName, setTherapistName] = useState(currentUser?.name || 'Lead Aesthetician');
  const [isDeducting, setIsDeducting] = useState(false);

  // Quick Installment / Advance Payment Modal (Zero-Due Protection)
  const [paymentPackage, setPaymentPackage] = useState<TreatmentPackage | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bkash' | 'card' | 'nagad'>('cash');
  const [paymentTrxRef, setPaymentTrxRef] = useState<string>('');
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [pendingDeductAfterPayment, setPendingDeductAfterPayment] = useState<TreatmentPackage | null>(null);

  // Assign Package to Patient Modal
  const [assigningMaster, setAssigningMaster] = useState<MasterPackage | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [assignInitialPayment, setAssignInitialPayment] = useState<string>('0');
  const [assignPaymentMethod, setAssignPaymentMethod] = useState<'cash' | 'bkash' | 'card' | 'nagad'>('cash');
  const [isAssigning, setIsAssigning] = useState(false);

  // Session History Modal
  const [viewHistoryPackageId, setViewHistoryPackageId] = useState<string | null>(null);

  // Form states for Add New Master Package
  const [formName, setFormName] = useState('');
  const [formNameBn, setFormNameBn] = useState('');
  const [formCategory, setFormCategory] = useState('Facial & Skin Rejuvenation');
  const [formTotalSessions, setFormTotalSessions] = useState(4);
  const [formPackagePrice, setFormPackagePrice] = useState('15000');
  const [formRegularPrice, setFormRegularPrice] = useState('18000');
  const [formValidityMonths, setFormValidityMonths] = useState(6);
  const [formMinIntervalDays, setFormMinIntervalDays] = useState(14);
  const [formDescription, setFormDescription] = useState('');
  const [formDescriptionBn, setFormDescriptionBn] = useState('');
  const [formIncludedServices, setFormIncludedServices] = useState('HydraFacial, Glow Mask, LED Therapy');
  const [isCreatingPackage, setIsCreatingPackage] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [masterList, patList, deductionsList, pts] = await Promise.all([
        api.packages.listMaster(),
        api.packages.list(),
        api.packages.getDeductions(),
        api.patients.list(),
      ]);
      setMasterPackages(masterList);
      setPatientPackages(patList);
      setDeductionsHistory(deductionsList);
      setPatients(pts);
      if (pts.length > 0 && !selectedPatientId) {
        setSelectedPatientId(pts[0].id);
      }
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Failed to load packages',
        description: (err as Error).message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Open Quick Installment Modal
  const openPaymentModal = (pkg: TreatmentPackage, defaultAmount?: number, autoDeductAfter = false) => {
    setPaymentPackage(pkg);
    const perSession = pkg.perSessionPriceBDT || (pkg.totalSessions > 0 ? pkg.priceBDT / pkg.totalSessions : 0);
    const nextSession = pkg.completedSessions + 1;
    const neededCumulative = nextSession * perSession;
    const currentPaid = pkg.paidAmountBDT || 0;
    const neededToUnlock = Math.max(0, Math.round(neededCumulative - currentPaid));

    if (defaultAmount !== undefined && defaultAmount > 0) {
      setPaymentAmount(defaultAmount);
    } else if (neededToUnlock > 0) {
      setPaymentAmount(neededToUnlock);
    } else if ((pkg.dueAmountBDT || 0) > 0) {
      setPaymentAmount(pkg.dueAmountBDT || 0);
    } else {
      setPaymentAmount(perSession);
    }
    setPaymentMethod('cash');
    setPaymentTrxRef('');
    setPendingDeductAfterPayment(autoDeductAfter ? pkg : null);
  };

  // Handle Record Package Payment (Installment/Advance)
  const handleRecordPackagePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentPackage || paymentAmount <= 0) return;

    setIsRecordingPayment(true);
    try {
      const res = await api.packages.recordInstallment(paymentPackage.id, {
        amountBDT: Number(paymentAmount),
        method: paymentMethod,
        transactionRef: paymentTrxRef.trim() || undefined,
      });

      // Update package state
      setPatientPackages((prev) =>
        prev.map((p) => (p.id === res.package.id ? res.package : p))
      );

      addToast({
        type: 'success',
        title: isBn ? 'অগ্রিম/কিস্তি পেমেন্ট সফলভাবে জমা হয়েছে!' : 'Installment Payment Recorded!',
        description: `৳ ${Number(paymentAmount).toLocaleString('en-US')} received via ${paymentMethod.toUpperCase()} (${res.payment.receiptNumber}). Unlocked Sessions: ${res.package.unlockedSessions}/${res.package.totalSessions}.`,
      });

      const updatedPkg = res.package;
      setPaymentPackage(null);

      // If user had clicked deduct when locked, prompt them to proceed with deduction now
      if (
        pendingDeductAfterPayment &&
        updatedPkg.unlockedSessions &&
        updatedPkg.unlockedSessions > updatedPkg.completedSessions
      ) {
        setPendingDeductAfterPayment(null);
        openDeductModal(updatedPkg);
      }
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Payment Failed',
        description: (err as Error).message,
      });
    } finally {
      setIsRecordingPayment(false);
    }
  };

  // Handle Deduct Session
  const openDeductModal = (pkg: TreatmentPackage) => {
    // Check if session is locked
    const perSession = pkg.perSessionPriceBDT || (pkg.totalSessions > 0 ? pkg.priceBDT / pkg.totalSessions : 0);
    const nextSession = pkg.completedSessions + 1;
    const unlocked = pkg.unlockedSessions ?? 0;

    if (pkg.completedSessions >= unlocked) {
      const neededCumulative = nextSession * perSession;
      const currentPaid = pkg.paidAmountBDT || 0;
      const needed = Math.max(0, Math.round(neededCumulative - currentPaid));
      openPaymentModal(pkg, needed, true);
      addToast({
        type: 'warning',
        title: isBn ? 'সেশন ফি অপরিশোধিত (Zero-Due Policy)' : 'Session Payment Required',
        description: isBn
          ? `সেশন #${nextSession} আনলক করতে সর্বনিম্ন ৳ ${needed.toLocaleString('en-BD')} অগ্রিম পরিশোধ করতে হবে।`
          : `Please collect minimum ৳ ${needed.toLocaleString('en-US')} advance to unlock Session #${nextSession}.`,
      });
      return;
    }

    setDeductingPackage(pkg);
    setTreatmentNotes(`Session #${pkg.completedSessions + 1} completed. Skin texture hydrated and calm.`);
    setMachineSettings('Suction Level 2.5, Red LED 15 min, Serum Boost');
    setTherapistName(currentUser?.name || 'Lead Aesthetician');
  };

  const handleDeductSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deductingPackage) return;

    setIsDeducting(true);
    try {
      const res = await api.packages.deductSession({
        packageId: deductingPackage.id,
        treatmentNotes,
        machineSettings,
        therapistName,
      });

      setPatientPackages((prev) => prev.map((p) => (p.id === res.package.id ? res.package : p)));
      setDeductionsHistory((prev) => [res.deduction, ...prev]);

      addToast({
        type: 'success',
        title: isBn ? 'সেশন সফলভাবে সম্পন্ন ও ডিডাক্ট হয়েছে!' : 'Session Deducted Successfully!',
        description: `Session #${res.package.completedSessions} logged. Remaining: ${res.package.remainingSessions}. Protected against duplicate deduction.`,
      });
      setDeductingPackage(null);
    } catch (err: any) {
      const errorMsg = err?.message || 'Session Deduction Failed';
      if (
        err?.code === 'SESSION_PAYMENT_REQUIRED' ||
        errorMsg.includes('অপরিশোধিত') ||
        errorMsg.includes('বাকি') ||
        err?.status === 402
      ) {
        const pkgToPay = deductingPackage;
        setDeductingPackage(null);
        const needed = err?.details?.neededPaymentBDT || 0;
        openPaymentModal(pkgToPay, needed, true);
        addToast({
          type: 'warning',
          title: isBn ? 'সেশন ফি অপরিশোধিত (Zero-Due Policy)' : 'Session Payment Required',
          description: errorMsg,
        });
      } else {
        addToast({
          type: 'error',
          title: 'Session Deduction Failed',
          description: errorMsg,
        });
      }
    } finally {
      setIsDeducting(false);
    }
  };

  // Handle Assign Package to Patient
  const handleAssignPackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningMaster || !selectedPatientId) return;

    const patient = patients.find((p) => p.id === selectedPatientId);
    if (!patient) return;

    setIsAssigning(true);
    try {
      const expiry = new Date();
      expiry.setMonth(expiry.getMonth() + (assigningMaster.validityMonths || 6));
      const initAmt = Number(assignInitialPayment) || 0;

      const newPkg = await api.packages.assignToPatient({
        patientId: patient.id,
        patientName: patient.name,
        packageName: assigningMaster.name,
        serviceCategory: assigningMaster.serviceCategory,
        totalSessions: assigningMaster.totalSessions,
        priceBDT: assigningMaster.packagePriceBDT,
        expiryDate: expiry.toISOString().split('T')[0],
        initialPayment:
          initAmt > 0
            ? {
                amountBDT: initAmt,
                method: assignPaymentMethod,
              }
            : undefined,
      } as any);

      setPatientPackages((prev) => [newPkg, ...prev]);
      addToast({
        type: 'success',
        title: isBn ? 'রোগীকে প্যাকেজ সফলভাবে অ্যাসাইন করা হয়েছে!' : 'Package Assigned to Patient!',
        description: `${assigningMaster.name} assigned to ${patient.name}. Balance: ${assigningMaster.totalSessions} sessions.${
          initAmt > 0 ? ` Advance Paid: ${formatBDT(initAmt)}` : ''
        }`,
      });
      setAssigningMaster(null);
      setAssignInitialPayment('0');
      navigate('/packages/sessions');
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Failed to assign package',
        description: (err as Error).message,
      });
    } finally {
      setIsAssigning(false);
    }
  };

  // Handle Create New Master Package
  const handleCreateMasterPackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      addToast({ type: 'warning', title: 'Package name is required' });
      return;
    }

    setIsCreatingPackage(true);
    try {
      const incServices = formIncludedServices.split(',').map((s) => s.trim()).filter(Boolean);
      const newMaster = await api.packages.createMaster({
        name: formName.trim(),
        nameBn: formNameBn.trim() || undefined,
        serviceCategory: formCategory,
        totalSessions: Number(formTotalSessions),
        regularPriceBDT: Number(formRegularPrice) || Number(formPackagePrice),
        packagePriceBDT: Number(formPackagePrice),
        validityMonths: Number(formValidityMonths),
        minIntervalDays: Number(formMinIntervalDays),
        description: formDescription.trim(),
        descriptionBn: formDescriptionBn.trim() || undefined,
        includedServices: incServices.length > 0 ? incServices : [formName],
      });

      setMasterPackages((prev) => [newMaster, ...prev]);
      addToast({
        type: 'success',
        title: isBn ? 'নতুন প্যাকেজ সফলভাবে তৈরি হয়েছে!' : 'New Package Created Successfully!',
        description: `Package "${newMaster.name}" is now available in the clinic master list.`,
      });

      // Reset form
      setFormName('');
      setFormNameBn('');
      setFormDescription('');
      navigate('/packages');
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Failed to create package',
        description: (err as Error).message,
      });
    } finally {
      setIsCreatingPackage(false);
    }
  };

  // Filtered lists
  const filteredMasterPackages = masterPackages.filter((pkg) => {
    if (categoryFilter !== 'all' && pkg.serviceCategory !== categoryFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      pkg.name.toLowerCase().includes(q) ||
      pkg.code.toLowerCase().includes(q) ||
      (pkg.nameBn && pkg.nameBn.includes(searchQuery)) ||
      pkg.serviceCategory.toLowerCase().includes(q)
    );
  });

  const filteredPatientPackages = patientPackages.filter((pkg) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      pkg.packageName.toLowerCase().includes(q) ||
      pkg.patientName.toLowerCase().includes(q) ||
      pkg.serviceCategory.toLowerCase().includes(q)
    );
  });

  const categories = [
    'all',
    'Facial & Skin Rejuvenation',
    'Laser & Energy Devices',
    'Hair & Scalp Therapy',
    'Chemical Peels',
    'Combination Packages',
  ];

  // =========================================================================
  // STANDALONE PAGE: ADD NEW MASTER PACKAGE (একক পেজ)
  // =========================================================================
  if (isAddPackageOpen || packageActiveTab === 'create') {
    return (
      <div className="space-y-6 animate-in fade-in duration-150">
        {/* Standalone Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/packages')}
              className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-2 shadow-2xs cursor-pointer transition-all hover:border-[#0DA54F]/40"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{isBn ? 'প্যাকেজ ডিরেক্টরিতে ফিরুন' : 'Back to Package Directory'}</span>
            </button>
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>{isBn ? 'প্যাকেজ ও সেশন' : 'Package Catalog'}</span>
                <span>/</span>
                <span className="font-semibold text-[#0DA54F]">{isBn ? 'নতুন প্যাকেজ কনফিগার' : 'Add New Package'}</span>
              </div>
              <h1 className="text-xl font-bold text-slate-900 mt-0.5">
                {isBn ? 'নতুন ক্লিনিক্যাল প্যাকেজ তৈরি করুন' : 'Create New Treatment Package'}
              </h1>
            </div>
          </div>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 sm:p-8 max-w-3xl mx-auto space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <span className="p-2.5 bg-emerald-50 text-[#0DA54F] rounded-xl border border-emerald-100">
              <Plus className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {isBn ? 'প্যাকেজ কনফিগারেশন ফর্ম' : 'Package Configuration Form'}
              </h2>
              <p className="text-xs text-slate-500">
                {isBn
                  ? 'সেশন সংখ্যা, ছাড়ের মূল্য, ভ্যালিডিটি ও ইন্টারভাল নির্ধারণ করুন'
                  : 'Configure session bundle, discounted price, validity period, and clinical intervals'}
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateMasterPackage} className="space-y-5">
            {/* Package Name (English & Bangla) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Package Name (English) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. HydraFacial MD Radiance Protocol"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Package Name (বাংলা) <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={formNameBn}
                  onChange={(e) => setFormNameBn(e.target.value)}
                  placeholder="যেমনঃ হাইড্রাফেসিয়াল রেডিয়েন্স প্যাকেজ"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                />
              </div>
            </div>

            {/* Category & Total Sessions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Service Category <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                >
                  <option value="Facial & Skin Rejuvenation">Facial & Skin Rejuvenation</option>
                  <option value="Laser & Energy Devices">Laser & Energy Devices</option>
                  <option value="Hair & Scalp Therapy">Hair & Scalp Therapy</option>
                  <option value="Chemical Peels">Chemical Peels</option>
                  <option value="Combination Packages">Combination Packages</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Total Sessions in Package <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="2"
                  max="20"
                  value={formTotalSessions}
                  onChange={(e) => setFormTotalSessions(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                  required
                />
              </div>
            </div>

            {/* Pricing Comparison (Regular vs Package Price) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Package Discounted Price (৳) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  value={formPackagePrice}
                  onChange={(e) => setFormPackagePrice(e.target.value)}
                  placeholder="e.g. 15000"
                  className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Regular Single-Session Total (৳)
                </label>
                <input
                  type="number"
                  value={formRegularPrice}
                  onChange={(e) => setFormRegularPrice(e.target.value)}
                  placeholder="e.g. 18000"
                  className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                />
              </div>
            </div>

            {/* Validity & Clinical Interval */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Validity Period (Months)
                </label>
                <input
                  type="number"
                  min="1"
                  max="24"
                  value={formValidityMonths}
                  onChange={(e) => setFormValidityMonths(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Minimum Interval Between Sessions (Days)
                </label>
                <input
                  type="number"
                  min="7"
                  max="60"
                  value={formMinIntervalDays}
                  onChange={(e) => setFormMinIntervalDays(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                />
                <p className="text-[10px] text-slate-400 mt-1">Prevents over-treatment complications</p>
              </div>
            </div>

            {/* Included Services */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Included Treatments & Services (Comma separated)
              </label>
              <input
                type="text"
                value={formIncludedServices}
                onChange={(e) => setFormIncludedServices(e.target.value)}
                placeholder="e.g. HydraFacial MD, Peel, LED Phototherapy"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Clinical Description & Target Outcome
              </label>
              <textarea
                rows={3}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Details of protocol and expected dermal improvements..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F] resize-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => navigate('/packages')}
                disabled={isCreatingPackage}
                className="px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                {isBn ? 'বাতিল' : 'Cancel'}
              </button>

              <button
                type="submit"
                disabled={isCreatingPackage}
                className="px-6 py-2.5 bg-[#0DA54F] hover:bg-[#0b8841] text-white rounded-xl text-xs font-semibold transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isCreatingPackage ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>{isBn ? 'সংরক্ষণ হচ্ছে...' : 'Saving...'}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isBn ? 'প্যাকেজ সংরক্ষণ করুন' : 'Save Package'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#0DA54F] to-[#0a8740] flex items-center justify-center text-white shadow-sm shrink-0">
            {packageActiveTab === 'sessions' ? (
              <UserCheck className="w-5 h-5 text-white" />
            ) : (
              <Package className="w-5 h-5 text-white" />
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              {packageActiveTab === 'sessions'
                ? (isBn ? 'পেশেন্ট সেশনস ট্র্যাকার' : 'Patient Treatment Sessions & Balances')
                : (isBn ? 'প্যাকেজ ও ক্লিনিক্যাল সেশনস' : 'Packages & Clinical Sessions')}
            </h1>
          </div>
        </div>

        {/* Tab Switcher & Header Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center p-1 bg-slate-100/90 rounded-xl border border-slate-200/70">
            <button
              type="button"
              onClick={() => {
                setPackageActiveTab('list');
                navigate('/packages');
              }}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                packageActiveTab === 'list'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Package className="w-3.5 h-3.5 text-[#0DA54F]" />
              <span>{isBn ? 'মাস্টার প্যাকেজ' : 'Master Packages'}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                packageActiveTab === 'list' ? 'bg-emerald-50 text-[#0DA54F]' : 'bg-slate-200/70 text-slate-600'
              }`}>
                {masterPackages.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPackageActiveTab('sessions');
                navigate('/packages/sessions');
              }}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                packageActiveTab === 'sessions'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5 text-[#0DA54F]" />
              <span>{isBn ? 'পেশেন্ট সেশনস' : 'Patient Sessions'}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                packageActiveTab === 'sessions' ? 'bg-emerald-50 text-[#0DA54F]' : 'bg-slate-200/70 text-slate-600'
              }`}>
                {patientPackages.length}
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => fetchData()}
            disabled={isLoading}
            className="p-2 text-slate-600 hover:text-slate-900 bg-white border border-slate-200/80 hover:bg-slate-50 rounded-xl transition-all shadow-2xs cursor-pointer"
            title="Refresh packages data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#0DA54F]' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => navigate('/packages/new')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0DA54F] hover:bg-[#0b8841] text-white rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer active:scale-[0.98]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isBn ? 'নতুন প্যাকেজ' : 'New Package'}</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              packageActiveTab === 'list'
                ? isBn
                  ? 'প্যাকেজের নাম, কোড বা বিভাগ দিয়ে খুঁজুন...'
                  : 'Search package name, code, category...'
                : isBn
                ? 'রোগীর নাম, ফোন বা প্যাকেজ দিয়ে খুঁজুন...'
                : 'Search patient name, phone, package...'
            }
            className="w-full pl-10 pr-9 py-2 text-xs rounded-xl border border-slate-200/90 bg-slate-50/70 hover:bg-white focus:bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#0DA54F] focus:ring-2 focus:ring-[#0DA54F]/10 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-md hover:bg-slate-200/60"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {packageActiveTab === 'list' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-thin">
            {categories.map((cat) => {
              const isActive = categoryFilter === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-[#0DA54F] text-white shadow-xs'
                      : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                  }`}
                >
                  <span>{cat === 'all' ? (isBn ? 'সকল বিভাগ' : 'All Categories') : cat}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: PACKAGE LIST (MASTER PACKAGES DIRECTORY)                          */}
      {/* ========================================================================= */}
      {packageActiveTab === 'list' && !isAddPackageOpen && (
        <div className="space-y-4">
          {isLoading ? (
            <TableSkeleton rows={4} cols={5} />
          ) : filteredMasterPackages.length === 0 ? (
            <EmptyState
              title={isBn ? 'কোনো প্যাকেজ পাওয়া যায়নি' : 'No packages found'}
              description={isBn ? 'ফিল্টার পরিবর্তন করে আবার চেষ্টা করুন।' : 'Try adjusting your search query or filter.'}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredMasterPackages.map((pkg) => {
                const getCategoryStyle = (cat: string) => {
                  if (cat.includes('Laser')) return 'bg-sky-50 text-sky-700 border-sky-200';
                  if (cat.includes('Hair')) return 'bg-violet-50 text-violet-700 border-violet-200';
                  if (cat.includes('Peel')) return 'bg-amber-50 text-amber-700 border-amber-200';
                  if (cat.includes('Combination')) return 'bg-teal-50 text-teal-700 border-teal-200';
                  return 'bg-emerald-50 text-[#0DA54F] border-emerald-200';
                };

                return (
                  <div
                    key={pkg.id}
                    className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:border-[#0DA54F]/40 hover:shadow-lg transition-all duration-200 flex flex-col justify-between group hover:-translate-y-0.5"
                  >
                    <div>
                      {/* Header: Code & Category */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
                          {pkg.code}
                        </span>
                        <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${getCategoryStyle(pkg.serviceCategory)}`}>
                          {pkg.serviceCategory}
                        </span>
                      </div>

                      {/* Title */}
                      <h3 className="font-bold text-slate-900 text-sm leading-snug group-hover:text-[#0DA54F] transition-colors">
                        {pkg.name}
                      </h3>
                      {pkg.nameBn && (
                        <p className="text-xs text-slate-500 font-bengali mt-0.5">
                          {pkg.nameBn}
                        </p>
                      )}

                      {/* Description */}
                      <p className="text-[11px] text-slate-500 mt-2 line-clamp-2 leading-relaxed">
                        {pkg.description}
                      </p>

                      {/* Micro Metric Grid */}
                      <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-100 text-xs">
                        <div className="p-2 rounded-xl bg-slate-50/70 border border-slate-100 flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-emerald-100/60 text-[#0DA54F] flex items-center justify-center shrink-0">
                            <Sparkles className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block font-medium">Sessions</span>
                            <span className="font-bold text-slate-800 text-[11px]">{pkg.totalSessions} Sessions</span>
                          </div>
                        </div>

                        <div className="p-2 rounded-xl bg-slate-50/70 border border-slate-100 flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-slate-200/60 text-slate-600 flex items-center justify-center shrink-0">
                            <Clock className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block font-medium">Interval</span>
                            <span className="font-semibold text-slate-700 text-[11px]">Gap: {pkg.minIntervalDays}d</span>
                          </div>
                        </div>

                        <div className="p-2 rounded-xl bg-slate-50/70 border border-slate-100 flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-slate-200/60 text-slate-600 flex items-center justify-center shrink-0">
                            <Calendar className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block font-medium">Validity</span>
                            <span className="font-semibold text-slate-700 text-[11px]">{pkg.validityMonths} Months</span>
                          </div>
                        </div>

                        <div className="p-2 rounded-xl bg-emerald-50/60 border border-emerald-100/80 flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-emerald-100 text-[#0DA54F] flex items-center justify-center shrink-0">
                            <Flame className="w-3.5 h-3.5 text-emerald-600" />
                          </div>
                          <div>
                            <span className="text-[10px] text-emerald-600 block font-medium">Benefit</span>
                            <span className="font-bold text-emerald-800 text-[11px]">
                              {pkg.savingsBDT > 0 ? `Save ${formatBDT(pkg.savingsBDT)}` : 'Standard'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Included Services */}
                      {pkg.includedServices && pkg.includedServices.length > 0 && (
                        <div className="mt-3.5">
                          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1.5">
                            Included Treatments:
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {pkg.includedServices.map((srv, idx) => (
                              <span
                                key={idx}
                                className="text-[10px] px-2 py-0.5 bg-slate-50 text-slate-700 rounded-lg border border-slate-200/70 font-medium"
                              >
                                {srv}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Pricing & Assign Footer */}
                    <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        <div className="text-lg font-black text-slate-900 font-mono tracking-tight">
                          {formatBDT(pkg.packagePriceBDT)}
                        </div>
                        {pkg.regularPriceBDT > pkg.packagePriceBDT && (
                          <div className="text-[11px] text-slate-400 line-through font-mono">
                            {formatBDT(pkg.regularPriceBDT)}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setAssigningMaster(pkg)}
                        className="px-3.5 py-2 bg-[#0DA54F] hover:bg-[#0b8841] active:scale-[0.98] text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>{isBn ? 'রোগীকে দিন' : 'Assign to Patient'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: PATIENT SESSIONS (ACTIVE PATIENT TRACKER)                          */}
      {/* ========================================================================= */}
      {packageActiveTab === 'sessions' && !isAddPackageOpen && (
        <div className="space-y-4">
          {isLoading ? (
            <TableSkeleton rows={4} cols={6} />
          ) : filteredPatientPackages.length === 0 ? (
            <EmptyState
              title={isBn ? 'কোনো পেশেন্ট প্যাকেজ পাওয়া যায়নি' : 'No active patient packages'}
              description={
                isBn
                  ? 'প্যাকেজ লিস্ট থেকে কোনো রোগীকে প্যাকেজ বরাদ্দ করুন।'
                  : 'Assign a package to a patient from the Master Packages tab.'
              }
            />
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50/90 text-slate-500 font-bold text-[11px] uppercase tracking-wider border-b border-slate-200/80">
                    <tr>
                      <th className="py-3.5 px-5">Patient</th>
                      <th className="py-3.5 px-5">Package & Pricing</th>
                      <th className="py-3.5 px-5">Financial Ledger (Paid / Due)</th>
                      <th className="py-3.5 px-5 text-center">Sessions & Lock Status</th>
                      <th className="py-3.5 px-5">Validity</th>
                      <th className="py-3.5 px-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPatientPackages.map((pkg) => {
                      const badge = getStatusBadgeClass(pkg.status);
                      const progressPct = Math.min(100, Math.round((pkg.completedSessions / pkg.totalSessions) * 100));
                      const pkgDeductions = deductionsHistory.filter((d) => d.packageId === pkg.id);
                      const isComplete = pkg.remainingSessions <= 0;

                      const perSessionPrice =
                        pkg.perSessionPriceBDT ||
                        (pkg.totalSessions > 0 ? Math.round((pkg.priceBDT / pkg.totalSessions) * 100) / 100 : 0);
                      const paidAmount = pkg.paidAmountBDT ?? 0;
                      const dueAmount = pkg.dueAmountBDT ?? Math.max(0, pkg.priceBDT - paidAmount);
                      const unlockedSessions =
                        pkg.unlockedSessions ??
                        (perSessionPrice > 0
                          ? Math.min(pkg.totalSessions, Math.floor((paidAmount + 0.01) / perSessionPrice))
                          : pkg.totalSessions);
                      const advanceCredit =
                        pkg.advanceCreditBDT ??
                        Math.max(0, paidAmount - pkg.completedSessions * perSessionPrice);

                      const nextSessionNumber = pkg.completedSessions + 1;
                      const isNextSessionUnlocked = pkg.completedSessions < unlockedSessions;
                      const neededCumulative = nextSessionNumber * perSessionPrice;
                      const neededNow = Math.max(0, Math.round(neededCumulative - paidAmount));

                      return (
                        <tr key={pkg.id} className="h-20 hover:bg-slate-50/80 transition-colors">
                          {/* Patient Info */}
                          <td className="py-3.5 px-5">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-[#0DA54F]/10 text-[#0DA54F] font-bold text-xs flex items-center justify-center border border-[#0DA54F]/20 shrink-0">
                                {pkg.patientName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-bold text-slate-900 text-sm">
                                  {pkg.patientName}
                                </div>
                                <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                                  <span>ID: {pkg.patientId}</span>
                                  {pkg.invoiceId && (
                                    <>
                                      <span>•</span>
                                      <span className="text-slate-400 font-mono text-[10px]">{pkg.invoiceId}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Package Info & Rate */}
                          <td className="py-3.5 px-5">
                            <div className="font-bold text-slate-800 text-xs">{pkg.packageName}</div>
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                              Total: <span className="font-bold text-slate-700">{formatBDT(pkg.priceBDT)}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              Rate: ৳ {perSessionPrice.toLocaleString('en-US')}/session
                            </div>
                          </td>

                          {/* Financial Ledger (Paid / Due / Advance Credit) */}
                          <td className="py-3.5 px-5 min-w-[190px]">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-500 font-medium">Total Paid:</span>
                                <span className="font-bold font-mono text-emerald-600">
                                  {formatBDT(paidAmount)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-500 font-medium">Due Balance:</span>
                                <span
                                  className={`font-bold font-mono ${
                                    dueAmount > 0 ? 'text-amber-600' : 'text-slate-400'
                                  }`}
                                >
                                  {dueAmount > 0 ? formatBDT(dueAmount) : '৳ 0 (Nil)'}
                                </span>
                              </div>
                              {advanceCredit > 0 && (
                                <div className="flex items-center justify-between text-[11px] bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">
                                  <span className="text-emerald-800 font-medium">Advance Credit:</span>
                                  <span className="font-bold font-mono text-[#0DA54F]">
                                    {formatBDT(advanceCredit)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Sessions Progress & Lock Status */}
                          <td className="py-3.5 px-5 min-w-[240px]">
                            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 mb-1.5">
                              <span>
                                {pkg.completedSessions} of {pkg.totalSessions} Completed
                              </span>
                              <span className="font-mono text-[10px] text-slate-500">
                                {unlockedSessions} Unlocked • {pkg.totalSessions - unlockedSessions} Locked
                              </span>
                            </div>

                            {/* Progress bar */}
                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/60">
                              <div
                                className="bg-gradient-to-r from-[#0DA54F] to-[#10b981] h-2 rounded-full transition-all duration-300"
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>

                            {/* Session status dots */}
                            <div className="flex items-center gap-1.5 mt-2">
                              {Array.from({ length: pkg.totalSessions }).map((_, i) => {
                                const isDone = i < pkg.completedSessions;
                                const isUnlocked = i < unlockedSessions;

                                return (
                                  <div
                                    key={i}
                                    className={`relative flex items-center justify-center w-6 h-6 rounded-lg text-[10px] font-bold font-mono transition-all ${
                                      isDone
                                        ? 'bg-[#0DA54F] text-white shadow-2xs'
                                        : isUnlocked
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 ring-2 ring-emerald-500/20'
                                        : 'bg-slate-100 text-slate-400 border border-slate-200'
                                    }`}
                                    title={
                                      isDone
                                        ? `Session #${i + 1}: Completed & Redeemed`
                                        : isUnlocked
                                        ? `Session #${i + 1}: Paid & Unlocked (Ready)`
                                        : `Session #${i + 1}: Locked (Unpaid - Advance Required)`
                                    }
                                  >
                                    {isDone ? (
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                    ) : isUnlocked ? (
                                      <span>#{i + 1}</span>
                                    ) : (
                                      <Lock className="w-3 h-3 text-slate-400" />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </td>

                          {/* Expiry Date & Status */}
                          <td className="py-3.5 px-5 text-slate-600">
                            <div className="font-semibold text-slate-800 text-xs">
                              {formatDateDhaka(pkg.expiryDate)}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Started: {pkg.purchaseDate}
                            </div>
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 mt-1 rounded-full text-[10px] font-bold border ${badge.bg} ${badge.text} ${badge.border}`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isComplete ? 'bg-emerald-500' : 'bg-emerald-500 animate-pulse'
                                }`}
                              />
                              <span className="capitalize">{pkg.status}</span>
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-5 text-right">
                            <div className="flex items-center justify-end gap-2 flex-wrap">
                              {pkgDeductions.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setViewHistoryPackageId(pkg.id)}
                                  className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                                  title="View Session Deductions History"
                                >
                                  <ClipboardList className="w-3 h-3 text-slate-500" />
                                  <span>Logs ({pkgDeductions.length})</span>
                                </button>
                              )}

                              {dueAmount > 0 && (
                                <button
                                  type="button"
                                  onClick={() => openPaymentModal(pkg)}
                                  className="px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/90 rounded-xl transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                                  title="Add Advance or Installment Payment"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>{isBn ? 'কিস্তি জমা' : 'Add Installment'}</span>
                                </button>
                              )}

                              {pkg.remainingSessions > 0 ? (
                                isNextSessionUnlocked ? (
                                  <button
                                    type="button"
                                    onClick={() => openDeductModal(pkg)}
                                    className="px-3.5 py-2 text-xs font-bold text-white bg-[#0DA54F] hover:bg-[#0b8841] active:scale-[0.98] rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    <span>Deduct #{nextSessionNumber}</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => openPaymentModal(pkg, neededNow, true)}
                                    className="px-3.5 py-2 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 active:scale-[0.98] border border-amber-300 rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer group"
                                    title={`Session #${nextSessionNumber} is locked due to unpaid balance. Click to pay ৳ ${neededNow.toLocaleString('en-US')} and unlock.`}
                                  >
                                    <Lock className="w-3.5 h-3.5 text-amber-700 group-hover:scale-110 transition-transform" />
                                    <span>Pay & Unlock #{nextSessionNumber}</span>
                                    <span className="bg-amber-200/80 text-amber-950 font-mono text-[10px] px-1.5 py-0.5 rounded-md">
                                      ৳ {neededNow.toLocaleString('en-US')}
                                    </span>
                                  </button>
                                )
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Fully Redeemed</span>
                                </span>
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
        </div>
      )}



      {/* ========================================================================= */}
      {/* MODAL: DEDUCT SESSION MODAL (HARD RULE 5 NON-DUPLICATE GUARANTEE)          */}
      {/* ========================================================================= */}
      {deductingPackage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="p-2 bg-emerald-100 text-[#0DA54F] rounded-xl">
                  <CheckCircle className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {isBn ? 'সেশন ডিডাকশন ও লগ' : 'Log & Deduct Treatment Session'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Session #{deductingPackage.completedSessions + 1} of {deductingPackage.totalSessions}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDeductingPackage(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleDeductSession} className="p-5 space-y-4">
              {/* Summary Card */}
              <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200/80 space-y-1">
                <div className="text-xs font-bold text-slate-900 flex justify-between">
                  <span>{deductingPackage.packageName}</span>
                  <span className="text-[#0DA54F]">
                    {deductingPackage.remainingSessions - 1} sessions left after this
                  </span>
                </div>
                <div className="text-[11px] text-slate-600">
                  Patient: <span className="font-semibold">{deductingPackage.patientName}</span>
                </div>
              </div>

              {/* Performing Therapist */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Performing Therapist / Clinician <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={therapistName}
                  onChange={(e) => setTherapistName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                  required
                />
              </div>

              {/* Machine Settings & Parameters */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Machine Settings & Energy Parameters
                </label>
                <input
                  type="text"
                  value={machineSettings}
                  onChange={(e) => setMachineSettings(e.target.value)}
                  placeholder="e.g. 1064nm Q-Switch, 2.5mm spot, 850mJ, 15 min LED"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                />
              </div>

              {/* Clinical Progress Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Clinical Session Notes & Skin Reaction <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={treatmentNotes}
                  onChange={(e) => setTreatmentNotes(e.target.value)}
                  placeholder="Skin tolerated treatment well, mild erythema resolved within 20 mins..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F] resize-none"
                  required
                />
              </div>

              {/* Modal Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setDeductingPackage(null)}
                  disabled={isDeducting}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  {isBn ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isDeducting}
                  className="px-5 py-2 bg-[#0DA54F] hover:bg-[#0b8841] active:scale-[0.98] text-white rounded-xl text-xs font-semibold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {isDeducting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>{isBn ? 'ডিডাক্ট হচ্ছে...' : 'Deducting...'}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      <span>
                        {isBn
                          ? `সেশন #${deductingPackage.completedSessions + 1} নিশ্চিত করুন`
                          : `Confirm Session #${deductingPackage.completedSessions + 1}`}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ASSIGN PACKAGE TO PATIENT MODAL                                    */}
      {/* ========================================================================= */}
      {assigningMaster && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="p-2 bg-emerald-100 text-[#0DA54F] rounded-xl">
                  <UserCheck className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {isBn ? 'রোগীকে প্যাকেজ বরাদ্দ করুন' : 'Assign Package to Patient'}
                  </h3>
                  <p className="text-[11px] text-slate-500">{assigningMaster.name}</p>
                </div>
              </div>
              <button
                onClick={() => setAssigningMaster(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAssignPackage} className="p-5 space-y-4">
              {/* Package Summary */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs space-y-1">
                <div className="flex justify-between font-bold text-slate-900">
                  <span>Price: {formatBDT(assigningMaster.packagePriceBDT)}</span>
                  <span className="text-[#0DA54F] font-bold">{assigningMaster.totalSessions} Sessions</span>
                </div>
                <div className="text-[11px] text-slate-500">
                  Validity: {assigningMaster.validityMonths} months | Category:{' '}
                  {assigningMaster.serviceCategory}
                </div>
              </div>

              {/* Patient Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select Patient <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                  required
                >
                  {patients.map((pt) => (
                    <option key={pt.id} value={pt.id}>
                      {pt.name} ({pt.phone || pt.id})
                    </option>
                  ))}
                </select>
              </div>

              {/* Initial Advance Pre-payment (Optional) */}
              <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                    <Banknote className="w-3.5 h-3.5 text-[#0DA54F]" />
                    <span>{isBn ? 'প্রাথমিক অগ্রিম জমা (ঐচ্ছিক)' : 'Initial Advance Payment (Optional)'}</span>
                  </label>
                  <span className="text-[10px] text-emerald-700 font-medium">
                    {Number(assignInitialPayment) > 0 ? (
                      <span className="font-bold">
                        {Math.floor(
                          (Number(assignInitialPayment) + 0.01) /
                            (assigningMaster.packagePriceBDT / assigningMaster.totalSessions)
                        )}{' '}
                        {isBn ? 'সেশন আনলক হবে' : 'Sessions Unlocked'}
                      </span>
                    ) : (
                      isBn ? '০ সেশন আনলক' : '0 Sessions Unlocked'
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-600 font-medium mb-1">
                      {isBn ? 'টাকার পরিমাণ (৳)' : 'Amount (BDT)'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={assigningMaster.packagePriceBDT}
                      value={assignInitialPayment}
                      onChange={(e) => setAssignInitialPayment(e.target.value)}
                      placeholder="e.g. 2000"
                      className="w-full px-3 py-1.5 bg-white border border-emerald-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0DA54F]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 font-medium mb-1">
                      {isBn ? 'পদ্ধতি' : 'Method'}
                    </label>
                    <select
                      value={assignPaymentMethod}
                      onChange={(e) => setAssignPaymentMethod(e.target.value as any)}
                      className="w-full px-3 py-1.5 bg-white border border-emerald-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0DA54F]"
                    >
                      <option value="cash">Cash (নগদ)</option>
                      <option value="bkash">bKash (বিকাশ)</option>
                      <option value="card">Card (কার্ড)</option>
                      <option value="nagad">Nagad (নগদ)</option>
                    </select>
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <button
                    type="button"
                    onClick={() => setAssignInitialPayment('0')}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    ৳ 0 (Due)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setAssignInitialPayment(
                        Math.round(assigningMaster.packagePriceBDT / assigningMaster.totalSessions).toString()
                      )
                    }
                    className="text-[10px] px-2 py-0.5 rounded-md bg-white border border-emerald-300 text-emerald-800 font-medium hover:bg-emerald-100 cursor-pointer"
                  >
                    1 Session (৳ {Math.round(assigningMaster.packagePriceBDT / assigningMaster.totalSessions)})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssignInitialPayment(assigningMaster.packagePriceBDT.toString())}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-600 text-white font-bold hover:bg-emerald-700 cursor-pointer"
                  >
                    Full (৳ {assigningMaster.packagePriceBDT.toLocaleString('en-US')})
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setAssigningMaster(null)}
                  disabled={isAssigning}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  {isBn ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isAssigning}
                  className="px-5 py-2 bg-[#0DA54F] hover:bg-[#0b8841] active:scale-[0.98] text-white rounded-xl text-xs font-semibold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {isAssigning ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>{isBn ? 'প্রক্রিয়াধীন...' : 'Assigning...'}</span>
                    </>
                  ) : (
                    <>
                      <UserCheck className="w-4 h-4" />
                      <span>{isBn ? 'নিশ্চিত করুন' : 'Confirm Assignment'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: QUICK INSTALLMENT / ADVANCE PAYMENT MODAL (ZERO-DUE POLICY)         */}
      {/* ========================================================================= */}
      {paymentPackage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50/90 to-teal-50/70 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="p-2.5 bg-[#0DA54F] text-white rounded-xl shadow-xs">
                  <CreditCard className="w-5 h-5 text-white" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {isBn ? 'প্যাকেজ অগ্রিম / কিস্তি পেমেন্ট কাউন্টার' : 'Package Advance & Installment Desk'}
                  </h3>
                  <p className="text-[11px] text-emerald-800 font-medium">
                    {isBn
                      ? 'Zero-Due Session Policy: অগ্রিম পেমেন্টে সেশন আনলক করুন'
                      : 'Advance Pre-payment to unlock treatment sessions'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setPaymentPackage(null);
                  setPendingDeductAfterPayment(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordPackagePayment} className="p-5 space-y-4">
              {/* Patient & Package Context Card */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/90 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      {paymentPackage.patientName}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      ID: {paymentPackage.patientId} • Invoice: {paymentPackage.invoiceId}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-[#0DA54F] border border-emerald-200">
                    {paymentPackage.serviceCategory}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>{paymentPackage.packageName}</span>
                  <span className="font-mono font-bold text-slate-900">
                    Total: {formatBDT(paymentPackage.priceBDT)}
                  </span>
                </div>
              </div>

              {/* Financial Status Matrix */}
              {(() => {
                const perSession =
                  paymentPackage.perSessionPriceBDT ||
                  (paymentPackage.totalSessions > 0
                    ? Math.round((paymentPackage.priceBDT / paymentPackage.totalSessions) * 100) / 100
                    : 0);
                const paid = paymentPackage.paidAmountBDT || 0;
                const due = paymentPackage.dueAmountBDT ?? Math.max(0, paymentPackage.priceBDT - paid);
                const nextSession = paymentPackage.completedSessions + 1;
                const neededCumulative = nextSession * perSession;
                const neededToUnlock = Math.max(0, Math.round(neededCumulative - paid));
                const unlocked = paymentPackage.unlockedSessions ?? 0;

                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-100 text-center">
                        <span className="text-[10px] font-bold text-emerald-800 uppercase block">
                          Total Paid
                        </span>
                        <span className="text-sm font-black text-emerald-700 font-mono">
                          {formatBDT(paid)}
                        </span>
                      </div>

                      <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-100 text-center">
                        <span className="text-[10px] font-bold text-amber-800 uppercase block">
                          Due Balance
                        </span>
                        <span className="text-sm font-black text-amber-700 font-mono">
                          {formatBDT(due)}
                        </span>
                      </div>

                      <div className="p-2.5 bg-slate-100 rounded-xl border border-slate-200 text-center">
                        <span className="text-[10px] font-bold text-slate-700 uppercase block">
                          Per Session
                        </span>
                        <span className="text-sm font-black text-slate-800 font-mono">
                          {formatBDT(perSession)}
                        </span>
                      </div>
                    </div>

                    {/* Notice Banner */}
                    <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-amber-900 block">
                          {isBn
                            ? `সেশন #${nextSession} আনলক করতে সর্বনিম্ন ৳ ${neededToUnlock.toLocaleString('en-BD')} অগ্রিম প্রয়োজন`
                            : `Minimum ৳ ${neededToUnlock.toLocaleString('en-US')} needed to unlock Session #${nextSession}`}
                        </span>
                        <span className="text-[11px] text-amber-800">
                          {isBn
                            ? `বর্তমানে ${unlocked} টি সেশনের ফি পরিশোধিত। বাকি রেখে কোনো সেশন গ্রহণ সম্ভব নয়।`
                            : `Currently ${unlocked} of ${paymentPackage.totalSessions} sessions are unlocked. Zero due is permitted per session.`}
                        </span>
                      </div>
                    </div>

                    {/* Preset Quick Buttons */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                        {isBn ? 'কুইক পেমেন্ট অ্যামাউন্ট সিলেক্ট করুন:' : 'Quick Select Amount:'}
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {neededToUnlock > 0 && (
                          <button
                            type="button"
                            onClick={() => setPaymentAmount(neededToUnlock)}
                            className={`p-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                              paymentAmount === neededToUnlock
                                ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                                : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
                            }`}
                          >
                            <span className="block text-[10px] uppercase font-semibold">Unlock #{nextSession}</span>
                            <span>{formatBDT(neededToUnlock)}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setPaymentAmount(Math.min(perSession, due))}
                          className={`p-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                            paymentAmount === Math.min(perSession, due)
                              ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                              : 'bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100'
                          }`}
                        >
                          <span className="block text-[10px] uppercase font-semibold">1 Full Session</span>
                          <span>{formatBDT(Math.min(perSession, due))}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setPaymentAmount(due)}
                          className={`p-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                            paymentAmount === due
                              ? 'bg-slate-800 text-white border-slate-900 shadow-xs'
                              : 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200'
                          }`}
                        >
                          <span className="block text-[10px] uppercase font-semibold">Full Due Balance</span>
                          <span>{formatBDT(due)}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Amount Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {isBn ? 'পেমেন্ট অ্যামাউন্ট (৳ BDT)' : 'Payment Amount (৳ BDT)'}{' '}
                  <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                    ৳
                  </span>
                  <input
                    type="number"
                    min="1"
                    max={paymentPackage.dueAmountBDT || paymentPackage.priceBDT}
                    value={paymentAmount || ''}
                    onChange={(e) => setPaymentAmount(Number(e.target.value))}
                    placeholder="e.g. 500"
                    className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                    required
                  />
                </div>
              </div>

              {/* Payment Method Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {isBn ? 'পেমেন্ট মাধ্যম' : 'Payment Method'}{' '}
                  <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['cash', 'bkash', 'card', 'nagad'] as const).map((method) => {
                    const isSelected = paymentMethod === method;
                    return (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        className={`py-2 px-2.5 rounded-xl text-xs font-bold capitalize transition-all border cursor-pointer flex flex-col items-center gap-1 ${
                          isSelected
                            ? 'bg-[#0DA54F] text-white border-[#0DA54F] shadow-2xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {method === 'cash' && <Banknote className="w-4 h-4" />}
                        {method === 'bkash' && <Sparkles className="w-4 h-4" />}
                        {method === 'card' && <CreditCard className="w-4 h-4" />}
                        {method === 'nagad' && <DollarSign className="w-4 h-4" />}
                        <span>{method}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Transaction Reference (Optional) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {isBn ? 'ট্রানজেকশন রেফারেন্স (ঐচ্ছিক)' : 'Transaction Reference / Slip (Optional)'}
                </label>
                <input
                  type="text"
                  value={paymentTrxRef}
                  onChange={(e) => setPaymentTrxRef(e.target.value)}
                  placeholder={
                    paymentMethod === 'bkash'
                      ? 'TrxID e.g. BKH982348'
                      : paymentMethod === 'card'
                      ? 'Auth code e.g. VISA-9941'
                      : 'Cash Counter Drawer 1'
                  }
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                />
              </div>

              {/* Modal Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentPackage(null);
                    setPendingDeductAfterPayment(null);
                  }}
                  disabled={isRecordingPayment}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  {isBn ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isRecordingPayment || paymentAmount <= 0}
                  className="px-5 py-2 bg-gradient-to-r from-[#0DA54F] to-[#0a8740] hover:from-[#0a8740] hover:to-[#087337] active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20 flex items-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {isRecordingPayment ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>{isBn ? 'পেমেন্ট প্রসেস হচ্ছে...' : 'Processing Payment...'}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {isBn
                          ? `৳ ${paymentAmount.toLocaleString('en-BD')} জমা ও সেশন আনলক করুন`
                          : `Accept ৳ ${paymentAmount.toLocaleString('en-US')} & Unlock`}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: SESSION DEDUCTION LOGS / AUDIT HISTORY                             */}
      {/* ========================================================================= */}
      {viewHistoryPackageId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
            <div className="p-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="p-2 bg-emerald-100 text-[#0DA54F] rounded-xl">
                  <ClipboardList className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {isBn ? 'সেশন হিস্টোরি ও ডিডাকশন লগ' : 'Session Deductions Audit Trail'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {isBn ? 'চিকিৎসা গ্রহণ ও ক্লিনিক্যাল প্যারামিটার বিবরণী' : 'Logged treatment history & clinical settings'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewHistoryPackageId(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {deductionsHistory.filter((d) => d.packageId === viewHistoryPackageId).length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">No session logs found.</p>
              ) : (
                deductionsHistory
                  .filter((d) => d.packageId === viewHistoryPackageId)
                  .map((ded) => (
                    <div
                      key={ded.id}
                      className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-[#0DA54F] bg-emerald-100/70 px-2.5 py-0.5 rounded-lg">
                          Session #{ded.sessionNumber} Completed
                        </span>
                        <span className="text-slate-500 font-mono text-[11px]">
                          {formatDateDhaka(ded.deductedAt)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-800">
                        <span className="font-semibold text-slate-600">Therapist:</span>{' '}
                        {ded.therapistName}
                      </div>
                      {ded.machineSettings && (
                        <div className="text-[11px] text-slate-600 font-mono bg-white p-2 rounded-lg border border-slate-200/70">
                          <span className="font-semibold text-slate-700">Settings:</span>{' '}
                          {ded.machineSettings}
                        </div>
                      )}
                      <p className="text-[11px] text-slate-600 italic">
                        &quot;{ded.treatmentNotes}&quot;
                      </p>
                    </div>
                  ))
              )}
            </div>

            <div className="p-3.5 border-t border-slate-100 flex justify-end shrink-0 bg-slate-50/50">
              <button
                onClick={() => setViewHistoryPackageId(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
