import React, { useState, useEffect, useCallback } from 'react';
import {
  Package,
  Plus,
  Search,
  Sparkles,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Layers,
  ArrowRight,
  Filter,
  RefreshCw,
  Edit2,
  X,
  Trash2,
  Check,
  ShieldAlert,
} from 'lucide-react';
import { packagesApi } from '../../api/packages.js';
import { catalogApi } from '../../api/catalog.js';
import type { PackageDto, TreatmentServiceDto, PatientPackageDto } from '@suoxi/shared-types';
import { useI18n } from '../../i18n/I18nContext.js';
import { useAuth } from '../../context/AuthContext.js';

interface PackageCatalogViewProps {
  onAssignToPatient?: (packageId: string) => void;
}

export const PackageCatalogView: React.FC<PackageCatalogViewProps> = ({
  onAssignToPatient,
}) => {
  const { lang } = useI18n();
  const isBn = lang === 'bn';
  const { user } = useAuth();

  const [loading, setLoading] = useState<boolean>(true);
  const [packages, setPackages] = useState<PackageDto[]>([]);
  const [services, setServices] = useState<TreatmentServiceDto[]>([]);
  const [expiringPackages, setExpiringPackages] = useState<PatientPackageDto[]>([]);
  const [showExpiringTab, setShowExpiringTab] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeOnly, setActiveOnly] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Add / Edit Package Modal
  const [showAddDrawer, setShowAddDrawer] = useState<boolean>(false);
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [packageName, setPackageName] = useState<string>('');
  const [packageNameBn, setPackageNameBn] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [price, setPrice] = useState<string>('38000');
  const [validityDays, setValidityDays] = useState<number>(180);
  const [packageItems, setPackageItems] = useState<{ serviceId: string; sessionCount: number }[]>([
    { serviceId: 'srv-hf-001', sessionCount: 10 },
  ]);
  const [saving, setSaving] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [pkgList, srvList, expList] = await Promise.all([
        packagesApi.listPackages({ activeOnly }),
        catalogApi.listTreatments({ activeOnly: true }),
        packagesApi.listExpiringPackages(30),
      ]);
      setPackages(pkgList);
      setServices(srvList);
      setExpiringPackages(expList);
    } catch (err: any) {
      console.error('Failed to load packages:', err);
      setError(err.message || 'Failed to load treatment packages');
    } finally {
      setLoading(false);
    }
  }, [activeOnly]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenAdd = () => {
    setEditingPackageId(null);
    setPackageName('');
    setPackageNameBn('');
    setDescription('');
    setPrice('38000');
    setValidityDays(180);
    setPackageItems([{ serviceId: services[0]?.id || 'srv-hf-001', sessionCount: 10 }]);
    setShowAddDrawer(true);
  };

  const handleAddItemRow = () => {
    if (services.length === 0) return;
    setPackageItems((prev) => [
      ...prev,
      { serviceId: services[0]?.id || '', sessionCount: 4 },
    ]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (packageItems.length <= 1) return;
    setPackageItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: 'serviceId' | 'sessionCount', val: any) => {
    setPackageItems((prev) =>
      prev.map((it, idx) => (idx === index ? { ...it, [field]: val } : it))
    );
  };

  const handleSavePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!packageName.trim()) {
      alert('Package name is required');
      return;
    }
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      alert('Please enter a valid price in BDT (৳)');
      return;
    }
    if (validityDays <= 0) {
      alert('Validity days must be greater than 0');
      return;
    }

    try {
      setSaving(true);
      if (editingPackageId) {
        await packagesApi.updatePackage(editingPackageId, {
          name: packageName.trim(),
          nameBn: packageNameBn.trim() || undefined,
          description: description.trim() || undefined,
          price: priceNum.toFixed(2),
          validityDays,
        });
      } else {
        await packagesApi.createPackage({
          name: packageName.trim(),
          nameBn: packageNameBn.trim() || undefined,
          description: description.trim() || undefined,
          price: priceNum.toFixed(2),
          validityDays,
          items: packageItems,
        });
      }
      setShowAddDrawer(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to save package');
    } finally {
      setSaving(false);
    }
  };

  const filteredPackages = packages.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.packageCode.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      (p.nameBn && p.nameBn.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-brand-text">
              {isBn ? 'ট্রিটমেন্ট প্যাকেজ ক্যাটালগ' : 'Treatment Package Catalog'}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-brand-primary border border-emerald-200">
              {isBn ? 'বান্ডেল সেশন' : 'Bundled Sessions'}
            </span>
          </div>
          <p className="text-sm text-brand-muted mt-1">
            {isBn
              ? 'মাল্টি-সেশন প্যাকেজ, নির্ধারিত মেয়াদ এবং রোগীভিত্তিক স্বয়ংক্রিয় সেশন ডিডাকশন।'
              : 'Multi-session procedure bundles, validity periods, and immutable session ledger tracking.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowExpiringTab(!showExpiringTab)}
            className={`px-3.5 py-2 rounded-lg text-sm font-medium border flex items-center gap-1.5 transition-colors ${
              showExpiringTab
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'bg-white border-brand-border text-brand-text hover:bg-slate-50'
            }`}
          >
            <Clock className="w-4 h-4 text-amber-600" />
            {isBn ? 'মেয়াদোত্তীর্ণের কাছাকাছি' : 'Expiring Soon'}
            {expiringPackages.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold bg-amber-200 text-amber-900">
                {expiringPackages.length}
              </span>
            )}
          </button>

          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 bg-brand-primary hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            {isBn ? 'নতুন প্যাকেজ যোগ করুন' : 'Add Package'}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white/80 backdrop-blur-sm border border-brand-border rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-brand-muted uppercase tracking-wider">
              {isBn ? 'মোট সক্রিয় প্যাকেজ' : 'Active Catalog Packages'}
            </span>
            <Package className="w-5 h-5 text-brand-primary" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-brand-text">
              {packages.filter((p) => p.isActive).length}
            </span>
            <span className="text-xs text-brand-muted">
              / {packages.length} {isBn ? 'মোট' : 'total'}
            </span>
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-sm border border-brand-border rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-brand-muted uppercase tracking-wider">
              {isBn ? '৩০ দিনে মেয়াদ শেষ' : 'Expiring in 30 Days'}
            </span>
            <Clock className="w-5 h-5 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-700">
              {expiringPackages.length}
            </span>
            <span className="text-xs text-brand-muted">
              {isBn ? 'রোগী প্যাকেজ' : 'patient packages'}
            </span>
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-sm border border-brand-border rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-brand-muted uppercase tracking-wider">
              {isBn ? 'লেজার নিয়ম' : 'Hard Rule 5 Guard'}
            </span>
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="mt-2 text-xs font-medium text-emerald-800">
            {isBn
              ? 'একই সেশন দুবার কর্তন অসম্ভব (UNIQUE লেজার ইনভেরিয়েন্ট)'
              : 'Zero double deductions enforced via append-only session ledger'}
          </div>
        </div>
      </div>

      {/* Expiring Soon Banner / Section */}
      {showExpiringTab && (
        <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-4 shadow-sm animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              {isBn ? 'আসন্ন ৩০ দিনে মেয়াদোত্তীর্ণ প্যাকেজসমূহ' : 'Patient Packages Expiring Within 30 Days'}
            </div>
            <button
              onClick={() => setShowExpiringTab(false)}
              className="text-amber-700 hover:text-amber-900 text-xs font-medium"
            >
              {isBn ? 'লুকান' : 'Dismiss'}
            </button>
          </div>

          {expiringPackages.length === 0 ? (
            <p className="text-xs text-amber-800 italic">
              {isBn ? 'কোনো প্যাকেজের মেয়াদ ৩০ দিনের মধ্যে শেষ হচ্ছে না।' : 'No active packages are expiring in the next 30 days.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {expiringPackages.map((ep) => {
                const totalRem = ep.items.reduce((acc, it) => acc + it.remainingSessions, 0);
                const totalInit = ep.items.reduce((acc, it) => acc + it.initialSessions, 0);
                return (
                  <div key={ep.id} className="bg-white border border-amber-200 rounded-lg p-3 text-xs shadow-2xs">
                    <div className="flex items-center justify-between font-semibold text-brand-text">
                      <span>{ep.patientName}</span>
                      <span className="text-amber-700 font-mono">{ep.daysToExpiry} days left</span>
                    </div>
                    <div className="text-brand-muted mt-0.5">{ep.packageName} ({ep.packageCode})</div>
                    <div className="mt-2 flex items-center justify-between text-brand-muted pt-2 border-t border-slate-100">
                      <span>Remaining: <strong className="text-brand-text font-mono">{totalRem} of {totalInit}</strong></span>
                      <span className="font-mono text-slate-500">Exp: {ep.expiryDate}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white border border-brand-border rounded-xl p-4 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isBn ? 'প্যাকেজের নাম বা কোড দিয়ে খুঁজুন...' : 'Search by package name or code...'}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-brand-border rounded-lg text-sm text-brand-text focus:outline-hidden focus:ring-2 focus:ring-brand-primary"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <label className="flex items-center gap-2 text-xs font-medium text-brand-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              className="rounded text-brand-primary focus:ring-brand-primary"
            />
            {isBn ? 'শুধুমাত্র সক্রিয় প্যাকেজ' : 'Active Only'}
          </label>

          <button
            onClick={() => loadData()}
            className="p-2 border border-brand-border rounded-lg hover:bg-slate-50 text-brand-muted hover:text-brand-text"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Package Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-brand-border rounded-xl p-6 h-64 animate-pulse">
              <div className="h-6 bg-slate-100 rounded w-1/2 mb-4" />
              <div className="h-4 bg-slate-100 rounded w-3/4 mb-2" />
              <div className="h-4 bg-slate-100 rounded w-1/3 mb-6" />
              <div className="h-10 bg-slate-100 rounded w-full" />
            </div>
          ))}
        </div>
      ) : filteredPackages.length === 0 ? (
        <div className="bg-white border border-brand-border rounded-xl p-12 text-center shadow-xs">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-brand-text">
            {isBn ? 'কোনো প্যাকেজ পাওয়া যায়নি' : 'No Packages Found'}
          </h3>
          <p className="text-sm text-brand-muted mt-1">
            {isBn ? 'অনুগ্রহ করে নতুন প্যাকেজ তৈরি করুন।' : 'Add a new treatment package to start bundle sales.'}
          </p>
          <button
            onClick={handleOpenAdd}
            className="mt-4 px-4 py-2 bg-brand-primary text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            {isBn ? 'নতুন প্যাকেজ যোগ করুন' : 'Create Package'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPackages.map((pkg) => {
            const totalSessions = pkg.items.reduce((acc, it) => acc + it.sessionCount, 0);

            return (
              <div
                key={pkg.id}
                className="bg-white border border-brand-border rounded-xl shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between overflow-hidden"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                        {pkg.packageCode}
                      </span>
                      <h3 className="text-lg font-bold text-brand-text mt-2">
                        {pkg.name}
                      </h3>
                      {pkg.nameBn && (
                        <div className="text-xs text-brand-muted mt-0.5 font-medium">
                          {pkg.nameBn}
                        </div>
                      )}
                    </div>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        pkg.isActive
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {pkg.isActive ? (isBn ? 'সক্রিয়' : 'Active') : (isBn ? 'নিষ্ক্রিয়' : 'Inactive')}
                    </span>
                  </div>

                  {pkg.description && (
                    <p className="text-xs text-brand-muted mt-3 line-clamp-2">
                      {pkg.description}
                    </p>
                  )}

                  {/* Included Services List */}
                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                    <span className="text-xs font-semibold text-brand-text flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-brand-primary" />
                      {isBn ? 'অন্তর্ভুক্ত সেবা ও সেশন' : 'Included Treatments'}:
                    </span>
                    <div className="space-y-1.5">
                      {pkg.items.map((it) => (
                        <div
                          key={it.id}
                          className="flex items-center justify-between text-xs bg-slate-50 px-2.5 py-1.5 rounded-md border border-slate-100"
                        >
                          <span className="font-medium text-brand-text truncate mr-2">
                            {it.serviceName || it.serviceId}
                          </span>
                          <span className="font-semibold text-brand-primary whitespace-nowrap font-mono">
                            {it.sessionCount} {isBn ? 'সেশন' : 'sessions'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Footer Info & Actions */}
                <div className="bg-slate-50/80 px-5 py-3.5 border-t border-brand-border flex items-center justify-between">
                  <div>
                    <div className="text-xs text-brand-muted">
                      {isBn ? 'মূল্য ও মেয়াদ' : 'Price & Validity'}
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-lg font-bold text-brand-text font-mono">
                        ৳ {Number(pkg.price).toLocaleString('en-US')}
                      </span>
                      <span className="text-xs text-brand-muted">
                        • {pkg.validityDays} {isBn ? 'দিন' : 'days'}
                      </span>
                    </div>
                  </div>

                  {onAssignToPatient && (
                    <button
                      onClick={() => onAssignToPatient(pkg.id)}
                      className="px-3 py-1.5 bg-brand-primary hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold shadow-2xs flex items-center gap-1 transition-colors"
                    >
                      {isBn ? 'বরাদ্দ করুন' : 'Assign'}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Package Modal Drawer */}
      {showAddDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border border-brand-border rounded-xl shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-brand-border flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-brand-text">
                  {editingPackageId
                    ? (isBn ? 'প্যাকেজ সম্পাদনা করুন' : 'Edit Treatment Package')
                    : (isBn ? 'নতুন ট্রিটমেন্ট প্যাকেজ তৈরি করুন' : 'Create Treatment Package')}
                </h3>
                <p className="text-xs text-brand-muted mt-0.5">
                  {isBn
                    ? 'বান্ডেল সেবা, মূল্য ও মেয়াদের নিয়মাবলী নির্ধারণ করুন।'
                    : 'Configure bundle pricing, included treatments, and validity days.'}
                </p>
              </div>
              <button
                onClick={() => setShowAddDrawer(false)}
                className="p-1 rounded-md text-brand-muted hover:text-brand-text hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePackage} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-brand-text mb-1">
                    {isBn ? 'প্যাকেজের নাম (ইংরেজি)' : 'Package Name (English)'} *
                  </label>
                  <input
                    type="text"
                    required
                    value={packageName}
                    onChange={(e) => setPackageName(e.target.value)}
                    placeholder="e.g. Glow Boost Package"
                    className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm focus:ring-2 focus:ring-brand-primary focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-brand-text mb-1">
                    {isBn ? 'প্যাকেজের নাম (বাংলা)' : 'Package Name (Bangla)'}
                  </label>
                  <input
                    type="text"
                    value={packageNameBn}
                    onChange={(e) => setPackageNameBn(e.target.value)}
                    placeholder="যেমন: গ্লো বুস্ট প্যাকেজ"
                    className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm focus:ring-2 focus:ring-brand-primary focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-text mb-1">
                  {isBn ? 'বিবরণ' : 'Description'}
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Clinical benefits, indications, and regimen summary..."
                  className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm focus:ring-2 focus:ring-brand-primary focus:outline-hidden resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-brand-text mb-1">
                    {isBn ? 'প্যাকেজ মূল্য (টাকা ৳)' : 'Package Price (BDT ৳)'} *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-brand-primary focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-brand-text mb-1">
                    {isBn ? 'মেয়াদ (দিন)' : 'Validity (Days)'} *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={validityDays}
                    onChange={(e) => setValidityDays(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-brand-primary focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Treatment Services Repeater */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-brand-text">
                    {isBn ? 'অন্তর্ভুক্ত চিকিৎসা ও সেশন সংখ্যা' : 'Included Treatments & Session Counts'} *
                  </label>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="text-xs font-semibold text-brand-primary hover:text-emerald-700 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {isBn ? 'সেবা যোগ করুন' : 'Add Treatment'}
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {packageItems.map((it, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200"
                    >
                      <select
                        value={it.serviceId}
                        onChange={(e) => handleItemChange(idx, 'serviceId', e.target.value)}
                        className="flex-1 bg-white border border-brand-border rounded-md px-2.5 py-1.5 text-xs text-brand-text focus:ring-1 focus:ring-brand-primary"
                      >
                        {services.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.service_code}) - ৳ {s.base_price}
                          </option>
                        ))}
                      </select>

                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={it.sessionCount}
                          onChange={(e) =>
                            handleItemChange(idx, 'sessionCount', parseInt(e.target.value, 10) || 1)
                          }
                          className="w-16 bg-white border border-brand-border rounded-md px-2 py-1.5 text-xs text-center font-mono focus:ring-1 focus:ring-brand-primary"
                        />
                        <span className="text-xs text-brand-muted">sessions</span>
                      </div>

                      {packageItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItemRow(idx)}
                          className="p-1 text-slate-400 hover:text-red-500 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-brand-border flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddDrawer(false)}
                  className="px-4 py-2 border border-brand-border rounded-lg text-xs font-semibold text-brand-text hover:bg-slate-50"
                >
                  {isBn ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-brand-primary hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                >
                  {saving ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  {isBn ? 'সংরক্ষণ করুন' : 'Save Package'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
