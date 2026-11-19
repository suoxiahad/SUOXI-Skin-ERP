import React, { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  Search,
  RefreshCw,
  Phone,
  Mail,
  MapPin,
  Tag,
  CreditCard,
  Truck,
  ExternalLink,
  CheckCircle2,
  FileText,
  Boxes,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';
import { api } from '../../../api/client.ts';
import type { Supplier } from '../../../types/index.ts';
import { formatBDT, formatDateDhaka } from '../../../utils/format.ts';
import { TableSkeleton } from '../../common/Skeleton.tsx';
import { EmptyState } from '../../common/EmptyState.tsx';

export const SuppliersDirectoryView: React.FC = () => {
  const { addToast, language, navigate } = useApp();
  const isBn = language === 'bn';

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddSupplier, setShowAddSupplier] = useState(false);

  // New Supplier Form
  const [formData, setFormData] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    brandsSupplied: 'Mesoestetic, SkinCeuticals',
    paymentTerms: 'Net 30' as const,
    balanceDueBDT: 0,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchSuppliers = async () => {
    setIsLoading(true);
    try {
      const list = await api.inventory.listSuppliers();
      setSuppliers(list);
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: isBn ? 'সাপ্লায়ার লোড ব্যর্থ' : 'Failed to load suppliers',
        description: (err as Error).message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const filteredSuppliers = suppliers.filter((s) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.contactPerson.toLowerCase().includes(q) ||
        s.brandsSupplied.some((b) => b.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.phone.trim()) {
      addToast({
        type: 'error',
        title: 'Required Fields',
        description: 'Supplier name and phone number are required.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const brandsArray = formData.brandsSupplied
        .split(',')
        .map((b) => b.trim())
        .filter(Boolean);

      const created = await api.inventory.createSupplier({
        name: formData.name.trim(),
        contactPerson: formData.contactPerson.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        address: formData.address.trim(),
        brandsSupplied: brandsArray,
        paymentTerms: formData.paymentTerms,
        balanceDueBDT: formData.balanceDueBDT,
      });

      setSuppliers([created, ...suppliers]);
      addToast({
        type: 'success',
        title: isBn ? 'সাপ্লায়ার নিবন্ধিত হয়েছে' : 'Supplier Registered',
        description: `${created.name} (${created.code}) saved.`,
      });
      setShowAddSupplier(false);
      setFormData({
        name: '',
        contactPerson: '',
        phone: '',
        email: '',
        address: '',
        brandsSupplied: 'Mesoestetic, SkinCeuticals',
        paymentTerms: 'Net 30',
        balanceDueBDT: 0,
      });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: isBn ? 'নিবন্ধন ব্যর্থ' : 'Registration Failed',
        description: (err as Error).message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0DA54F]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#0DA54F]">
              {isBn ? 'ভেন্ডর ও ডিস্ট্রিবিউটর ডিরেক্টরি' : 'Suppliers & Vendor Directory'}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            {isBn ? 'অনুমোদিত এস্থেটিক সাপ্লায়ার্স' : 'Aesthetic Distributors & Suppliers'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {isBn
              ? 'স্কিনকেয়ার প্রোডাক্ট, লেজার কনজুমেবলস ও ডার্মাল ইনজেকশনের অনুমোদিত ডিস্ট্রিবিউটর তালিকা ও লেজার'
              : 'Master listing of pharmaceutical importers, medical device agents, and cosmetic brand distributors.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate('/inventory/purchases')}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Truck className="w-4 h-4 text-slate-600" />
            <span>{isBn ? 'পারচেজ অর্ডার্স' : 'Purchase Orders'}</span>
          </button>
          <button
            onClick={() => setShowAddSupplier(!showAddSupplier)}
            className="px-3.5 py-2 rounded-xl bg-[#0DA54F] hover:bg-[#0a8740] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{showAddSupplier ? (isBn ? 'ফর্ম বন্ধ করুন' : 'Close Form') : (isBn ? 'নতুন সাপ্লায়ার যোগ করুন' : 'Add New Supplier')}</span>
          </button>
        </div>
      </div>

      {/* Add Supplier Inline Form (Standalone UX) */}
      {showAddSupplier && (
        <div className="bg-white rounded-2xl border border-emerald-300 shadow-md p-6 space-y-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#0DA54F] flex items-center justify-center font-bold">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  {isBn ? 'নতুন সাপ্লায়ার বা ডিস্ট্রিবিউটর নিবন্ধন' : 'Register New Aesthetic Vendor'}
                </h3>
                <span className="text-[11px] text-slate-400">
                  {isBn ? 'ব্র্যান্ড, পেমেন্ট টার্মস ও যোগাযোগের তথ্য দিন' : 'Enter company credentials, contact person, and payment terms'}
                </span>
              </div>
            </div>
            <button
              onClick={() => setShowAddSupplier(false)}
              className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleCreateSupplier} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">{isBn ? 'কোম্পানি / এজেন্সির নাম *' : 'Company / Agency Name *'}</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. BioAesthetic Solutions BD Ltd."
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:border-[#0DA54F]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">{isBn ? 'দায়িত্বপ্রাপ্ত কর্মকর্তা (Contact Person) *' : 'Contact Person *'}</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tanvir Ahmed (Key Accounts)"
                  value={formData.contactPerson}
                  onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:border-[#0DA54F]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">{isBn ? 'ফোন নম্বর *' : 'Phone Number *'}</label>
                <input
                  type="text"
                  required
                  placeholder="+880 1711-000000"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">{isBn ? 'ইমেইল এড্রেস' : 'Email Address'}</label>
                <input
                  type="email"
                  required
                  placeholder="orders@vendor.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">{isBn ? 'পেমেন্ট টার্মস' : 'Payment Terms'}</label>
                <select
                  value={formData.paymentTerms}
                  onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value as any })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg bg-white"
                >
                  <option value="Net 15">Net 15 Days</option>
                  <option value="Net 30">Net 30 Days</option>
                  <option value="Cash on Delivery">Cash on Delivery (COD)</option>
                  <option value="Advance">100% Advance Payment</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">{isBn ? 'বর্তমান বকেয়া (Balance Due BDT)' : 'Outstanding Balance (BDT)'}</label>
                <input
                  type="number"
                  min="0"
                  value={formData.balanceDueBDT}
                  onChange={(e) => setFormData({ ...formData, balanceDueBDT: parseFloat(e.target.value) || 0 })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg font-mono"
                />
              </div>

              <div className="md:col-span-2 space-y-1">
                <label className="font-semibold text-slate-700">
                  {isBn ? 'সরবরাহকৃত ব্র্যান্ডসমূহ (কমা দিয়ে আলাদা করুন)' : 'Supplied Brands (comma-separated)'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. Edge Systems, HydraFacial, LaserTech, Mesoestetic"
                  value={formData.brandsSupplied}
                  onChange={(e) => setFormData({ ...formData, brandsSupplied: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">{isBn ? 'অফিস ঠিকানা' : 'Office Address'}</label>
                <input
                  type="text"
                  placeholder="e.g. House 14, Road 11, Banani, Dhaka"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowAddSupplier(false)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
              >
                {isBn ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-[#0DA54F] hover:bg-[#0a8740] text-white font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Registering...' : isBn ? 'সাপ্লায়ার সেভ করুন' : 'Register Supplier'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search & Actions */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs flex items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={isBn ? 'কোম্পানি, কোড, ব্যক্তি বা ব্র্যান্ড দিয়ে সার্চ...' : 'Search supplier by company, brand, contact...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#0DA54F] focus:bg-white"
          />
        </div>

        <button
          onClick={fetchSuppliers}
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer"
          title="Refresh suppliers list"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Suppliers Grid Cards */}
      {isLoading ? (
        <div className="p-4 bg-white rounded-xl border border-slate-200">
          <TableSkeleton cols={4} rows={4} />
        </div>
      ) : filteredSuppliers.length === 0 ? (
        <EmptyState
          title={isBn ? 'কোনো সাপ্লায়ার পাওয়া যায়নি' : 'No Suppliers Found'}
          description={isBn ? 'নতুন ভেন্ডর নিবন্ধন করতে উপরের বাটনে ক্লিক করুন' : 'Click Add New Supplier to register distributor credentials.'}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredSuppliers.map((sup) => (
            <div
              key={sup.id}
              className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5 flex flex-col justify-between hover:border-emerald-300 transition-all space-y-4"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">
                      {sup.code}
                    </span>
                    <h3 className="font-bold text-base text-slate-900 mt-0.5">{sup.name}</h3>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    {sup.paymentTerms}
                  </span>
                </div>

                {/* Contact Person & Details */}
                <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800">{sup.contactPerson}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{sup.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{sup.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{sup.address}</span>
                  </div>
                </div>

                {/* Brands Supplied */}
                {sup.brandsSupplied && sup.brandsSupplied.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Supplied Brands:
                    </span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {sup.brandsSupplied.map((b, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium"
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Financial & Action Bar */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Ledger Payable:</span>
                  <div className="font-mono font-bold text-slate-900">
                    {formatBDT(sup.balanceDueBDT)}
                  </div>
                </div>

                <button
                  onClick={() => navigate('/inventory/purchases')}
                  className="px-3 py-1.5 rounded-lg bg-[#0DA54F] hover:bg-[#0a8740] text-white font-semibold text-xs shadow-2xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>{isBn ? 'অর্ডার তৈরি করুন' : 'Issue PO'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
