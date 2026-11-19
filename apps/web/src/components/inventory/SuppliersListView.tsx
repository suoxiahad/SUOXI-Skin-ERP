import React, { useState, useEffect, useCallback } from 'react';
import {
  Truck,
  Plus,
  Search,
  RefreshCw,
  AlertTriangle,
  Phone,
  Mail,
  MapPin,
  CheckCircle2,
  X,
  CreditCard,
  Building2,
} from 'lucide-react';
import { inventoryApi } from '../../api/inventory.js';
import type { SupplierDto, CreateSupplierRequest } from '@suoxi/shared-types';
import { useI18n } from '../../i18n/I18nContext.js';

export const SuppliersListView: React.FC = () => {
  const { lang } = useI18n();
  const isBn = lang === 'bn';

  const [loading, setLoading] = useState<boolean>(true);
  const [suppliers, setSuppliers] = useState<SupplierDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Drawer
  const [showAddDrawer, setShowAddDrawer] = useState<boolean>(false);
  const [name, setName] = useState('');
  const [nameBn, setNameBn] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('+8801');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Net 30');
  const [saving, setSaving] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  const loadSuppliers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await inventoryApi.getSuppliers();
      setSuppliers(list);
    } catch (err: any) {
      console.error('Failed to load suppliers:', err);
      setError(err.message || 'Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setDrawerError(null);

    if (!name.trim() || !phone.trim()) {
      setDrawerError(isBn ? 'সরবরাহকারীর নাম ও ফোন নম্বর আবশ্যক' : 'Supplier name and phone are required');
      return;
    }

    try {
      setSaving(true);
      const payload: CreateSupplierRequest = {
        name: name.trim(),
        name_bn: nameBn.trim() || undefined,
        contact_person: contactPerson.trim() || undefined,
        phone: phone.trim(),
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        payment_terms: paymentTerms,
      };

      await inventoryApi.createSupplier(payload);
      setShowAddDrawer(false);
      setName('');
      setNameBn('');
      setContactPerson('');
      setPhone('+8801');
      setEmail('');
      setAddress('');
      loadSuppliers();
    } catch (err: any) {
      console.error('Failed to create supplier:', err);
      setDrawerError(err.message || 'Failed to create supplier');
    } finally {
      setSaving(false);
    }
  };

  const filteredSuppliers = suppliers.filter((s) => {
    const q = searchQuery.toLowerCase();
    return (
      s.supplier_code.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      (s.contact_person && s.contact_person.toLowerCase().includes(q)) ||
      s.phone.includes(q)
    );
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/80 backdrop-blur-md p-6 rounded-xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600 mb-1">
            <Truck className="w-4 h-4" />
            <span>{isBn ? 'সরবরাহকারী পার্টনার্স' : 'Vendor & Supplier Management'}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {isBn ? 'সরবরাহকারী তালিকা' : 'Suppliers & Vendors'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {isBn
              ? 'ক্লিনিক্যাল সরঞ্জাম, সিরাম ও লেজার পার্টস সরবরাহকারীদের তথ্য ও পেমেন্ট শর্তাবলী।'
              : 'Authorized aesthetic pharmaceutical and consumable suppliers with procurement terms.'}
          </p>
        </div>

        <button
          onClick={() => setShowAddDrawer(true)}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>{isBn ? 'নতুন সরবরাহকারী যোগ' : 'Add Supplier'}</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isBn ? 'সরবরাহকারীর নাম বা ফোন দিয়ে খুঁজুন...' : 'Search supplier name, contact, phone...'}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-emerald-500"
          />
        </div>

        <button
          onClick={loadSuppliers}
          disabled={loading}
          className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
        </button>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-800">{error}</p>
            <button
              onClick={loadSuppliers}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
            >
              {isBn ? 'পুনরায় চেষ্টা করুন' : 'Retry'}
            </button>
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Truck className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-700">
              {isBn ? 'কোনো সরবরাহকারী পাওয়া যায়নি' : 'No suppliers found'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">Code</th>
                  <th className="py-3.5 px-4">{isBn ? 'সরবরাহকারী প্রতিষ্ঠান' : 'Supplier Company'}</th>
                  <th className="py-3.5 px-4">{isBn ? 'যোগাযোগ ব্যক্তি' : 'Contact Person'}</th>
                  <th className="py-3.5 px-4">{isBn ? 'যোগাযোগের নম্বর' : 'Phone / Email'}</th>
                  <th className="py-3.5 px-4">{isBn ? 'পেমেন্ট শর্তাবলী' : 'Payment Terms'}</th>
                  <th className="py-3.5 px-4 text-center">{isBn ? 'স্ট্যাটাস' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredSuppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/60 transition-colors h-12">
                    <td className="py-3 px-4 font-mono font-bold text-slate-800">{s.supplier_code}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{s.name}</div>
                      {s.name_bn && <div className="text-[11px] text-slate-400 font-bengali">{s.name_bn}</div>}
                    </td>
                    <td className="py-3 px-4 text-slate-700">{s.contact_person || '—'}</td>
                    <td className="py-3 px-4 text-slate-600">
                      <div className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-1 font-mono">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {s.phone}
                        </span>
                        {s.email && (
                          <span className="flex items-center gap-1 text-[11px] text-slate-400">
                            <Mail className="w-3 h-3" />
                            {s.email}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700 font-medium">
                        {s.payment_terms || 'Net 30'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" />
                        Active
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Supplier Drawer */}
      {showAddDrawer && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/30 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-emerald-600" />
                <h2 className="text-base font-bold text-slate-800">
                  {isBn ? 'নতুন সরবরাহকারী নিবন্ধন' : 'Add New Supplier'}
                </h2>
              </div>
              <button
                onClick={() => setShowAddDrawer(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {drawerError && (
              <div className="m-6 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {drawerError}
              </div>
            )}

            <form onSubmit={handleCreateSupplier} className="p-6 space-y-4 flex-1 overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  {isBn ? 'প্রতিষ্ঠানের নাম' : 'Company / Supplier Name'} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Apex Aesthetic Supplies Ltd"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  {isBn ? 'প্রতিষ্ঠানের নাম (বাংলা)' : 'Company Name (Bangla)'}
                </label>
                <input
                  type="text"
                  value={nameBn}
                  onChange={(e) => setNameBn(e.target.value)}
                  placeholder="e.g., অ্যাপেক্স নান্দনিক সরবরাহ লিমিটেড"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none font-bengali"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  {isBn ? 'যোগাযোগ ব্যক্তি' : 'Contact Person'}
                </label>
                <input
                  type="text"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  placeholder="e.g., Md. Tareq Hasan"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    {isBn ? 'ফোন নম্বর' : 'Phone (+880)'} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-emerald-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    {isBn ? 'ইমেইল' : 'Email'}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="orders@vendor.com"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  {isBn ? 'পেমেন্ট শর্তাবলী' : 'Payment Terms'}
                </label>
                <select
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="Net 30">Net 30 Days</option>
                  <option value="Net 15">Net 15 Days</option>
                  <option value="Cash on Delivery">Cash on Delivery (COD)</option>
                  <option value="Advance">Advance Payment</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  {isBn ? 'ঠিকানা' : 'Address'}
                </label>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street, area, city..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddDrawer(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {isBn ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>{isBn ? 'সংরক্ষণ করুন' : 'Save Supplier'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
