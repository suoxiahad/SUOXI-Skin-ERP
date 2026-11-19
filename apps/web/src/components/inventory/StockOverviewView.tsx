import React, { useState, useEffect, useCallback } from 'react';
import {
  Boxes,
  Sliders,
  FileSpreadsheet,
  AlertTriangle,
  RefreshCw,
  Clock,
  RotateCcw,
  CheckCircle2,
  Calendar,
  ShieldAlert,
  ArrowDownRight,
  ArrowUpRight,
  Download,
  Filter,
  Search,
} from 'lucide-react';
import { inventoryApi } from '../../api/inventory.js';
import type {
  StockOnHandDto,
  ExpiringBatchDto,
  StockMovementDto,
  ProductDto,
  InventoryReportType,
} from '@suoxi/shared-types';
import { useI18n } from '../../i18n/I18nContext.js';
import { useAuth } from '../../context/AuthContext.js';
import { AdjustStockModal } from './AdjustStockModal.js';

export const StockOverviewView: React.FC = () => {
  const { lang } = useI18n();
  const isBn = lang === 'bn';
  const { user } = useAuth();

  type TabType = 'on_hand' | 'movements' | 'low_stock' | 'expiring' | 'wastage';
  const [activeTab, setActiveTab] = useState<TabType>('on_hand');

  const [loading, setLoading] = useState<boolean>(true);
  const [stockOnHand, setStockOnHand] = useState<StockOnHandDto[]>([]);
  const [lowStock, setLowStock] = useState<StockOnHandDto[]>([]);
  const [expiringBatches, setExpiringBatches] = useState<ExpiringBatchDto[]>([]);
  const [movements, setMovements] = useState<StockMovementDto[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Modals & Drawers
  const [showAdjustModal, setShowAdjustModal] = useState<boolean>(false);
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [onHandList, lowList, expList, movList, pList] = await Promise.all([
        inventoryApi.getStockOnHand(),
        inventoryApi.getLowStock(),
        inventoryApi.getExpiringBatches(),
        inventoryApi.getMovements(),
        inventoryApi.getProducts(),
      ]);
      setStockOnHand(onHandList);
      setLowStock(lowList);
      setExpiringBatches(expList);
      setMovements(movList);
      setProducts(pList);
    } catch (err: any) {
      console.error('Failed to load stock data:', err);
      setError(err.message || 'Failed to load stock data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleReverseMovement = async (movId: string) => {
    const reason = window.prompt(
      isBn ? 'রিভার্সালের কারণ লিখুন (অডিট রেকর্ড):' : 'Enter audited reason for movement reversal:'
    );
    if (!reason || !reason.trim()) return;

    try {
      setReversingId(movId);
      await inventoryApi.reverseMovement(movId, reason.trim(), 'usr-101');
      alert(isBn ? 'সফলভাবে রিভার্সাল সম্পন্ন হয়েছে' : 'Movement reversed successfully');
      loadData();
    } catch (err: any) {
      console.error('Failed to reverse movement:', err);
      alert(err.message || 'Failed to reverse movement');
    } finally {
      setReversingId(null);
    }
  };

  const handleExportReport = async (reportType: InventoryReportType) => {
    try {
      setExporting(true);
      const report = await inventoryApi.getReport({ report_type: reportType });

      // Generate downloadable CSV format
      const csvRows: string[] = [];
      if (report.data.length > 0) {
        const keys = Object.keys(report.data[0]);
        csvRows.push(keys.join(','));
        for (const row of report.data) {
          const values = keys.map((k) => `"${String(row[k] ?? '').replace(/"/g, '""')}"`);
          csvRows.push(values.join(','));
        }
      }

      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `SUOXI_${reportType}_report_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      console.error('Failed to export report:', err);
      alert(err.message || 'Failed to export report');
    } finally {
      setExporting(false);
    }
  };

  const wastageMovements = movements.filter((m) => m.movement_type === 'wastage');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/80 backdrop-blur-md p-6 rounded-xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600 mb-1">
            <Boxes className="w-4 h-4" />
            <span>{isBn ? 'স্টক ও ব্যাচ কন্ট্রোল' : 'Stock on Hand & Batch Ledger'}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {isBn ? 'স্টক মনিটরিং ও মুভমেন্ট লেজার' : 'Inventory Stock & Ledger'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {isBn
              ? 'মুভমেন্ট থেকে নির্ণীত নির্ভুল ব্যালেন্স, অপচয় ট্র্যাকিং ও মেয়াদোত্তীর্ণ ব্যাচ সতর্কতা।'
              : 'Derived stock balances, append-only movement ledger, wastage logs, and expiry boundary alerts.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => handleExportReport(activeTab === 'low_stock' ? 'low_stock' : activeTab === 'expiring' ? 'expiry' : activeTab === 'wastage' ? 'wastage' : activeTab === 'movements' ? 'movements' : 'stock')}
            disabled={exporting}
            className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>{exporting ? (isBn ? 'এক্সপোর্ট হচ্ছে...' : 'Exporting...') : isBn ? 'রিপোর্ট এক্সপোর্ট (CSV)' : 'Export CSV'}</span>
          </button>

          <button
            onClick={() => setShowAdjustModal(true)}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-colors"
          >
            <Sliders className="w-4 h-4" />
            <span>{isBn ? 'স্টক সমন্বয় / অপচয়' : 'Adjust Stock'}</span>
          </button>
        </div>
      </div>

      {/* Quick Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>{isBn ? 'মোট পণ্য সংখ্যা' : 'Total Registered SKUs'}</span>
            <Boxes className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono">{stockOnHand.length}</div>
          <div className="text-[11px] text-slate-400 mt-1">Catalog items active</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>{isBn ? 'স্বল্প স্টক সতর্কতা' : 'Low Stock Deficit'}</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-600 font-mono">{lowStock.length}</div>
          <div className="text-[11px] text-rose-500 mt-1">Below reorder threshold</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>{isBn ? 'আসন্ন মেয়াদোত্তীর্ণ ব্যাচ' : 'Expiring Soon (<90d)'}</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600 font-mono">
            {expiringBatches.filter((b) => b.expiry_status === 'critical' || b.expiry_status === 'warning').length}
          </div>
          <div className="text-[11px] text-amber-600 mt-1">Require immediate rotation</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>{isBn ? 'মোট মুভমেন্ট এন্ট্রি' : 'Append-Only Movements'}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono">{movements.length}</div>
          <div className="text-[11px] text-slate-400 mt-1">Immutable audit rows</div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex border-b border-slate-200 bg-white px-4 rounded-t-xl gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('on_hand')}
          className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'on_hand'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Boxes className="w-4 h-4" />
          <span>{isBn ? 'স্টক অন হ্যান্ড' : 'Stock On Hand'}</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 font-mono">
            {stockOnHand.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('movements')}
          className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'movements'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          <span>{isBn ? 'মুভমেন্ট লেজার' : 'Movements Ledger'}</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 font-mono">
            {movements.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('low_stock')}
          className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'low_stock'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>{isBn ? 'স্বল্প স্টক' : 'Low Stock Alerts'}</span>
          {lowStock.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-100 text-rose-700 font-mono font-bold">
              {lowStock.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('expiring')}
          className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'expiring'
              ? 'border-amber-600 text-amber-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>{isBn ? 'মেয়াদোত্তীর্ণ ব্যাচ' : 'Expiring Soon'}</span>
          {expiringBatches.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-700 font-mono font-bold">
              {expiringBatches.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('wastage')}
          className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'wastage'
              ? 'border-slate-800 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>{isBn ? 'অপচয় ও ক্ষতি' : 'Wastage & Damage'}</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 font-mono">
            {wastageMovements.length}
          </span>
        </button>
      </div>

      {/* Main Table Container */}
      <div className="bg-white rounded-b-xl border border-slate-200 shadow-sm overflow-hidden -mt-6">
        {loading ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-800">{error}</p>
          </div>
        ) : activeTab === 'on_hand' ? (
          /* TAB 1: Stock on Hand */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">SKU</th>
                  <th className="py-3.5 px-4">{isBn ? 'পণ্য' : 'Product'}</th>
                  <th className="py-3.5 px-4">{isBn ? 'ক্যাটাগরি' : 'Category'}</th>
                  <th className="py-3.5 px-4 text-right">{isBn ? 'পুনর্বহাল স্তর' : 'Reorder Level'}</th>
                  <th className="py-3.5 px-4 text-right">{isBn ? 'স্টক অন হ্যান্ড' : 'Stock On Hand'}</th>
                  <th className="py-3.5 px-4 text-center">{isBn ? 'অবস্থা' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {stockOnHand.map((s) => (
                  <tr key={s.product_id} className="hover:bg-slate-50/60 transition-colors h-12">
                    <td className="py-3 px-4 font-mono font-bold text-slate-800">{s.sku}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{s.product_name}</div>
                      {s.product_name_bn && (
                        <div className="text-[11px] text-slate-400 font-bengali">{s.product_name_bn}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{s.category_name}</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-500">
                      {s.reorder_level} {s.unit}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 text-sm">
                      {Number(s.stock_on_hand).toFixed(1)} {s.unit}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {s.is_low_stock ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                          <AlertTriangle className="w-3 h-3" />
                          Low Stock
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                          <CheckCircle2 className="w-3 h-3" />
                          Adequate
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : activeTab === 'movements' ? (
          /* TAB 2: Movements Ledger */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">Movement Code</th>
                  <th className="py-3.5 px-4">{isBn ? 'পণ্য' : 'Product'}</th>
                  <th className="py-3.5 px-4">{isBn ? 'প্রকার' : 'Type'}</th>
                  <th className="py-3.5 px-4 text-right">{isBn ? 'পরিবর্তন' : 'Quantity Change'}</th>
                  <th className="py-3.5 px-4">{isBn ? 'রেফারেন্স / ব্যাচ' : 'Ref / Batch'}</th>
                  <th className="py-3.5 px-4">{isBn ? 'কারণ ও অনুমোদন' : 'Reason & Approver'}</th>
                  <th className="py-3.5 px-4 text-right">{isBn ? 'অ্যাকশন' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {movements.map((m) => {
                  const isPositive = parseFloat(m.quantity_change) > 0;
                  const isReversal = m.movement_type === 'reversal';
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/60 transition-colors h-12">
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">{m.movement_code}</td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{m.product_name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{m.sku}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                            m.movement_type === 'purchase_receipt'
                              ? 'bg-emerald-50 text-emerald-700'
                              : m.movement_type === 'session_usage'
                              ? 'bg-blue-50 text-blue-700'
                              : m.movement_type === 'wastage'
                              ? 'bg-rose-50 text-rose-700'
                              : m.movement_type === 'reversal'
                              ? 'bg-purple-50 text-purple-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {m.movement_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold">
                        <span
                          className={`inline-flex items-center gap-0.5 ${
                            isPositive ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {isPositive ? (
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDownRight className="w-3.5 h-3.5" />
                          )}
                          {m.quantity_change}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600 text-[11px]">
                        {m.batch_no && <div>Batch: {m.batch_no}</div>}
                        {m.reference_id && <div className="text-slate-400">{m.reference_id}</div>}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {m.reason ? (
                          <div className="text-slate-800 text-xs">{m.reason}</div>
                        ) : (
                          <div className="text-slate-400 text-[11px]">Standard Flow</div>
                        )}
                        {m.approved_by && (
                          <div className="text-[10px] text-emerald-600 font-medium">
                            Approved by: {m.approved_by}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {!isReversal && m.movement_type !== 'purchase_receipt' && (
                          <button
                            onClick={() => handleReverseMovement(m.id)}
                            disabled={reversingId === m.id}
                            className="px-2 py-1 rounded text-[11px] font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200"
                            title="Reverse movement"
                          >
                            {reversingId === m.id ? 'Reversing...' : 'Reverse'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : activeTab === 'low_stock' ? (
          /* TAB 3: Low Stock */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">SKU</th>
                  <th className="py-3.5 px-4">{isBn ? 'পণ্য' : 'Product'}</th>
                  <th className="py-3.5 px-4 text-right">{isBn ? 'পুনর্বহাল স্তর' : 'Reorder Level'}</th>
                  <th className="py-3.5 px-4 text-right">{isBn ? 'বর্তমান স্টক' : 'Current Stock'}</th>
                  <th className="py-3.5 px-4 text-right text-rose-600">{isBn ? 'ঘাটতি' : 'Deficit'}</th>
                  <th className="py-3.5 px-4 text-right">{isBn ? 'অ্যাকশন' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {lowStock.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      All products have adequate stock on hand.
                    </td>
                  </tr>
                ) : (
                  lowStock.map((s) => {
                    const deficit = s.reorder_level - parseFloat(s.stock_on_hand);
                    return (
                      <tr key={s.product_id} className="hover:bg-slate-50/60 transition-colors h-12">
                        <td className="py-3 px-4 font-mono font-bold text-slate-800">{s.sku}</td>
                        <td className="py-3 px-4 font-semibold text-slate-900">{s.product_name}</td>
                        <td className="py-3 px-4 text-right font-mono">{s.reorder_level} {s.unit}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">
                          {Number(s.stock_on_hand).toFixed(1)} {s.unit}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-rose-700">
                          -{deficit > 0 ? deficit.toFixed(1) : '0.0'} {s.unit}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setShowAdjustModal(true)}
                            className="px-2.5 py-1 rounded text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200"
                          >
                            Reorder PO
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : activeTab === 'expiring' ? (
          /* TAB 4: Expiring Batches */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">{isBn ? 'ব্যাচ নম্বর' : 'Batch Number'}</th>
                  <th className="py-3.5 px-4">{isBn ? 'পণ্য' : 'Product'}</th>
                  <th className="py-3.5 px-4">{isBn ? 'মেয়াদ' : 'Expiry Date'}</th>
                  <th className="py-3.5 px-4 text-right">{isBn ? 'অবশিষ্ট দিন' : 'Days Remaining'}</th>
                  <th className="py-3.5 px-4 text-right">{isBn ? 'স্টক' : 'Batch Stock'}</th>
                  <th className="py-3.5 px-4 text-center">{isBn ? 'সতর্কতা চিপ' : 'Expiry Chip'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {expiringBatches.map((b) => (
                  <tr key={b.batch_id} className="hover:bg-slate-50/60 transition-colors h-12">
                    <td className="py-3 px-4 font-mono font-bold text-slate-800">{b.batch_no}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{b.product_name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{b.sku}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700">{b.expiry_date}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold">
                      {b.days_to_expiry} days
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      {Number(b.batch_stock_on_hand).toFixed(1)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {b.expiry_status === 'critical' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                          <AlertTriangle className="w-3 h-3" />
                          Critical (&lt; 30d)
                        </span>
                      ) : b.expiry_status === 'warning' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                          <Clock className="w-3 h-3" />
                          Warning (&lt; 90d)
                        </span>
                      ) : b.expiry_status === 'expired' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-800">
                          Expired
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                          <CheckCircle2 className="w-3 h-3" />
                          Good
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* TAB 5: Wastage */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">Movement Code</th>
                  <th className="py-3.5 px-4">{isBn ? 'পণ্য' : 'Product'}</th>
                  <th className="py-3.5 px-4 text-right">{isBn ? 'বিনষ্ট পরিমাণ' : 'Wasted Qty'}</th>
                  <th className="py-3.5 px-4">{isBn ? 'বিনষ্টের কারণ' : 'Reason / Rationale'}</th>
                  <th className="py-3.5 px-4">{isBn ? 'অনুমোদনকারী' : 'Approver'}</th>
                  <th className="py-3.5 px-4 text-right">{isBn ? 'তারিখ' : 'Date'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {wastageMovements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No stock wastage or damage recorded.
                    </td>
                  </tr>
                ) : (
                  wastageMovements.map((w) => (
                    <tr key={w.id} className="hover:bg-slate-50/60 transition-colors h-12">
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">{w.movement_code}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{w.product_name}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">
                        {w.quantity_change}
                      </td>
                      <td className="py-3 px-4 text-slate-700">{w.reason}</td>
                      <td className="py-3 px-4 text-slate-600 font-medium">{w.approved_by || '—'}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-500">
                        {new Date(w.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Adjust Stock Modal */}
      {showAdjustModal && (
        <AdjustStockModal
          isOpen={showAdjustModal}
          onClose={() => setShowAdjustModal(false)}
          onSuccess={loadData}
          products={products}
        />
      )}
    </div>
  );
};
