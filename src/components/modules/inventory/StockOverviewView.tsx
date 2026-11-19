import React, { useState, useMemo } from 'react';
import {
  Boxes,
  Search,
  RefreshCw,
  Plus,
  Calendar,
  Printer,
  Download,
  Building2,
  TrendingUp,
  AlertTriangle,
  ChevronDown,
  Tag,
  CheckCircle2,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';

export interface WarehouseStockItem {
  id: string;
  productId: string; // e.g. P00002, P00003
  productName: string;
  category: string;
  purchases: {
    purchase: number;
    return: number;
    damage: number;
  };
  sale: {
    sold: number;
    return: number;
  };
  unit: string;
  rate: number; // Unit purchase price
  reorderLevel?: number;
  dateAdded?: string;
}

export const StockOverviewView: React.FC = () => {
  const { addToast, navigate } = useApp();

  // Primary Warehouse Stock Dataset matching user requirements & real clinic inventory
  const [stockItems, setStockItems] = useState<WarehouseStockItem[]>([
    {
      id: 'ws-1',
      productId: 'P00002',
      productName: 'Ultrasonic Nebulizer (Portable) JM-063801B',
      category: 'Diagnostic Lab',
      purchases: { purchase: 8, return: 0, damage: 0 },
      sale: { sold: 1, return: 0 },
      unit: 'Pcs',
      rate: 4000,
      reorderLevel: 2,
      dateAdded: '2026-10-24',
    },
    {
      id: 'ws-2',
      productId: 'P00003',
      productName: 'On Call Plus Glucometer',
      category: 'Diagnostic Lab',
      purchases: { purchase: 7, return: 0, damage: 0 },
      sale: { sold: 7, return: 0 },
      unit: 'Pcs',
      rate: 900,
      reorderLevel: 3,
      dateAdded: '2026-10-24',
    },
    {
      id: 'ws-3',
      productId: 'P00004',
      productName: 'BP Machine MDF',
      category: 'Diagnostic Lab',
      purchases: { purchase: 5, return: 0, damage: 0 },
      sale: { sold: 1, return: 0 },
      unit: 'Pcs',
      rate: 2500,
      reorderLevel: 2,
      dateAdded: '2026-10-24',
    },
    {
      id: 'ws-4',
      productId: 'P00005',
      productName: 'Stethoscope MDF',
      category: 'Diagnostic Lab',
      purchases: { purchase: 5, return: 0, damage: 0 },
      sale: { sold: 2, return: 0 },
      unit: 'Pcs',
      rate: 1000,
      reorderLevel: 2,
      dateAdded: '2026-10-24',
    },
    {
      id: 'ws-5',
      productId: 'P00006',
      productName: 'HydraFacial MD GlySal Peel Solution (15% Glycolic + 1.5% Salicylic)',
      category: 'Aesthetic Consumables',
      purchases: { purchase: 20, return: 0, damage: 0 },
      sale: { sold: 2, return: 0 },
      unit: 'Pcs',
      rate: 4500,
      reorderLevel: 5,
      dateAdded: '2026-10-18',
    },
    {
      id: 'ws-6',
      productId: 'P00007',
      productName: 'Activated Carbon Cream for Q-Switched Nd:YAG Laser',
      category: 'Laser Consumables',
      purchases: { purchase: 10, return: 0, damage: 0 },
      sale: { sold: 6, return: 0 },
      unit: 'Pcs',
      rate: 3200,
      reorderLevel: 4,
      dateAdded: '2026-10-18',
    },
    {
      id: 'ws-7',
      productId: 'P00008',
      productName: 'SkinCeuticals C E Ferulic Antioxidant Serum',
      category: 'Skincare Products',
      purchases: { purchase: 15, return: 0, damage: 0 },
      sale: { sold: 3, return: 0 },
      unit: 'Pcs',
      rate: 14500,
      reorderLevel: 4,
      dateAdded: '2026-10-24',
    },
    {
      id: 'ws-8',
      productId: 'P00009',
      productName: 'Mesoestetic Cosmelan 2 Maintenance Cream',
      category: 'Skincare Products',
      purchases: { purchase: 10, return: 0, damage: 0 },
      sale: { sold: 2, return: 0 },
      unit: 'Pcs',
      rate: 16500,
      reorderLevel: 3,
      dateAdded: '2026-10-24',
    },
    {
      id: 'ws-9',
      productId: 'P00010',
      productName: 'Sterile 30G Disposable Mesotherapy Needles',
      category: 'Disposables',
      purchases: { purchase: 25, return: 0, damage: 0 },
      sale: { sold: 5, return: 0 },
      unit: 'Pcs',
      rate: 3500,
      reorderLevel: 5,
      dateAdded: '2026-10-24',
    },
    {
      id: 'ws-10',
      productId: 'P00011',
      productName: 'Teosyal RHA 2 Resilient Hyaluronic Dermal Filler',
      category: 'Injectables',
      purchases: { purchase: 6, return: 0, damage: 0 },
      sale: { sold: 2, return: 0 },
      unit: 'Pcs',
      rate: 3000,
      reorderLevel: 2,
      dateAdded: '2026-10-24',
    },
    {
      id: 'ws-11',
      productId: 'P00012',
      productName: 'Centella Asiatica Soothing Barrier Recovery Gel (100ml)',
      category: 'Post-Care Creams',
      purchases: { purchase: 12, return: 0, damage: 0 },
      sale: { sold: 4, return: 0 },
      unit: 'Pcs',
      rate: 2300,
      reorderLevel: 3,
      dateAdded: '2026-10-23',
    },
    {
      id: 'ws-12',
      productId: 'P00013',
      productName: 'Physical Tinted Sunscreen SPF 50+ PA++++ (50ml)',
      category: 'Skincare Products',
      purchases: { purchase: 35, return: 0, damage: 0 },
      sale: { sold: 7, return: 0 },
      unit: 'Pcs',
      rate: 800,
      reorderLevel: 10,
      dateAdded: '2026-10-24',
    },
    {
      id: 'ws-13',
      productId: 'P00014',
      productName: 'Tens Machine TISTA',
      category: 'Devices & Equipment',
      purchases: { purchase: 20, return: 0, damage: 0 },
      sale: { sold: 4, return: 0 },
      unit: 'Pcs',
      rate: 4800,
      reorderLevel: 5,
      dateAdded: '2025-06-29',
    },
    {
      id: 'ws-14',
      productId: 'P00015',
      productName: 'Three Trading Clinical Disposables Pack',
      category: 'Disposables',
      purchases: { purchase: 20, return: 0, damage: 0 },
      sale: { sold: 5, return: 0 },
      unit: 'Pcs',
      rate: 2300,
      reorderLevel: 5,
      dateAdded: '2025-05-20',
    },
  ]);

  // Filtering States
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | 'week' | 'month' | 'all' | 'custom'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Categories extraction
  const categories = useMemo(() => {
    const set = new Set<string>();
    stockItems.forEach((it) => set.add(it.category));
    return ['all', ...Array.from(set)];
  }, [stockItems]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return stockItems.filter((item) => {
      // Category filter
      if (categoryFilter !== 'all' && item.category !== categoryFilter) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesId = item.productId.toLowerCase().includes(q);
        const matchesName = item.productName.toLowerCase().includes(q);
        const matchesCat = item.category.toLowerCase().includes(q);
        if (!matchesId && !matchesName && !matchesCat) return false;
      }
      return true;
    });
  }, [stockItems, categoryFilter, searchQuery]);

  // Computations for stock values
  // Formula: Stock Qty = (Purchases.purchase - Purchases.return - Purchases.damage) - (Sale.sold - Sale.return)
  const computeStockQty = (item: WarehouseStockItem) => {
    const netPurchases = item.purchases.purchase - item.purchases.return - item.purchases.damage;
    const netSales = item.sale.sold - item.sale.return;
    return Math.max(0, netPurchases - netSales);
  };

  const computeStockValue = (item: WarehouseStockItem) => {
    const qty = computeStockQty(item);
    return qty * item.rate;
  };

  // Grand Totals Summary
  const grandTotals = useMemo(() => {
    return filteredItems.reduce(
      (acc, item) => {
        const qty = computeStockQty(item);
        const val = qty * item.rate;
        return {
          totalPurchases: acc.totalPurchases + item.purchases.purchase,
          totalPurchaseReturns: acc.totalPurchaseReturns + item.purchases.return,
          totalDamages: acc.totalDamages + item.purchases.damage,
          totalSold: acc.totalSold + item.sale.sold,
          totalSalesReturns: acc.totalSalesReturns + item.sale.return,
          totalStockQty: acc.totalStockQty + qty,
          totalStockValue: acc.totalStockValue + val,
        };
      },
      {
        totalPurchases: 0,
        totalPurchaseReturns: 0,
        totalDamages: 0,
        totalSold: 0,
        totalSalesReturns: 0,
        totalStockQty: 0,
        totalStockValue: 0,
      }
    );
  }, [filteredItems]);

  // Number format helper (NO currency symbol as required)
  const formatNumber = (num: number) => {
    return Number(num).toLocaleString('en-US');
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      'Product ID',
      'Product Name',
      'Category',
      'Purchases (Purchase)',
      'Purchases (Return)',
      'Purchases (Damage)',
      'Sale (Sold)',
      'Sale (Return)',
      'Stock Qty',
      'Rate',
      'Stock Value',
    ];

    const rows = filteredItems.map((it) => {
      const qty = computeStockQty(it);
      const val = computeStockValue(it);
      return [
        `"${it.productId}"`,
        `"${it.productName.replace(/"/g, '""')}"`,
        `"${it.category}"`,
        it.purchases.purchase,
        it.purchases.return,
        it.purchases.damage,
        it.sale.sold,
        it.sale.return,
        `"${qty} ${it.unit}"`,
        it.rate,
        val,
      ].join(',');
    });

    // Summary row
    rows.push(
      [
        '"GRAND TOTAL SUMMARY"',
        '""',
        '""',
        grandTotals.totalPurchases,
        grandTotals.totalPurchaseReturns,
        grandTotals.totalDamages,
        grandTotals.totalSold,
        grandTotals.totalSalesReturns,
        `"${grandTotals.totalStockQty} Pcs"`,
        '""',
        grandTotals.totalStockValue,
      ].join(',')
    );

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Stock_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    addToast({
      type: 'success',
      title: 'Report Exported',
      description: 'Stock report CSV has been downloaded successfully.',
    });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="w-full space-y-5 animate-in fade-in duration-200">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-400 flex items-center justify-center text-white shadow-xs shrink-0">
            <Boxes className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Inventory & Warehouse Management Report: Stock Report
            </h1>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handlePrint}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Print Report"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            <span>Print Report</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Export CSV"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => navigate('/inventory/purchases')}
            className="px-3.5 py-2 bg-[#0DA54F] hover:bg-[#0a8740] text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Purchase</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Total Products
          </span>
          <div className="text-2xl font-mono font-bold text-slate-900">{filteredItems.length}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">Active master items</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Total Purchases
          </span>
          <div className="text-2xl font-mono font-bold text-blue-600">
            {formatNumber(grandTotals.totalPurchases)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Cumulative intake units</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Total Sold Units
          </span>
          <div className="text-2xl font-mono font-bold text-purple-600">
            {formatNumber(grandTotals.totalSold)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Dispensed or consumed</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Current Stock
          </span>
          <div className="text-2xl font-mono font-bold text-emerald-600">
            {formatNumber(grandTotals.totalStockQty)} Pcs
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Available in warehouse</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs col-span-2 sm:col-span-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Total Stock Value
          </span>
          <div className="text-2xl font-mono font-bold text-slate-900">
            {formatNumber(grandTotals.totalStockValue)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Valuation at unit rate</span>
        </div>
      </div>

      {/* Filter Toolbar: Date Filters, Category, Search, Records Count */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Date Filter Tabs */}
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <span className="font-semibold text-slate-700 flex items-center gap-1.5 mr-1 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Date Filter:</span>
            </span>

            {[
              { id: 'today', label: "Today's Report" },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'week', label: 'This Week' },
              { id: 'month', label: 'This Month' },
              { id: 'all', label: 'All Time' },
              { id: 'custom', label: 'Custom Date' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setDateFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  dateFilter === tab.id
                    ? 'bg-[#0DA54F] text-white shadow-2xs font-semibold'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Records count indicator */}
          <div className="text-xs text-slate-500 shrink-0">
            Records count: <strong className="text-slate-800">{filteredItems.length}</strong> (Product-wise stock rows)
          </div>
        </div>

        {/* Secondary Row: Category Selector & Search */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <label className="text-xs font-semibold text-slate-700 shrink-0">Category:</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:border-[#0DA54F] w-full sm:w-56"
            >
              <option value="all">All Categories</option>
              {categories
                .filter((c) => c !== 'all')
                .map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
            </select>
          </div>

          <div className="relative flex-1 w-full">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search Product ID, Name, Category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:outline-none focus:border-[#0DA54F]"
            />
          </div>

          {(categoryFilter !== 'all' || searchQuery) && (
            <button
              onClick={() => {
                setCategoryFilter('all');
                setSearchQuery('');
              }}
              className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer shrink-0"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Main Table Matching Attached Report Exactly */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            {/* Two-Tier Grouped Headers */}
            <thead>
              <tr className="bg-slate-100/90 text-slate-700 border-b border-slate-200 font-bold uppercase text-[11px]">
                <th
                  rowSpan={2}
                  className="py-3 px-3 text-left border-r border-slate-200 font-bold text-slate-900 tracking-wider whitespace-nowrap"
                >
                  Product ID
                </th>
                <th
                  rowSpan={2}
                  className="py-3 px-3 text-left border-r border-slate-200 font-bold text-slate-900 tracking-wider min-w-[240px]"
                >
                  Product Name
                </th>
                <th
                  rowSpan={2}
                  className="py-3 px-3 text-left border-r border-slate-200 font-bold text-slate-900 tracking-wider min-w-[140px]"
                >
                  Category
                </th>
                <th
                  colSpan={3}
                  className="py-2 px-3 text-center border-r border-slate-200 bg-amber-50 text-amber-900 tracking-wider font-bold"
                >
                  Purchases
                </th>
                <th
                  colSpan={2}
                  className="py-2 px-3 text-center border-r border-slate-200 bg-emerald-50 text-emerald-900 tracking-wider font-bold"
                >
                  Sale
                </th>
                <th
                  rowSpan={2}
                  className="py-3 px-3 text-center border-r border-slate-200 font-bold text-slate-900 tracking-wider whitespace-nowrap"
                >
                  Stock Qty
                </th>
                <th
                  rowSpan={2}
                  className="py-3 px-3 text-right border-r border-slate-200 font-bold text-slate-900 tracking-wider whitespace-nowrap"
                >
                  Rate
                </th>
                <th
                  rowSpan={2}
                  className="py-3 px-3 text-right font-bold text-slate-900 tracking-wider whitespace-nowrap"
                >
                  Stock Value
                </th>
              </tr>
              {/* Secondary Sub-headers */}
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-600">
                {/* Under Purchases */}
                <th className="py-2 px-3 text-center border-r border-slate-200 bg-amber-50/50">Purchase</th>
                <th className="py-2 px-3 text-center border-r border-slate-200 bg-amber-50/50">Return</th>
                <th className="py-2 px-3 text-center border-r border-slate-200 bg-amber-50/50">Damage</th>
                {/* Under Sale */}
                <th className="py-2 px-3 text-center border-r border-slate-200 bg-emerald-50/50">Sold</th>
                <th className="py-2 px-3 text-center border-r border-slate-200 bg-emerald-50/50">Return</th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-100 font-normal">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-400">
                    No products found matching the criteria.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const stockQty = computeStockQty(item);
                  const stockValue = computeStockValue(item);
                  const isZeroStock = stockQty === 0;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 transition-colors border-b border-slate-100"
                    >
                      {/* Product ID */}
                      <td className="py-3 px-3 border-r border-slate-100 font-mono font-bold text-slate-800 whitespace-nowrap">
                        {item.productId}
                      </td>

                      {/* Product Name */}
                      <td className="py-3 px-3 border-r border-slate-100 font-medium text-slate-900">
                        {item.productName}
                      </td>

                      {/* Category */}
                      <td className="py-3 px-3 border-r border-slate-100 text-slate-600 whitespace-nowrap">
                        {item.category}
                      </td>

                      {/* Purchases: Purchase */}
                      <td className="py-3 px-3 border-r border-slate-100 text-center font-mono font-semibold text-slate-700 bg-amber-50/20">
                        {item.purchases.purchase}
                      </td>

                      {/* Purchases: Return */}
                      <td className="py-3 px-3 border-r border-slate-100 text-center font-mono text-slate-500 bg-amber-50/20">
                        {item.purchases.return}
                      </td>

                      {/* Purchases: Damage */}
                      <td className="py-3 px-3 border-r border-slate-100 text-center font-mono text-slate-500 bg-amber-50/20">
                        {item.purchases.damage}
                      </td>

                      {/* Sale: Sold */}
                      <td className="py-3 px-3 border-r border-slate-100 text-center font-mono font-semibold text-slate-800 bg-emerald-50/20">
                        {item.sale.sold}
                      </td>

                      {/* Sale: Return */}
                      <td className="py-3 px-3 border-r border-slate-100 text-center font-mono text-slate-500 bg-emerald-50/20">
                        {item.sale.return}
                      </td>

                      {/* Stock Qty */}
                      <td className="py-3 px-3 border-r border-slate-100 text-center font-mono whitespace-nowrap">
                        <span
                          className={`font-bold ${
                            isZeroStock
                              ? 'text-slate-400'
                              : stockQty <= (item.reorderLevel || 3)
                              ? 'text-amber-600'
                              : 'text-slate-900'
                          }`}
                        >
                          {stockQty} {item.unit}
                        </span>
                      </td>

                      {/* Rate (Pure number, NO currency icon) */}
                      <td className="py-3 px-3 border-r border-slate-100 text-right font-mono text-slate-700 whitespace-nowrap">
                        {formatNumber(item.rate)}
                      </td>

                      {/* Stock Value (Pure number, NO currency icon) */}
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        {formatNumber(stockValue)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Grand Total Summary Footer */}
            {filteredItems.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100/95 border-t-2 border-slate-300 font-bold text-slate-900">
                  <td
                    colSpan={3}
                    className="py-3 px-3 text-right uppercase tracking-wider font-bold text-slate-800 border-r border-slate-200"
                  >
                    GRAND TOTAL SUMMARY:
                  </td>

                  {/* Total Purchases */}
                  <td className="py-3 px-3 text-center font-mono text-blue-700 border-r border-slate-200">
                    {formatNumber(grandTotals.totalPurchases)}
                  </td>

                  {/* Total Purchase Return */}
                  <td className="py-3 px-3 text-center font-mono text-slate-600 border-r border-slate-200">
                    {formatNumber(grandTotals.totalPurchaseReturns)}
                  </td>

                  {/* Total Damages */}
                  <td className="py-3 px-3 text-center font-mono text-slate-600 border-r border-slate-200">
                    {formatNumber(grandTotals.totalDamages)}
                  </td>

                  {/* Total Sold */}
                  <td className="py-3 px-3 text-center font-mono text-purple-700 border-r border-slate-200">
                    {formatNumber(grandTotals.totalSold)}
                  </td>

                  {/* Total Sales Return */}
                  <td className="py-3 px-3 text-center font-mono text-slate-600 border-r border-slate-200">
                    {formatNumber(grandTotals.totalSalesReturns)}
                  </td>

                  {/* Total Stock Qty */}
                  <td className="py-3 px-3 text-center font-mono text-emerald-700 font-bold border-r border-slate-200 whitespace-nowrap">
                    {formatNumber(grandTotals.totalStockQty)} Pcs
                  </td>

                  {/* Rate column empty in total */}
                  <td className="py-3 px-3 text-right font-mono text-slate-400 border-r border-slate-200">
                    —
                  </td>

                  {/* Grand Total Stock Value (Pure number, NO currency icon) */}
                  <td className="py-3 px-3 text-right font-mono text-slate-900 font-bold whitespace-nowrap text-sm">
                    {formatNumber(grandTotals.totalStockValue)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
