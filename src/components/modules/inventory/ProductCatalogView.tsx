import React, { useState, useEffect } from 'react';
import {
  Boxes,
  Plus,
  Search,
  RefreshCw,
  Check,
  AlertCircle,
  Tag,
  Percent,
  Barcode,
  Layers,
  Sparkles,
  ArrowRight,
  ChevronDown,
  Building2,
  FileText,
  SlidersHorizontal,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';
import { api } from '../../../api/client.ts';
import type { InventoryItem, ProductType } from '../../../types/index.ts';
import { formatBDT } from '../../../utils/format.ts';
import { TableSkeleton } from '../../common/Skeleton.tsx';
import { EmptyState } from '../../common/EmptyState.tsx';

export const ProductCatalogView: React.FC = () => {
  const { addToast, language, navigate } = useApp();
  const isBn = language === 'bn';

  const [products, setProducts] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [showAddForm, setShowAddForm] = useState(false);

  // Form State for New Product (Empty by default)
  const emptyFormState = {
    name: '',
    brand: '',
    category: 'Serums & Peels' as const,
    productType: 'retail' as ProductType,
    unit: 'bottles' as const,
    unitCostBDT: '' as unknown as number,
    sellingPriceBDT: '' as unknown as number,
    currentStock: '' as unknown as number,
    reorderLevel: '' as unknown as number,
    batchNumber: '',
    expiryDate: '',
    barcode: '',
    sku: '',
    usageProtocol: '',
    description: '',
  };

  const [formData, setFormData] = useState(emptyFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const list = await api.inventory.list({
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        search: searchQuery.trim() || undefined,
      });
      setProducts(list);
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: isBn ? 'ক্যাটালগ লোড ব্যর্থ' : 'Failed to load catalog',
        description: (err as Error).message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [categoryFilter]);

  const uniqueBrands = Array.from(new Set(products.map((p) => p.brand).filter(Boolean)));

  const filteredProducts = products.filter((p) => {
    if (brandFilter !== 'all' && p.brand !== brandFilter) return false;
    return true;
  });

  // Calculate gross margin %
  const sellingPrice = Number(formData.sellingPriceBDT) || 0;
  const unitCost = Number(formData.unitCostBDT) || 0;
  const grossMarginPercent =
    sellingPrice > 0
      ? Math.round(((sellingPrice - unitCost) / sellingPrice) * 100)
      : 0;

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      addToast({ type: 'error', title: 'Product Name Required', description: 'Please enter a valid product name.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await api.inventory.create({
        ...formData,
        name: formData.name.trim(),
        brand: formData.brand.trim() || 'Generic / In-House',
        unitCostBDT: Number(formData.unitCostBDT) || 0,
        sellingPriceBDT: Number(formData.sellingPriceBDT) || 0,
        currentStock: Number(formData.currentStock) || 0,
        reorderLevel: Number(formData.reorderLevel) || 5,
        batchNumber: formData.batchNumber.trim() || undefined,
        expiryDate: formData.expiryDate || undefined,
      });

      setProducts((prev) => [created, ...prev]);
      addToast({
        type: 'success',
        title: isBn ? 'নতুন পণ্য সফলভাবে যুক্ত হয়েছে' : 'Product Added to Catalog',
        description: `${created.name} (${created.itemCode}) registered.`,
      });
      setShowAddForm(false);
      // Reset form to empty
      setFormData(emptyFormState);
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: isBn ? 'পণ্য যুক্ত করা যায়নি' : 'Failed to create product',
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
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            {isBn ? 'ক্লিনিক্যাল প্রডাক্ট ডিরেক্টরি' : 'Aesthetic Product Catalog'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {isBn
              ? 'স্কিন কেয়ার পণ্য, কেমিক্যাল পিল, ড্রাগস ও ফিলার প্রডাক্টের মাস্টার মূল্যতালিকা ও কনফিগারেশন'
              : 'Master listing of retail skincare formulations, dermal injectables, chemical peels, and clinical supplies.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate('/inventory/stock')}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Boxes className="w-4 h-4 text-slate-600" />
            <span>{isBn ? 'স্টক ওভারভিউ' : 'Stock Overview'}</span>
          </button>
          <button
            onClick={() => {
              if (!showAddForm) setFormData(emptyFormState);
              setShowAddForm(!showAddForm);
            }}
            className="px-3.5 py-2 rounded-xl bg-[#0DA54F] hover:bg-[#0a8740] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{showAddForm ? (isBn ? 'ফর্ম বন্ধ করুন' : 'Close Form') : (isBn ? 'নতুন পণ্য যুক্ত করুন' : 'Add New Product')}</span>
          </button>
        </div>
      </div>

      {/* Inline Form to Add New Product (Standalone Page UX - No Popups/Drawers) */}
      {showAddForm && (
        <div className="bg-white rounded-2xl border border-emerald-300 shadow-md p-6 animate-in slide-in-from-top-2 duration-200 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#0DA54F] flex items-center justify-center font-bold">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  {isBn ? 'নতুন ক্লিনিক্যাল পণ্য তৈরি করুন' : 'Configure New Clinical Product'}
                </h3>
                <span className="text-[11px] text-slate-400">
                  {isBn ? 'বারকোড, প্রডাক্ট টাইপ ও কস্টিং মার্জিন সেট করুন' : 'Set SKU, pricing margins, product type & usage protocols'}
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                setShowAddForm(false);
                setFormData(emptyFormState);
              }}
              className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleCreateProduct} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Product Name */}
              <div className="md:col-span-2 space-y-1">
                <label className="font-semibold text-slate-700">
                  {isBn ? 'পণ্যের নাম ও ফর্মুলেশন *' : 'Product Name & Formulation *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SkinCeuticals Hyaluronic Acid Intensifier (30ml)"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:border-[#0DA54F]"
                />
              </div>

              {/* Brand */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">{isBn ? 'ব্র্যান্ড *' : 'Brand *'}</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Suoxi DermaLab / SkinCeuticals"
                  value={formData.brand}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:border-[#0DA54F]"
                />
              </div>

              {/* Category */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">{isBn ? 'ক্যাটাগরি' : 'Category'}</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg bg-white"
                >
                  <option value="Serums & Peels">Serums & Peels</option>
                  <option value="Laser Consumables">Laser Consumables</option>
                  <option value="Injectables">Injectables (Botox & Fillers)</option>
                  <option value="Post-Care Creams">Post-Care Creams & Sunscreens</option>
                  <option value="Disposables">Disposables & Consumables</option>
                </select>
              </div>

              {/* Product Type (Retail vs Consumable vs Dual) */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">
                  {isBn ? 'প্রডাক্ট ধরন (Type) *' : 'Product Classification *'}
                </label>
                <select
                  value={formData.productType}
                  onChange={(e) => setFormData({ ...formData, productType: e.target.value as any })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg bg-white font-semibold text-slate-800"
                >
                  <option value="retail">Retail Skincare (কাউন্টারে বিক্রয়)</option>
                  <option value="consumable">Clinic Backbar Consumable (রুমের ট্রিটমেন্টে খরচ)</option>
                  <option value="dual_use">Dual-Use (ট্রিটমেন্ট ও বিক্রয় উভয় কাজে)</option>
                </select>
              </div>

              {/* Packaging Unit */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">{isBn ? 'প্যাকেজিং ইউনিট' : 'Unit'}</label>
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value as any })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg bg-white"
                >
                  <option value="bottles">Bottles (বোতল)</option>
                  <option value="tubes">Tubes (টিউব)</option>
                  <option value="vials">Vials / Ampoules (ভায়াল)</option>
                  <option value="boxes">Boxes (বক্স)</option>
                  <option value="pieces">Pieces (পিস)</option>
                </select>
              </div>

              {/* Unit Cost BDT */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">
                  {isBn ? 'ক্রয় মূল্য (Unit Cost BDT)' : 'Landed Purchase Cost (BDT)'}
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 1500"
                  value={formData.unitCostBDT}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      unitCostBDT: e.target.value === '' ? ('' as any) : parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full p-2.5 border border-slate-200 rounded-lg font-mono placeholder:text-slate-400"
                />
              </div>

              {/* Selling Price BDT */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">
                  {isBn ? 'বিক্রয় মূল্য (Retail MRP BDT)' : 'Retail Selling Price (BDT)'}
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 2500"
                  value={formData.sellingPriceBDT}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      sellingPriceBDT: e.target.value === '' ? ('' as any) : parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full p-2.5 border border-slate-200 rounded-lg font-mono font-bold text-slate-900 placeholder:text-slate-400"
                />
              </div>

              {/* Live Margin Card */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Gross Margin</span>
                  <div className="font-mono text-base font-bold text-emerald-700">
                    {sellingPrice > 0 ? `${grossMarginPercent}% Profit` : '—'}
                  </div>
                </div>
                <div className="text-[11px] text-right text-slate-500 font-mono">
                  Profit: {formatBDT(Math.max(0, sellingPrice - unitCost))}
                </div>
              </div>

              {/* Initial Stock */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">{isBn ? 'প্রাথমিক স্টক সংখ্যা' : 'Initial Stock'}</label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 10"
                  value={formData.currentStock}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      currentStock: e.target.value === '' ? ('' as any) : parseInt(e.target.value, 10) || 0,
                    })
                  }
                  className="w-full p-2.5 border border-slate-200 rounded-lg font-mono placeholder:text-slate-400"
                />
              </div>

              {/* Reorder Minimum */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">
                  {isBn ? 'রিঅর্ডার সতর্কতা লেভেল (Min Alert)' : 'Re-order Safety Point'}
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 5"
                  value={formData.reorderLevel}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      reorderLevel: e.target.value === '' ? ('' as any) : parseInt(e.target.value, 10) || 0,
                    })
                  }
                  className="w-full p-2.5 border border-slate-200 rounded-lg font-mono placeholder:text-slate-400"
                />
              </div>

              {/* Batch No & Expiry */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">{isBn ? 'ব্যাচ / লট নম্বর' : 'Batch / Lot No.'}</label>
                <input
                  type="text"
                  placeholder="e.g. SX-2026-A1"
                  value={formData.batchNumber}
                  onChange={(e) => setFormData({ ...formData, batchNumber: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg font-mono uppercase placeholder:text-slate-400"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">{isBn ? 'মেয়াদোত্তীর্ণের তারিখ' : 'Expiry Date'}</label>
                <input
                  type="date"
                  value={formData.expiryDate}
                  onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg font-mono"
                />
              </div>

              {/* Optional Barcode */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">{isBn ? 'বারকোড (ঐচ্ছিক)' : 'Barcode / EAN'}</label>
                <input
                  type="text"
                  placeholder="Scan or enter 13-digit EAN"
                  value={formData.barcode}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg font-mono placeholder:text-slate-400"
                />
              </div>

              {/* Usage Protocol */}
              <div className="md:col-span-3 space-y-1">
                <label className="font-semibold text-slate-700">
                  {isBn ? 'ক্লিনিক্যাল ব্যবহারের প্রোটোকল ও নির্দেশিকা' : 'In-Clinic Procedural Usage Protocol (Optional)'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. 5ml per HydraFacial deep extraction step or 3 drops morning only"
                  value={formData.usageProtocol}
                  onChange={(e) => setFormData({ ...formData, usageProtocol: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setFormData(emptyFormState);
                }}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
              >
                {isBn ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-[#0DA54F] hover:bg-[#0a8740] text-white font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Registering...' : isBn ? 'ক্যাটালগে সংরক্ষণ করুন' : 'Save to Master Catalog'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Catalog Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={isBn ? 'পণ্য, ব্র্যান্ড বা SKU দিয়ে খুঁজুন...' : 'Search master catalog by item, brand, SKU...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#0DA54F] focus:bg-white"
              />
            </div>
            <button
              onClick={fetchProducts}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer"
              title="Refresh catalog"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Brand Filter */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-medium">Brand:</span>
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="p-1.5 border border-slate-200 rounded-lg bg-slate-50 text-slate-800 text-xs"
            >
              <option value="all">All Brands ({uniqueBrands.length})</option>
              {uniqueBrands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Categories Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs">
          {['all', 'Serums & Peels', 'Laser Consumables', 'Injectables', 'Post-Care Creams', 'Disposables'].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                categoryFilter === cat
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat === 'all' ? (isBn ? 'সকল ক্যাটাগরি' : 'All Categories') : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Catalog Cards Grid */}
      {isLoading ? (
        <div className="p-4 bg-white rounded-xl border border-slate-200">
          <TableSkeleton cols={4} rows={6} />
        </div>
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          title={isBn ? 'কোনো পণ্য পাওয়া যায়নি' : 'No products in catalog'}
          description={isBn ? 'নতুন পণ্য যুক্ত করুন' : 'Click Add New Product above to configure a formulation.'}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((p) => {
            const margin = p.sellingPriceBDT > 0
              ? Math.round(((p.sellingPriceBDT - p.unitCostBDT) / p.sellingPriceBDT) * 100)
              : 0;

            return (
              <div
                key={p.id}
                className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 flex flex-col justify-between hover:border-emerald-300 transition-all group"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                        p.productType === 'retail'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : p.productType === 'consumable'
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      {p.productType === 'retail'
                        ? 'Retail OTC'
                        : p.productType === 'consumable'
                        ? 'Clinic Consumable'
                        : 'Dual-Use'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">{p.itemCode}</span>
                  </div>

                  <h3 className="font-bold text-sm text-slate-900 mt-2 line-clamp-2 group-hover:text-[#0DA54F] transition-colors">
                    {p.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                    <span className="font-medium text-slate-700">{p.brand}</span>
                    <span>•</span>
                    <span>{p.category}</span>
                  </div>

                  {p.usageProtocol && (
                    <div className="mt-2.5 p-2 rounded-lg bg-slate-50 border border-slate-100 text-[11px] text-slate-600 line-clamp-2">
                      <span className="font-semibold text-slate-700">Protocol: </span>
                      {p.usageProtocol}
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-mono font-bold text-slate-900 text-sm">
                      {formatBDT(p.sellingPriceBDT)}
                    </div>
                    <div className="text-[10px] text-slate-400">Cost: {formatBDT(p.unitCostBDT)}</div>
                  </div>

                  <div className="text-right">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono font-bold text-[10px]">
                      {margin}% Margin
                    </span>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Stock: <strong className="text-slate-800 font-mono">{p.currentStock} {p.unit}</strong>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
