import React, { useState, useEffect, useMemo } from 'react';
import {
  CreditCard,
  Search,
  Plus,
  Trash2,
  Printer,
  Receipt,
  User,
  CheckCircle,
  AlertCircle,
  Sparkles,
  ShoppingBag,
  DollarSign,
  Smartphone,
  ShieldCheck,
  Package,
  Layers,
  ArrowRight,
  Clock,
  X,
  FileText,
  BadgePercent,
  Check,
  Minus,
  Percent,
  Users,
  Tag,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';
import { api } from '../../../api/client.ts';
import type { Patient, Invoice, PaymentMethod } from '../../../types/index.ts';
import type { ReferrerDto } from '@suoxi/shared-types';
import { formatBDT, formatDateDhaka } from '../../../utils/format.ts';
import { A4InvoiceModal } from './A4InvoiceModal.tsx';

interface CartItem {
  id: string;
  type: 'procedure' | 'package' | 'product';
  name: string;
  nameBn?: string;
  category: string;
  price: number;
  quantity: number;
}

export const POSBillingCounterView: React.FC = () => {
  const { language, addToast, currentUser, navigate, branches, activeBranchId } = useApp();
  const isBn = language === 'bn';

  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [isLoadingPatients, setIsLoadingPatients] = useState(false);

  // Referral Attribution State
  const [referrers, setReferrers] = useState<ReferrerDto[]>([]);
  const [selectedReferrerId, setSelectedReferrerId] = useState<string>('');
  const [isLoadingReferrers, setIsLoadingReferrers] = useState(false);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [catalogTab, setCatalogTab] = useState<'procedures' | 'packages' | 'products'>('procedures');
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [vatPercent, setVatPercent] = useState<number>(0); // 0% standard for medical services

  // Split payment state
  const [cashAmount, setCashAmount] = useState<number>(0);
  const [cardAmount, setCardAmount] = useState<number>(0);
  const [cardRef, setCardRef] = useState<string>('');
  const [bkashAmount, setBkashAmount] = useState<number>(0);
  const [bkashRef, setBkashRef] = useState<string>('');
  const [nagadAmount, setNagadAmount] = useState<number>(0);
  const [nagadRef, setNagadRef] = useState<string>('');

  const [isProcessing, setIsProcessing] = useState(false);
  const [completedInvoice, setCompletedInvoice] = useState<Invoice | null>(null);
  const [receiptModalType, setReceiptModalType] = useState<'thermal' | 'a4' | null>(null);

  // Catalog items
  const procedureCatalog = [
    { id: 'srv-1', name: 'HydraFacial MD Radiance Protocol', nameBn: 'হাইড্রাফেসিয়াল গ্লো প্রোটোকল', category: 'Skin Care', price: 4500 },
    { id: 'srv-2', name: 'Fractional CO2 Laser Resurfacing', nameBn: 'ফ্র্যাকশনাল সিও২ লেজার', category: 'Laser & Energy', price: 8500 },
    { id: 'srv-3', name: 'Hollywood Carbon Laser Peel & Toning', nameBn: 'হলিউড কার্বন লেজার পিল', category: 'Laser & Energy', price: 6000 },
    { id: 'srv-4', name: 'Medical Chemical Peel (Acne Clearing)', nameBn: 'মেডিকেল কেমিক্যাল পিল', category: 'Chemical Peels', price: 3500 },
    { id: 'srv-5', name: 'Autologous PRP Skin Rejuvenation', nameBn: 'পিআরপি স্কিন থেরাপি', category: 'Anti-Aging', price: 8000 },
    { id: 'srv-6', name: 'Q-Switched Nd:YAG Laser Melasma Toning', nameBn: 'এনডি:ইয়াগ লেজার টোনিং', category: 'Laser & Energy', price: 5500 },
  ];

  const packageCatalog = [
    { id: 'pkg-1', name: 'HydraFacial MD Bundle (4 Sessions)', nameBn: 'হাইড্রাফেসিয়াল বান্ডেল (৪ সেশন)', category: 'Packages', price: 15000 },
    { id: 'pkg-2', name: 'Hollywood Carbon Laser (6 Sessions)', nameBn: 'কার্বন লেজার (৬ সেশন)', category: 'Packages', price: 36000 },
    { id: 'pkg-3', name: 'Fractional CO2 Scar Protocol (4 Sessions)', nameBn: 'সিও২ স্কার প্রোটোকল (৪ সেশন)', category: 'Packages', price: 28000 },
    { id: 'pkg-4', name: 'PRP Hair Restoration (6 Sessions)', nameBn: 'পিআরপি হেয়ার রিজেনারেশন (৬ সেশন)', category: 'Packages', price: 42000 },
  ];

  const productCatalog = [
    { id: 'prd-1', name: 'Suoxi Mineral Sunscreen SPF 50+ PA++++', nameBn: 'সুওক্সি মিনারেল সানস্ক্রিন', category: 'Homecare', price: 1850 },
    { id: 'prd-2', name: 'Azelaic Acid 20% DermaCream (30g)', nameBn: 'অ্যাজেলাইক অ্যাসিড ক্রিম', category: 'Topical Rx', price: 1200 },
    { id: 'prd-3', name: 'Suoxi Cica Soothing Barrier Recovery Balm', nameBn: 'সিকা সুদিং ব্যারিয়ার বাম', category: 'Post-Care', price: 1650 },
    { id: 'prd-4', name: 'Hyaluronic Acid B5 Hydrating Serum', nameBn: 'হায়ালুরোনিক অ্যাসিড সিরাম', category: 'Homecare', price: 2100 },
    { id: 'prd-5', name: 'Gentle Foaming pH 5.5 Cleanser', nameBn: 'জেন্টল ফোমিং ক্লিনজার', category: 'Homecare', price: 1400 },
  ];

  // Fetch patients
  useEffect(() => {
    let isMounted = true;
    setIsLoadingPatients(true);
    api.patients
      .list()
      .then((data) => {
        if (isMounted) {
          setPatients(data || []);
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingPatients(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch active referrers for attribution
  useEffect(() => {
    let isMounted = true;
    setIsLoadingReferrers(true);
    api.referrals
      .list({ limit: 50, status: 'active' })
      .then((res) => {
        if (isMounted && res.data) {
          setReferrers(res.data);
        }
      })
      .catch((err) => {
        console.warn('Could not load referrers for POS', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingReferrers(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Filter patients strictly by search query (only when user enters a phone number or query)
  const filteredPatients = useMemo(() => {
    const q = patientSearch.toLowerCase().trim();
    if (!q) return [];
    return patients.filter(
      (p) =>
        p.phone.includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.patientIdCode && p.patientIdCode.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [patients, patientSearch]);

  const selectedReferrer = useMemo(() => {
    return referrers.find((r) => r.id === selectedReferrerId) || null;
  }, [referrers, selectedReferrerId]);

  // Cart operations
  const addToCart = (item: { id: string; name: string; nameBn?: string; category: string; price: number }, type: 'procedure' | 'package' | 'product') => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) => (i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { ...item, type, quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => {
          if (i.id === id) {
            const newQ = i.quantity + delta;
            return newQ > 0 ? { ...i, quantity: newQ } : null;
          }
          return i;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
  };

  // Financial calculations
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [cart]);

  const vatAmount = useMemo(() => {
    const afterDiscount = Math.max(0, subtotal - discountAmount);
    return (afterDiscount * vatPercent) / 100;
  }, [subtotal, discountAmount, vatPercent]);

  const netPayable = useMemo(() => {
    return Math.max(0, subtotal - discountAmount + vatAmount);
  }, [subtotal, discountAmount, vatAmount]);

  const totalTendered = useMemo(() => {
    return (Number(cashAmount) || 0) + (Number(cardAmount) || 0) + (Number(bkashAmount) || 0) + (Number(nagadAmount) || 0);
  }, [cashAmount, cardAmount, bkashAmount, nagadAmount]);

  const remainingDue = useMemo(() => {
    return Math.max(0, netPayable - totalTendered);
  }, [netPayable, totalTendered]);

  const changeDue = useMemo(() => {
    return Math.max(0, totalTendered - netPayable);
  }, [netPayable, totalTendered]);

  const estimatedCommission = useMemo(() => {
    if (!selectedReferrer || netPayable <= 0) return 0;
    if (selectedReferrer.referrerType === 'doctor') {
      return Math.round(netPayable * 0.10);
    }
    if (selectedReferrer.referrerType === 'staff') {
      return Math.round(netPayable * 0.05);
    }
    if (selectedReferrer.referrerType === 'agent' || selectedReferrer.referrerType === 'organization') {
      return Math.min(1000, Math.round(netPayable * 0.08));
    }
    if (selectedReferrer.referrerType === 'patient') {
      return 800;
    }
    return Math.round(netPayable * 0.05);
  }, [selectedReferrer, netPayable]);

  // Quick fill payment
  const handleQuickPayFull = (method: 'cash' | 'card' | 'bkash' | 'nagad') => {
    setCashAmount(0);
    setCardAmount(0);
    setBkashAmount(0);
    setNagadAmount(0);

    if (method === 'cash') setCashAmount(netPayable);
    if (method === 'card') {
      setCardAmount(netPayable);
      setCardRef(`AUTH-${Math.floor(100000 + Math.random() * 900000)}`);
    }
    if (method === 'bkash') {
      setBkashAmount(netPayable);
      setBkashRef(`BKH-${Math.floor(100000 + Math.random() * 900000)}`);
    }
    if (method === 'nagad') {
      setNagadAmount(netPayable);
      setNagadRef(`NGD-${Math.floor(100000 + Math.random() * 900000)}`);
    }
  };

  // Pull doctor's prescribed cart
  const handlePullDoctorPrescription = () => {
    if (!selectedPatient) return;
    setCart([
      { id: 'srv-1', type: 'procedure', name: 'HydraFacial MD Radiance Protocol', category: 'Skin Care', price: 4500, quantity: 1 },
      { id: 'srv-6', type: 'procedure', name: 'Q-Switched Nd:YAG Laser Melasma Toning', category: 'Laser & Energy', price: 5500, quantity: 1 },
      { id: 'prd-1', type: 'product', name: 'Suoxi Mineral Sunscreen SPF 50+ PA++++', category: 'Homecare', price: 1850, quantity: 1 },
      { id: 'prd-2', type: 'product', name: 'Azelaic Acid 20% DermaCream (30g)', category: 'Topical Rx', price: 1200, quantity: 1 },
    ]);
    addToast({
      type: 'success',
      title: isBn ? 'ডাক্তারের আরএক্স কার্টে লোড হয়েছে' : 'Doctor Prescribed Items Loaded',
      description: isBn
        ? 'ডাঃ নুসরাত জাহান কর্তৃক প্রস্তাবিত প্রসিডিউর ও ওষুধ বিলিং কার্টে যুক্ত হয়েছে।'
        : 'Prescribed procedures and topical care added to cashier cart.',
    });
  };

  // Complete checkout & process payments
  const handleCompleteCheckout = async () => {
    if (!selectedPatient) {
      addToast({ type: 'warning', title: 'Select Patient', description: 'Please select a patient for this invoice.' });
      return;
    }
    if (cart.length === 0) {
      addToast({ type: 'warning', title: 'Empty Cart', description: 'Please add at least one procedure or product.' });
      return;
    }

    try {
      setIsProcessing(true);

      // 1. Create Invoice
      const invoicePayload = {
        patientId: selectedPatient.id,
        items: cart.map((i) => ({
          description: i.name,
          quantity: i.quantity,
          unitPriceBDT: i.price,
        })),
        discountBDT: discountAmount,
        vatPercent: vatPercent,
      };

      const newInv = await api.invoices.create(invoicePayload);

      // 2. Record individual split payments if tendered
      let updatedInv = newInv;

      if (cashAmount > 0) {
        const res = await api.invoices.recordPayment(newInv.id, {
          amountBDT: Math.min(cashAmount, netPayable),
          method: 'cash',
          transactionRef: 'CASH-COUNTER-POS',
        });
        updatedInv = res.invoice;
      }

      if (cardAmount > 0) {
        const res = await api.invoices.recordPayment(newInv.id, {
          amountBDT: cardAmount,
          method: 'card',
          transactionRef: cardRef || `POS-${Math.floor(100000 + Math.random() * 900000)}`,
        });
        updatedInv = res.invoice;
      }

      if (bkashAmount > 0) {
        const res = await api.invoices.recordPayment(newInv.id, {
          amountBDT: bkashAmount,
          method: 'bkash',
          transactionRef: bkashRef || `BKH-${Math.floor(100000 + Math.random() * 900000)}`,
        });
        updatedInv = res.invoice;
      }

      if (nagadAmount > 0) {
        const res = await api.invoices.recordPayment(newInv.id, {
          amountBDT: nagadAmount,
          method: 'nagad',
          transactionRef: nagadRef || `NGD-${Math.floor(100000 + Math.random() * 900000)}`,
        });
        updatedInv = res.invoice;
      }

      setCompletedInvoice(updatedInv);
      setReceiptModalType('thermal');

      // Attribute Referral if selected
      if (selectedReferrerId && selectedPatient) {
        try {
          await api.referrals.assignPatientReferrer(selectedPatient.id, {
            referrerId: selectedReferrerId,
            attributionReason: `POS Billing Checkout Invoice #${updatedInv.invoiceNumber}`,
          });
          await api.commissions.processOutbox();
          addToast({
            type: 'info',
            title: isBn ? 'রেফারাল কমিশন অ্যাক্রুড' : 'Commission Accrued',
            description: isBn
              ? `${selectedReferrer?.fullName} (${selectedReferrer?.referrerCode}) এর জন্য কমিশন যুক্ত হয়েছে।`
              : `Commission auto-accrued for ${selectedReferrer?.fullName} (${selectedReferrer?.referrerCode}).`,
          });
        } catch (refErr) {
          console.warn('Referral attribution recording notice:', refErr);
        }
      }

      // Auto-register package balance if cart included packages
      for (const item of cart) {
        if (item.type === 'package') {
          let totalSessions = 4;
          const match = item.name.match(/(\d+)\s*Session/i);
          if (match) {
            totalSessions = parseInt(match[1], 10);
          }
          try {
            await api.packages.assignToPatient({
              patientId: selectedPatient.id,
              patientName: selectedPatient.name,
              packageName: item.name,
              serviceCategory: item.category || 'Packages',
              totalSessions,
              priceBDT: item.price * item.quantity,
              invoiceId: newInv.id,
            });
          } catch (pkgErr) {
            console.warn('Package auto-assignment note:', pkgErr);
          }
        }
      }

      // Reset cart and tender
      setCart([]);
      setSelectedReferrerId('');
      setCashAmount(0);
      setCardAmount(0);
      setBkashAmount(0);
      setNagadAmount(0);
      setDiscountAmount(0);

      addToast({
        type: 'success',
        title: isBn ? 'বিলিং ও পেমেন্ট সম্পন্ন!' : 'Billing & Payment Completed!',
        description: `Invoice #${updatedInv.invoiceNumber} recorded. Total Paid: ${formatBDT(updatedInv.paidAmountBDT)}`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Checkout Failed',
        description: err.message || 'Server error while creating invoice.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#0DA54F] to-[#0a8740] flex items-center justify-center text-white shadow-sm shrink-0">
            <CreditCard className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              {isBn ? 'পিওএস বিলিং কাউন্টার ও ক্যাশিয়ার ডেস্ক' : 'POS Billing Counter & Cashier Desk'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate('/billing/closing')}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5 text-slate-600" />
            <span>{isBn ? 'ডেইলি ক্লোজিং' : 'Daily Shift Closing'}</span>
          </button>

          <button
            onClick={() => navigate('/billing/invoices')}
            className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-[#0DA54F] border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{isBn ? 'সকল ইনভয়েস' : 'All Invoices'}</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Left Catalog & Patient, Right Cart & Tender */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Patient Picker & Catalog (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Patient Selection Card */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-4 h-4 text-[#0DA54F]" />
                <span>{isBn ? 'বিলিং রোগী নির্বাচন' : 'Customer / Patient Selection'}</span>
              </span>

              {selectedPatient && (
                <button
                  onClick={handlePullDoctorPrescription}
                  className="text-[11px] font-bold text-[#0DA54F] hover:text-[#0a853f] bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-[#0DA54F]" />
                  <span>{isBn ? 'ডাক্তারের আরএক্স থেকে কার্টে আনুন' : 'Pull Prescribed Rx Cart'}</span>
                </button>
              )}
            </div>

            {/* Selected Patient Card */}
            {selectedPatient ? (
              <div className="p-3.5 bg-emerald-50/70 rounded-xl border border-emerald-200 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#0DA54F] text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs">
                    {selectedPatient.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{selectedPatient.name}</span>
                      <span className="px-2 py-0.5 rounded-full bg-white text-emerald-800 font-mono text-[10px] font-bold border border-emerald-200">
                        {selectedPatient.patientIdCode || selectedPatient.id}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-600 text-xs mt-1">
                      <span className="flex items-center gap-1 font-semibold text-slate-800">
                        <Smartphone className="w-3.5 h-3.5 text-[#0DA54F]" />
                        <span>{selectedPatient.phone}</span>
                      </span>
                      <span>•</span>
                      <span className="capitalize">{selectedPatient.gender || 'Female'}</span>
                      {selectedPatient.age && <span>• {selectedPatient.age} yrs</span>}
                      <span>•</span>
                      <span className="text-slate-500 text-[11px]">
                        {branches.find((b) => b.id === (selectedPatient.branchId || activeBranchId))?.name ||
                          currentUser?.branchName ||
                          'Clinic Branch'}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedPatient(null);
                    setPatientSearch('');
                  }}
                  className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-rose-600 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1 font-medium"
                  title="Change patient"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>{isBn ? 'পরিবর্তন' : 'Change'}</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    placeholder={
                      isBn
                        ? 'মোবাইল নম্বর (+8801...) দিয়ে পেশেন্ট খুঁজুন...'
                        : 'Search patient by mobile number (+8801...), name, or SX ID...'
                    }
                    className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F] transition-all"
                    autoFocus
                  />
                  {patientSearch && (
                    <button
                      type="button"
                      onClick={() => setPatientSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Search Results Dropdown/List */}
                {patientSearch.trim().length > 0 ? (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pt-1">
                    {filteredPatients.length > 0 ? (
                      filteredPatients.map((pt) => (
                        <div
                          key={pt.id}
                          onClick={() => {
                            setSelectedPatient(pt);
                            setPatientSearch('');
                          }}
                          className="p-2.5 bg-slate-50 hover:bg-emerald-50/80 border border-slate-200 hover:border-emerald-300 rounded-lg flex items-center justify-between cursor-pointer transition-colors group"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-emerald-100 group-hover:bg-[#0DA54F] text-[#0DA54F] group-hover:text-white flex items-center justify-center font-bold text-xs shrink-0 transition-colors">
                              {pt.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-xs text-slate-900 group-hover:text-emerald-950">
                                {pt.name}
                              </p>
                              <div className="text-[11px] text-slate-600 flex items-center gap-1.5 font-mono">
                                <span className="font-semibold text-emerald-700 flex items-center gap-0.5">
                                  <Smartphone className="w-3 h-3 text-emerald-600" />
                                  {pt.phone}
                                </span>
                                <span>•</span>
                                <span>{pt.patientIdCode || pt.id}</span>
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="text-[11px] font-bold text-[#0DA54F] group-hover:bg-[#0DA54F] group-hover:text-white px-2.5 py-1 bg-white rounded-md border border-emerald-200 transition-colors"
                          >
                            {isBn ? 'নির্বাচন' : 'Select'}
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="py-4 text-center text-xs text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                        {isBn
                          ? 'এই ফোন নম্বরে কোনো নিবন্ধিত পেশেন্ট পাওয়া যায়নি।'
                          : 'No patient found with this phone number or query.'}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-3 px-4 bg-slate-50/70 rounded-lg border border-dashed border-slate-200 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                    <Smartphone className="w-4 h-4 text-slate-400" />
                    <span>
                      {isBn
                        ? 'পেশেন্ট নির্বাচন করতে উপরে মোবাইল নম্বর লিখুন।'
                        : 'Enter mobile phone number (+8801...) above to search and select patient.'}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Item Catalog */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            {/* Catalog Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <button
                onClick={() => setCatalogTab('procedures')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  catalogTab === 'procedures'
                    ? 'bg-[#0DA54F] text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                1. Clinical Procedures ({procedureCatalog.length})
              </button>
              <button
                onClick={() => setCatalogTab('packages')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  catalogTab === 'packages'
                    ? 'bg-[#0DA54F] text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                2. Master Packages ({packageCatalog.length})
              </button>
              <button
                onClick={() => setCatalogTab('products')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  catalogTab === 'products'
                    ? 'bg-[#0DA54F] text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                3. Retail Skincare Products ({productCatalog.length})
              </button>
            </div>

            {/* Catalog Items Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
              {catalogTab === 'procedures' &&
                procedureCatalog.map((proc) => {
                  const cartItem = cart.find((c) => c.id === proc.id);
                  const inCart = Boolean(cartItem);
                  const qty = cartItem?.quantity || 0;

                  return (
                    <div
                      key={proc.id}
                      onClick={() => addToCart(proc, 'procedure')}
                      className={`p-3 rounded-xl border text-left transition-all group flex flex-col justify-between cursor-pointer relative ${
                        inCart
                          ? 'border-[#0DA54F] bg-emerald-50/50 shadow-xs ring-2 ring-[#0DA54F]/20'
                          : 'border-slate-200 hover:border-emerald-300 bg-white hover:bg-emerald-50/30 shadow-2xs'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${inCart ? 'text-[#0DA54F]' : 'text-slate-400'}`}>
                            {proc.category}
                          </span>
                          {inCart ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0DA54F] text-white shadow-2xs shrink-0 animate-in zoom-in-95 duration-100">
                              <Check className="w-3 h-3 stroke-[3]" />
                              <span>{isBn ? 'কার্টে যুক্ত' : 'In Cart'} ({qty})</span>
                            </span>
                          ) : (
                            <div className="w-6 h-6 rounded-md bg-slate-100 group-hover:bg-emerald-100 flex items-center justify-center transition-colors shrink-0">
                              <Plus className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#0DA54F] group-hover:scale-110 transition-all" />
                            </div>
                          )}
                        </div>
                        <h4 className={`font-semibold text-xs line-clamp-1 mt-1 ${inCart ? 'text-slate-900 font-bold' : 'text-slate-800'}`}>
                          {proc.name}
                        </h4>
                      </div>

                      <div className="pt-2 flex items-center justify-between border-t border-slate-100 mt-2">
                        <div className="font-mono font-bold text-xs text-[#0DA54F]">
                          {formatBDT(proc.price)}
                        </div>

                        {inCart ? (
                          <div
                            className="flex items-center gap-1 bg-white border border-emerald-300 rounded-lg p-0.5 shadow-2xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => updateQuantity(proc.id, -1)}
                              className="w-5 h-5 flex items-center justify-center rounded hover:bg-rose-50 text-slate-500 hover:text-rose-600 transition-colors"
                              title="Decrease"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="font-mono font-bold text-xs px-1 text-emerald-800 min-w-[16px] text-center">
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => addToCart(proc, 'procedure')}
                              className="w-5 h-5 flex items-center justify-center rounded bg-emerald-100 hover:bg-[#0DA54F] text-[#0DA54F] hover:text-white transition-colors"
                              title="Increase"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 group-hover:text-[#0DA54F] font-medium">
                            + {isBn ? 'যোগ করুন' : 'Add'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

              {catalogTab === 'packages' &&
                packageCatalog.map((pkg) => {
                  const cartItem = cart.find((c) => c.id === pkg.id);
                  const inCart = Boolean(cartItem);
                  const qty = cartItem?.quantity || 0;

                  return (
                    <div
                      key={pkg.id}
                      onClick={() => addToCart(pkg, 'package')}
                      className={`p-3 rounded-xl border text-left transition-all group flex flex-col justify-between cursor-pointer relative ${
                        inCart
                          ? 'border-purple-600 bg-purple-50/60 shadow-xs ring-2 ring-purple-500/20'
                          : 'border-purple-200 hover:border-purple-300 bg-purple-50/20 hover:bg-purple-50/50 shadow-2xs'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">
                            Package Bundle
                          </span>
                          {inCart ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-600 text-white shadow-2xs shrink-0 animate-in zoom-in-95 duration-100">
                              <Check className="w-3 h-3 stroke-[3]" />
                              <span>{isBn ? 'কার্টে যুক্ত' : 'In Cart'} ({qty})</span>
                            </span>
                          ) : (
                            <div className="w-6 h-6 rounded-md bg-purple-100/70 group-hover:bg-purple-200 flex items-center justify-center transition-colors shrink-0">
                              <Plus className="w-3.5 h-3.5 text-purple-500 group-hover:text-purple-700 group-hover:scale-110 transition-all" />
                            </div>
                          )}
                        </div>
                        <h4 className="font-semibold text-xs text-slate-900 line-clamp-1 mt-1">
                          {pkg.name}
                        </h4>
                      </div>

                      <div className="pt-2 flex items-center justify-between border-t border-purple-100 mt-2">
                        <div className="font-mono font-bold text-xs text-purple-700">
                          {formatBDT(pkg.price)}
                        </div>

                        {inCart ? (
                          <div
                            className="flex items-center gap-1 bg-white border border-purple-300 rounded-lg p-0.5 shadow-2xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => updateQuantity(pkg.id, -1)}
                              className="w-5 h-5 flex items-center justify-center rounded hover:bg-rose-50 text-slate-500 hover:text-rose-600 transition-colors"
                              title="Decrease"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="font-mono font-bold text-xs px-1 text-purple-900 min-w-[16px] text-center">
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => addToCart(pkg, 'package')}
                              className="w-5 h-5 flex items-center justify-center rounded bg-purple-100 hover:bg-purple-600 text-purple-700 hover:text-white transition-colors"
                              title="Increase"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-purple-500 group-hover:text-purple-700 font-medium">
                            + {isBn ? 'যোগ করুন' : 'Add'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

              {catalogTab === 'products' &&
                productCatalog.map((prd) => {
                  const cartItem = cart.find((c) => c.id === prd.id);
                  const inCart = Boolean(cartItem);
                  const qty = cartItem?.quantity || 0;

                  return (
                    <div
                      key={prd.id}
                      onClick={() => addToCart(prd, 'product')}
                      className={`p-3 rounded-xl border text-left transition-all group flex flex-col justify-between cursor-pointer relative ${
                        inCart
                          ? 'border-blue-600 bg-blue-50/60 shadow-xs ring-2 ring-blue-500/20'
                          : 'border-blue-200 hover:border-blue-300 bg-blue-50/20 hover:bg-blue-50/50 shadow-2xs'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                            {prd.category}
                          </span>
                          {inCart ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white shadow-2xs shrink-0 animate-in zoom-in-95 duration-100">
                              <Check className="w-3 h-3 stroke-[3]" />
                              <span>{isBn ? 'কার্টে যুক্ত' : 'In Cart'} ({qty})</span>
                            </span>
                          ) : (
                            <div className="w-6 h-6 rounded-md bg-blue-100/70 group-hover:bg-blue-200 flex items-center justify-center transition-colors shrink-0">
                              <Plus className="w-3.5 h-3.5 text-blue-500 group-hover:text-blue-700 group-hover:scale-110 transition-all" />
                            </div>
                          )}
                        </div>
                        <h4 className="font-semibold text-xs text-slate-900 line-clamp-1 mt-1">
                          {prd.name}
                        </h4>
                      </div>

                      <div className="pt-2 flex items-center justify-between border-t border-blue-100 mt-2">
                        <div className="font-mono font-bold text-xs text-blue-700">
                          {formatBDT(prd.price)}
                        </div>

                        {inCart ? (
                          <div
                            className="flex items-center gap-1 bg-white border border-blue-300 rounded-lg p-0.5 shadow-2xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => updateQuantity(prd.id, -1)}
                              className="w-5 h-5 flex items-center justify-center rounded hover:bg-rose-50 text-slate-500 hover:text-rose-600 transition-colors"
                              title="Decrease"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="font-mono font-bold text-xs px-1 text-blue-900 min-w-[16px] text-center">
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => addToCart(prd, 'product')}
                              className="w-5 h-5 flex items-center justify-center rounded bg-blue-100 hover:bg-blue-600 text-blue-700 hover:text-white transition-colors"
                              title="Increase"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-blue-500 group-hover:text-blue-700 font-medium">
                            + {isBn ? 'যোগ করুন' : 'Add'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Right Column: POS Cart, Summary & Split Tender (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            {/* Cart Header */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <ShoppingBag className="w-4 h-4 text-[#0DA54F]" />
                <span>{isBn ? 'বিলিং কার্ট' : 'Checkout Cart'}</span>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 font-mono text-slate-600">
                  {cart.length}
                </span>
              </span>

              {cart.length > 0 && (
                <button
                  onClick={() => setCart([])}
                  className="text-[11px] text-rose-600 hover:text-rose-800 font-medium cursor-pointer"
                >
                  {isBn ? 'কার্ট খালি করুন' : 'Clear Cart'}
                </button>
              )}
            </div>

            {/* Cart Items List */}
            {cart.length === 0 ? (
              <div className="py-8 text-center text-slate-400 space-y-1">
                <ShoppingBag className="w-8 h-8 mx-auto opacity-30" />
                <p className="text-xs font-medium">Cart is currently empty</p>
                <p className="text-[11px] text-slate-400">Click items from catalog or pull from doctor Rx.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {cart.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{item.name}</p>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {formatBDT(item.price)} × {item.quantity}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        className="w-5 h-5 rounded bg-white border border-slate-200 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-100"
                      >
                        -
                      </button>
                      <span className="font-mono font-bold text-slate-800 w-4 text-center">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className="w-5 h-5 rounded bg-white border border-slate-200 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-100"
                      >
                        +
                      </button>
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 ml-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Referral Partner / Doctor Attribution */}
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-50/80 via-teal-50/40 to-slate-50 border border-emerald-100 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-2xs">
                    <Percent className="w-3 h-3 stroke-[2.5]" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                    {isBn ? 'রেফারাল পার্টনার / কমিশন' : 'Referral Partner / Doctor'}
                  </span>
                </div>
                {selectedReferrer && (
                  <button
                    type="button"
                    onClick={() => setSelectedReferrerId('')}
                    className="text-[10px] text-slate-400 hover:text-rose-600 font-medium cursor-pointer"
                  >
                    {isBn ? 'রিমুভ' : 'Remove'}
                  </button>
                )}
              </div>

              <div>
                <select
                  value={selectedReferrerId}
                  onChange={(e) => setSelectedReferrerId(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1.5 focus:ring-emerald-500 focus:border-emerald-500 font-medium shadow-2xs cursor-pointer"
                >
                  <option value="">
                    {isLoadingReferrers
                      ? 'Loading referrals directory...'
                      : isBn
                      ? '— সরাসরি ওয়াক-ইন (কোনো রেফারাল নেই) —'
                      : '— Direct Walk-in (No Referral Partner) —'}
                  </option>
                  {referrers.map((ref) => (
                    <option key={ref.id} value={ref.id}>
                      {ref.fullName} ({ref.referrerCode}) • {ref.referrerType.toUpperCase()}{ref.organizationName ? ` - ${ref.organizationName}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {selectedReferrer && (
                <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-emerald-100/70 border border-emerald-200/80 text-[11px] animate-in fade-in duration-200">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <span className="text-emerald-900 font-medium truncate">
                      {selectedReferrer.fullName}
                      <span className="text-emerald-700 ml-1">({selectedReferrer.referrerType})</span>
                    </span>
                  </div>
                  <div className="text-right shrink-0 font-mono font-bold text-emerald-800">
                    {estimatedCommission > 0 ? (
                      <span title="Auto-accrues upon payment settlement">
                        Est. {formatBDT(estimatedCommission)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-emerald-600 font-normal">Active Attribution</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Calculation summary */}
            <div className="pt-2 border-t border-slate-200 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-mono font-medium">{formatBDT(subtotal)}</span>
              </div>

              {/* Discount Input */}
              <div className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-1">
                  <BadgePercent className="w-3.5 h-3.5 text-amber-600" />
                  <span>Discount (৳):</span>
                </span>
                <input
                  type="number"
                  min="0"
                  value={discountAmount || ''}
                  onChange={(e) => setDiscountAmount(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="0"
                  className="w-24 text-right px-2 py-0.5 rounded border border-slate-200 font-mono text-xs focus:ring-1 focus:ring-[#0DA54F]"
                />
              </div>

              <div className="flex items-center justify-between text-slate-900 font-bold text-sm pt-1 border-t border-slate-100">
                <span>Net Payable:</span>
                <span className="font-mono text-[#0DA54F]">{formatBDT(netPayable)}</span>
              </div>
            </div>

            {/* Split Tender Payment Form */}
            <div className="pt-2 border-t border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Split Tender Payment Methods:
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleQuickPayFull('cash')}
                    className="text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded cursor-pointer"
                  >
                    All Cash
                  </button>
                  <button
                    onClick={() => handleQuickPayFull('bkash')}
                    className="text-[10px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded cursor-pointer"
                  >
                    All bKash
                  </button>
                  <button
                    onClick={() => handleQuickPayFull('card')}
                    className="text-[10px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded cursor-pointer"
                  >
                    All Card
                  </button>
                </div>
              </div>

              {/* Cash Input */}
              <div className="flex items-center gap-2 text-xs">
                <span className="w-16 font-medium text-slate-600">💵 Cash:</span>
                <input
                  type="number"
                  min="0"
                  value={cashAmount || ''}
                  onChange={(e) => setCashAmount(Number(e.target.value) || 0)}
                  placeholder="৳ 0"
                  className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs"
                />
              </div>

              {/* Card Input & Auth Code */}
              <div className="flex items-center gap-2 text-xs">
                <span className="w-16 font-medium text-slate-600">💳 Card:</span>
                <input
                  type="number"
                  min="0"
                  value={cardAmount || ''}
                  onChange={(e) => setCardAmount(Number(e.target.value) || 0)}
                  placeholder="৳ 0"
                  className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs"
                />
                <input
                  type="text"
                  value={cardRef}
                  onChange={(e) => setCardRef(e.target.value)}
                  placeholder="Auth Ref #"
                  className="w-24 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-mono"
                />
              </div>

              {/* bKash Input & TrxID */}
              <div className="flex items-center gap-2 text-xs">
                <span className="w-16 font-medium text-rose-600 font-bold">📱 bKash:</span>
                <input
                  type="number"
                  min="0"
                  value={bkashAmount || ''}
                  onChange={(e) => setBkashAmount(Number(e.target.value) || 0)}
                  placeholder="৳ 0"
                  className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs"
                />
                <input
                  type="text"
                  value={bkashRef}
                  onChange={(e) => setBkashRef(e.target.value)}
                  placeholder="TrxID #"
                  className="w-24 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-mono"
                />
              </div>

              {/* Nagad Input */}
              <div className="flex items-center gap-2 text-xs">
                <span className="w-16 font-medium text-amber-600 font-bold">📱 Nagad:</span>
                <input
                  type="number"
                  min="0"
                  value={nagadAmount || ''}
                  onChange={(e) => setNagadAmount(Number(e.target.value) || 0)}
                  placeholder="৳ 0"
                  className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs"
                />
                <input
                  type="text"
                  value={nagadRef}
                  onChange={(e) => setNagadRef(e.target.value)}
                  placeholder="TrxID #"
                  className="w-24 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-mono"
                />
              </div>

              {/* Tender Balances */}
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1 text-xs">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Total Tendered:</span>
                  <span className="font-mono font-bold text-slate-800">{formatBDT(totalTendered)}</span>
                </div>
                {remainingDue > 0 && (
                  <div className="flex items-center justify-between text-amber-700 font-semibold">
                    <span>Remaining Due (Pay Later):</span>
                    <span className="font-mono">{formatBDT(remainingDue)}</span>
                  </div>
                )}
                {changeDue > 0 && (
                  <div className="flex items-center justify-between text-emerald-700 font-semibold">
                    <span>Cash Change to Return:</span>
                    <span className="font-mono">{formatBDT(changeDue)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Complete Checkout Button */}
            <button
              onClick={handleCompleteCheckout}
              disabled={isProcessing || cart.length === 0}
              className={`w-full py-3 px-4 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-2 transition-all shadow-sm ${
                isProcessing || cart.length === 0
                  ? 'bg-slate-300 cursor-not-allowed'
                  : 'bg-[#0DA54F] hover:bg-[#0b8841] cursor-pointer'
              }`}
            >
              <Receipt className="w-4 h-4" />
              <span>
                {isProcessing
                  ? 'Processing Payments...'
                  : isBn
                  ? 'বিল সম্পন্ন করুন ও রসিদ প্রিন্ট'
                  : 'Complete Checkout & Print Receipt'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Clinical A4 Invoice Modal */}
      {receiptModalType && completedInvoice && (
        <A4InvoiceModal
          invoice={completedInvoice}
          onClose={() => {
            setReceiptModalType(null);
            setCompletedInvoice(null);
          }}
        />
      )}
    </div>
  );
};
