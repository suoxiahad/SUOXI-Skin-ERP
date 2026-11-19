import React, { useState, useEffect, useCallback } from 'react';
import {
  Boxes,
  Plus,
  Search,
  Filter,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  DollarSign,
  Tag,
  ShieldAlert,
  ArrowUpDown,
  X,
} from 'lucide-react';
import { inventoryApi } from '../../api/inventory.js';
import type { ProductDto, ProductCategoryDto, CreateProductRequest } from '@suoxi/shared-types';
import { useI18n } from '../../i18n/I18nContext.js';
import { useAuth } from '../../context/AuthContext.js';
import { AdjustStockModal } from './AdjustStockModal.js';

export const ProductsListView: React.FC = () => {
  const { lang } = useI18n();
  const isBn = lang === 'bn';
  const { user } = useAuth();

  const [loading, setLoading] = useState<boolean>(true);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [categories, setCategories] = useState<ProductCategoryDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedBranch, setSelectedBranch] = useState<string>('br-dhk-01');

  // Modals & Drawers
  const [showAddDrawer, setShowAddDrawer] = useState<boolean>(false);
  const [showAdjustModal, setShowAdjustModal] = useState<boolean>(false);
  const [selectedProductForAdjust, setSelectedProductForAdjust] = useState<ProductDto | null>(null);

  // New Product Form State
  const [newSku, setNewSku] = useState('');
  const [newName, setNewName] = useState('');
  const [newNameBn, setNewNameBn] = useState('');
  const [newCategoryId, setNewCategoryId] = useState('');
  const [newUnit, setNewUnit] = useState('ml');
  const [newCostPrice, setNewCostPrice] = useState('500');
  const [newSalePrice, setNewSalePrice] = useState('1000');
  const [newReorderLevel, setNewReorderLevel] = useState(10);
  const [newAllowNegative, setNewAllowNegative] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [pList, cList] = await Promise.all([
        inventoryApi.getProducts({
          categoryId: selectedCategory === 'all' ? undefined : selectedCategory,
          search: searchQuery || undefined,
          branchId: selectedBranch,
        }),
        inventoryApi.getCategories(),
      ]);
      setProducts(pList);
      setCategories(cList);
      if (cList.length > 0 && !newCategoryId) {
        setNewCategoryId(cList[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load products:', err);
      setError(err.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, searchQuery, selectedBranch, newCategoryId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setDrawerError(null);

    if (!newSku.trim() || !newName.trim() || !newCategoryId || !newUnit.trim()) {
      setDrawerError(isBn ? 'অনুগ্রহ করে আবশ্যক ঘরগুলো পূরণ করুন' : 'Please fill all required fields');
      return;
    }

    try {
      setSavingProduct(true);
      const payload: CreateProductRequest = {
        sku: newSku.trim().toUpperCase(),
        name: newName.trim(),
        name_bn: newNameBn.trim() || undefined,
        category_id: newCategoryId,
        unit: newUnit.trim(),
        cost_price: parseFloat(newCostPrice) || 0,
        sale_price: parseFloat(newSalePrice) || 0,
        reorder_level: Number(newReorderLevel) || 10,
        allow_negative_stock: newAllowNegative,
        track_batches: true,
        track_expiry: true,
      };

      await inventoryApi.createProduct(payload);
      setShowAddDrawer(false);
      setNewSku('');
      setNewName('');
      setNewNameBn('');
      loadData();
    } catch (err: any) {
      console.error('Failed to create product:', err);
      setDrawerError(err.message || 'Failed to create product');
    } finally {
      setSavingProduct(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/80 backdrop-blur-md p-6 rounded-xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600 mb-1">
            <Boxes className="w-4 h-4" />
            <span>{isBn ? 'ইনভেন্টরি ও কনজিউমেবল ক্যাটালগ' : 'Clinical Inventory & Products'}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {isBn ? 'পণ্য ও স্টক মাস্টার' : 'Products & Stock Registry'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {isBn
              ? 'ক্লিনিক্যাল সরঞ্জাম, সিরাম, পিল ও রিটেল পণ্যের তালিকা এবং স্টক অন হ্যান্ড।'
              : 'Directory of treatment consumables, chemical peels, injectable vials, and skincare items.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setSelectedProductForAdjust(null);
              setShowAdjustModal(true);
            }}
            className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 flex items-center gap-2 shadow-sm"
          >
            <Sliders className="w-4 h-4 text-amber-600" />
            <span>{isBn ? 'স্টক সমন্বয়' : 'Adjust Stock'}</span>
          </button>

          <button
            onClick={() => setShowAddDrawer(true)}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>{isBn ? 'নতুন পণ্য যোগ' : 'Add Product'}</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isBn ? 'SKU বা পণ্যের নাম দিয়ে খুঁজুন...' : 'Search by SKU or product name...'}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="text-xs rounded-lg border border-slate-200 px-3 py-2 bg-white focus:outline-none focus:border-emerald-500"
            >
              <option value="all">{isBn ? 'সকল ক্যাটাগরি' : 'All Categories'}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 self-end md:self-auto"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
        </button>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
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
              onClick={loadData}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
            >
              {isBn ? 'পুনরায় চেষ্টা করুন' : 'Retry'}
            </button>
          </div>
        ) : products.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Boxes className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-700">
              {isBn ? 'কোনো পণ্য পাওয়া যায়নি' : 'No products found'}
            </p>
            <p className="text-xs text-slate-400">
              {isBn
                ? 'আপনার সার্চ ফিল্টার পরিবর্তন করুন বা নতুন পণ্য তৈরি করুন।'
                : 'Try adjusting your search criteria or add a new product.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">SKU</th>
                  <th className="py-3.5 px-4">{isBn ? 'পণ্যের নাম' : 'Product Name'}</th>
                  <th className="py-3.5 px-4">{isBn ? 'ক্যাটাগরি' : 'Category'}</th>
                  <th className="py-3.5 px-4">{isBn ? 'একক' : 'Unit'}</th>
                  <th className="py-3.5 px-4 text-right">{isBn ? 'ক্রয়মূল্য (৳)' : 'Cost (৳)'}</th>
                  <th className="py-3.5 px-4 text-right">{isBn ? 'বিক্রয়মূল্য (৳)' : 'Sale (৳)'}</th>
                  <th className="py-3.5 px-4 text-right">{isBn ? 'স্টক অন হ্যান্ড' : 'Stock on Hand'}</th>
                  <th className="py-3.5 px-4 text-center">{isBn ? 'স্ট্যাটাস / ব্যাচ' : 'Tracking'}</th>
                  <th className="py-3.5 px-4 text-right">{isBn ? 'অ্যাকশন' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {products.map((p) => {
                  const stockNum = parseFloat(p.stock_on_hand || '0');
                  const isLow = stockNum <= p.reorder_level;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition-colors h-12">
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">{p.sku}</td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{p.name}</div>
                        {p.name_bn && <div className="text-[11px] text-slate-400 font-bengali">{p.name_bn}</div>}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700">
                          {p.category_name || 'General'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{p.unit}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700">
                        ৳ {Number(p.cost_price).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-900 font-bold">
                        ৳ {Number(p.sale_price).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span
                            className={`font-mono text-sm font-bold ${
                              isLow ? 'text-rose-600' : 'text-slate-900'
                            }`}
                          >
                            {stockNum.toFixed(1)} {p.unit}
                          </span>
                          {isLow && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 flex items-center gap-1"
                              title={`Below reorder level (${p.reorder_level})`}
                            >
                              <ShieldAlert className="w-3 h-3" />
                              <span>Low</span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1 text-[10px]">
                          {p.track_batches && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold border border-blue-200/50">
                              Batch
                            </span>
                          )}
                          {p.track_expiry && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold border border-amber-200/50">
                              Expiry
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedProductForAdjust(p);
                            setShowAdjustModal(true);
                          }}
                          className="px-2.5 py-1 rounded text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                        >
                          {isBn ? 'সমন্বয়' : 'Adjust'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Product Drawer */}
      {showAddDrawer && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/30 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-2">
                <Boxes className="w-5 h-5 text-emerald-600" />
                <h2 className="text-base font-bold text-slate-800">
                  {isBn ? 'নতুন পণ্য নিবন্ধন' : 'Add New Product'}
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

            <form onSubmit={handleCreateProduct} className="p-6 space-y-4 flex-1 overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  SKU <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newSku}
                  onChange={(e) => setNewSku(e.target.value)}
                  placeholder="e.g., HA-030, PEEL-GLY-01"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase font-mono focus:border-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  {isBn ? 'পণ্যের নাম' : 'Product Name'} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Hyaluronic Acid Serum 30ml"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  {isBn ? 'পণ্যের নাম (বাংলা)' : 'Product Name (Bangla)'}
                </label>
                <input
                  type="text"
                  value={newNameBn}
                  onChange={(e) => setNewNameBn(e.target.value)}
                  placeholder="e.g., হায়ালুরোনিক অ্যাসিড সিরাম ৩০ মি.লি."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none font-bengali"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  {isBn ? 'ক্যাটাগরি' : 'Category'} <span className="text-rose-500">*</span>
                </label>
                <select
                  value={newCategoryId}
                  onChange={(e) => setNewCategoryId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    {isBn ? 'একক' : 'Unit'} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    placeholder="ml, vial, pcs, tube"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    {isBn ? 'পুনর্বহাল স্তর' : 'Reorder Level'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newReorderLevel}
                    onChange={(e) => setNewReorderLevel(parseInt(e.target.value) || 0)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    {isBn ? 'ক্রয়মূল্য (৳)' : 'Cost Price (৳)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newCostPrice}
                    onChange={(e) => setNewCostPrice(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    {isBn ? 'বিক্রয়মূল্য (৳)' : 'Sale Price (৳)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newSalePrice}
                    onChange={(e) => setNewSalePrice(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newAllowNegative}
                    onChange={(e) => setNewAllowNegative(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                  <span className="text-xs text-slate-700 font-medium">
                    {isBn ? 'নেতিবাচক স্টক অনুমোদন করুন' : 'Allow negative stock (Backorders)'}
                  </span>
                </label>
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
                  disabled={savingProduct}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {savingProduct ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>{isBn ? 'সংরক্ষণ করুন' : 'Save Product'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjust Stock Modal */}
      {showAdjustModal && (
        <AdjustStockModal
          isOpen={showAdjustModal}
          onClose={() => setShowAdjustModal(false)}
          onSuccess={loadData}
          products={products}
          preselectedProduct={selectedProductForAdjust}
        />
      )}
    </div>
  );
};
