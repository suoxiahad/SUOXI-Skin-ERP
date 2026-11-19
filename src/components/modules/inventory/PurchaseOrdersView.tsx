import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileText,
  Plus,
  Search,
  RefreshCw,
  PackageCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  Building2,
  Calendar,
  Layers,
  Truck,
  Printer,
  ChevronRight,
  ShieldCheck,
  Tag,
  Download,
  Filter,
  ArrowRight,
  DollarSign,
  Package,
  Boxes,
  Eye,
  Check,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';
import { api } from '../../../api/client.ts';
import type { PurchaseOrder, Supplier, InventoryItem, GoodsReceivedNote } from '../../../types/index.ts';
import { formatBDT, formatDateDhaka } from '../../../utils/format.ts';
import { TableSkeleton } from '../../common/Skeleton.tsx';
import { EmptyState } from '../../common/EmptyState.tsx';

type DateFilterPreset = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'all' | 'custom';
type ActiveTab = 'date_wise' | 'product_wise';

interface FlattenedPurchaseRow {
  uniqueKey: string;
  poId: string;
  invoiceNo: string;
  date: string;
  dateRaw: string;
  supplierId: string;
  supplierName: string;
  itemId: string;
  productName: string;
  price: number;
  quantity: number;
  discount: number;
  total: number;
  paid: number;
  due: number;
  status: string;
  isFirstItemInInvoice?: boolean;
  itemCountInInvoice?: number;
  rawPo: PurchaseOrder;
}

interface DateWiseInvoiceGroup {
  groupKey: string;
  invoiceNo: string;
  date: string;
  supplierName: string;
  rawPo: PurchaseOrder;
  items: FlattenedPurchaseRow[];
}

export const formatTableNumber = (val: number | undefined | null): string => {
  if (val === undefined || val === null || isNaN(val)) return '0';
  return val.toLocaleString('en-US');
};

export const PurchaseOrdersView: React.FC = () => {
  const { addToast, language, navigate } = useApp();
  const isBn = language === 'bn';

  const [activeTab, setActiveTab] = useState<ActiveTab>('date_wise');
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [inventoryList, setInventoryList] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Date Filter State (Defaults to 'all' or 'this_month' with one-click today report)
  const [datePreset, setDatePreset] = useState<DateFilterPreset>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState('all');
  const [selectedProductFilter, setSelectedProductFilter] = useState('all');

  // Modals & Forms
  const [showCreatePO, setShowCreatePO] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [invoiceNumberInput, setInvoiceNumberInput] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [poNotes, setPoNotes] = useState('');
  const [poLineItems, setPoLineItems] = useState<
    Array<{ itemId: string; orderedQty: number; unitCostBDT: number; discountBDT?: number; paidBDT?: number }>
  >([]);
  const [isSubmittingPO, setIsSubmittingPO] = useState(false);

  // GRN Modal State
  const [activePoForGrn, setActivePoForGrn] = useState<PurchaseOrder | null>(null);
  const [invoiceRefNumber, setInvoiceRefNumber] = useState('');
  const [grnNotes, setGrnNotes] = useState('');
  const [grnItems, setGrnItems] = useState<
    Array<{
      itemId: string;
      itemName: string;
      batchNumber: string;
      expiryDate: string;
      receivedQty: number;
      condition: 'good' | 'damaged';
    }>
  >([]);
  const [isReceivingGrn, setIsReceivingGrn] = useState(false);

  // View PO details modal
  const [viewingPo, setViewingPo] = useState<PurchaseOrder | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [pos, sups, invs] = await Promise.all([
        api.inventory.listPurchases(),
        api.inventory.listSuppliers(),
        api.inventory.list(),
      ]);
      setOrders(pos);
      setSuppliers(sups);
      setInventoryList(invs);
      if (sups.length > 0 && !selectedSupplierId) {
        setSelectedSupplierId(sups[0].id);
      }
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: isBn ? 'ডাটা লোড ব্যর্থ' : 'Failed to load purchase orders',
        description: (err as Error).message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Date calculation helpers (Dhaka Asia timezone aware)
  const now = new Date();
  const todayDhakaStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(now);

  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  const yesterdayDhakaStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(yest);

  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 6);
  const weekAgoDhakaStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(weekAgo);

  const currentMonthPrefix = todayDhakaStr.slice(0, 7);

  // Flattened lines from orders for granular report items
  const allRows: FlattenedPurchaseRow[] = useMemo(() => {
    const list: FlattenedPurchaseRow[] = [];

    orders.forEach((po) => {
      const invoiceNum = po.invoiceNo || po.poNumber || po.id;
      const poDate = po.orderDate || (po.createdAt ? po.createdAt.slice(0, 10) : todayDhakaStr);
      const itemsCount = po.items.length;

      po.items.forEach((item, idx) => {
        const itemPrice = item.unitCostBDT || 0;
        const itemQty = item.orderedQty || 1;
        const itemDiscount = item.discountBDT || 0;
        const itemTotal = item.totalBDT || itemPrice * itemQty - itemDiscount;

        // Paid & Due (either per line or derived from whole PO)
        let linePaid = item.paidBDT;
        let lineDue = item.dueBDT;

        if (linePaid === undefined) {
          if (po.paymentStatus === 'paid') {
            linePaid = itemTotal;
            lineDue = 0;
          } else if (po.paymentStatus === 'unpaid') {
            linePaid = 0;
            lineDue = itemTotal;
          } else {
            // Partial
            const paidRatio = po.totalBDT > 0 ? (po.paidBDT || 0) / po.totalBDT : 0.8;
            linePaid = Math.round(itemTotal * paidRatio);
            lineDue = Math.max(0, itemTotal - linePaid);
          }
        }
        if (lineDue === undefined) {
          lineDue = Math.max(0, itemTotal - (linePaid || 0));
        }

        list.push({
          uniqueKey: `${po.id}-${item.itemId || idx}-${idx}`,
          poId: po.id,
          invoiceNo: invoiceNum,
          date: formatDateDhaka(poDate),
          dateRaw: poDate,
          supplierId: po.supplierId,
          supplierName: po.supplierName,
          itemId: item.itemId,
          productName: item.itemName,
          price: itemPrice,
          quantity: itemQty,
          discount: itemDiscount,
          total: itemTotal,
          paid: linePaid,
          due: lineDue,
          status: po.status,
          isFirstItemInInvoice: idx === 0,
          itemCountInInvoice: itemsCount,
          rawPo: po,
        });
      });
    });

    return list;
  }, [orders, todayDhakaStr]);

  // Date Filtering
  const dateFilteredRows = useMemo(() => {
    return allRows.filter((row) => {
      const d = row.dateRaw;
      if (!d) return true;

      if (datePreset === 'today') {
        return d === todayDhakaStr;
      }
      if (datePreset === 'yesterday') {
        return d === yesterdayDhakaStr;
      }
      if (datePreset === 'this_week') {
        return d >= weekAgoDhakaStr && d <= todayDhakaStr;
      }
      if (datePreset === 'this_month') {
        return d.startsWith(currentMonthPrefix);
      }
      if (datePreset === 'custom') {
        if (customStartDate && d < customStartDate) return false;
        if (customEndDate && d > customEndDate) return false;
        return true;
      }
      return true;
    });
  }, [allRows, datePreset, todayDhakaStr, yesterdayDhakaStr, weekAgoDhakaStr, currentMonthPrefix, customStartDate, customEndDate]);

  // Search & Supplier & Product Filtering
  const displayedRows = useMemo(() => {
    return dateFilteredRows.filter((row) => {
      // Supplier filter
      if (selectedSupplierFilter !== 'all' && row.supplierId !== selectedSupplierFilter && row.supplierName !== selectedSupplierFilter) {
        return false;
      }

      // Product filter (applied in Product Wise tab)
      if (activeTab === 'product_wise' && selectedProductFilter !== 'all') {
        if (row.productName.toLowerCase() !== selectedProductFilter.toLowerCase() && row.itemId !== selectedProductFilter) {
          return false;
        }
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchInvoice = row.invoiceNo.toLowerCase().includes(q);
        const matchSupplier = row.supplierName.toLowerCase().includes(q);
        const matchProduct = row.productName.toLowerCase().includes(q);
        const matchDate = row.date.toLowerCase().includes(q);
        if (!matchInvoice && !matchSupplier && !matchProduct && !matchDate) {
          return false;
        }
      }

      return true;
    });
  }, [dateFilteredRows, selectedSupplierFilter, selectedProductFilter, activeTab, searchQuery]);

  // Group displayed rows by invoice for rowSpan merged cells (Invoice No., Date, Supplier Name)
  const dateWiseGroups = useMemo<DateWiseInvoiceGroup[]>(() => {
    const groups: DateWiseInvoiceGroup[] = [];
    const map = new Map<string, DateWiseInvoiceGroup>();

    displayedRows.forEach((row) => {
      const key = `${row.poId}___${row.invoiceNo}___${row.date}___${row.supplierName}`;
      let grp = map.get(key);
      if (!grp) {
        grp = {
          groupKey: key,
          invoiceNo: row.invoiceNo,
          date: row.date,
          supplierName: row.supplierName,
          rawPo: row.rawPo,
          items: [],
        };
        map.set(key, grp);
        groups.push(grp);
      }
      grp.items.push(row);
    });

    return groups;
  }, [displayedRows]);

  // Financial KPI totals for the active filtered report
  const summaryTotals = useMemo(() => {
    const totalQty = displayedRows.reduce((sum, r) => sum + r.quantity, 0);
    const totalDiscount = displayedRows.reduce((sum, r) => sum + r.discount, 0);
    const totalPurchaseValue = displayedRows.reduce((sum, r) => sum + r.total, 0);
    const totalPaid = displayedRows.reduce((sum, r) => sum + r.paid, 0);
    const totalDue = displayedRows.reduce((sum, r) => sum + r.due, 0);

    return {
      totalQty,
      totalDiscount,
      totalPurchaseValue,
      totalPaid,
      totalDue,
    };
  }, [displayedRows]);

  // Distinct product list for Product Wise filter
  const uniqueProducts = useMemo(() => {
    const map = new Map<string, string>();
    allRows.forEach((r) => {
      if (!map.has(r.productName)) {
        map.set(r.productName, r.productName);
      }
    });
    return Array.from(map.values());
  }, [allRows]);

  // Average Purchase Rate for currently selected product (Product Wise Tab)
  const productRateInsight = useMemo(() => {
    if (activeTab !== 'product_wise' || selectedProductFilter === 'all') return null;

    const matched = allRows.filter((r) => r.productName.toLowerCase() === selectedProductFilter.toLowerCase());
    if (matched.length === 0) return null;

    const totalCost = matched.reduce((s, r) => s + r.price * r.quantity, 0);
    const totalQty = matched.reduce((s, r) => s + r.quantity, 0);
    const avgRate = totalQty > 0 ? Math.round(totalCost / totalQty) : 0;
    const minRate = Math.min(...matched.map((r) => r.price));
    const maxRate = Math.max(...matched.map((r) => r.price));

    return {
      productName: selectedProductFilter,
      avgRate,
      minRate,
      maxRate,
      totalUnits: totalQty,
      invoicesCount: matched.length,
    };
  }, [activeTab, selectedProductFilter, allRows]);

  // Export report to CSV
  const handleExportCSV = () => {
    if (displayedRows.length === 0) {
      addToast({ type: 'warning', title: 'No Data', description: 'No records available to export.' });
      return;
    }

    const headers =
      activeTab === 'date_wise'
        ? ['Invoice No', 'Date', 'Supplier Name', 'Product Name', 'Price (BDT)', 'Quantity', 'Discount (BDT)', 'Total (BDT)', 'Paid (BDT)', 'Due (BDT)']
        : ['Invoice No', 'Date', 'Supplier Name', 'Product Name', 'Purchase Rate (BDT)', 'Quantity', 'Discount (BDT)', 'Total Purchase Value (BDT)', 'Paid (BDT)', 'Due (BDT)'];

    const rows = displayedRows.map((r) => [
      `"${r.invoiceNo}"`,
      `"${r.date}"`,
      `"${r.supplierName.replace(/"/g, '""')}"`,
      `"${r.productName.replace(/"/g, '""')}"`,
      r.price,
      r.quantity,
      r.discount,
      r.total,
      r.paid,
      r.due,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Purchase_Report_${activeTab}_${todayDhakaStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    addToast({
      type: 'success',
      title: isBn ? 'রিপোর্ট ডাউনলোড সফল' : 'CSV Exported',
      description: `Downloaded ${displayedRows.length} purchase records.`,
    });
  };

  // Create PO Handlers
  const addLineToPO = (itemId: string) => {
    const it = inventoryList.find((i) => i.id === itemId);
    if (!it) return;
    if (poLineItems.some((line) => line.itemId === itemId)) {
      addToast({ type: 'info', title: 'Already Added', description: 'Item already added to PO. Adjust quantity.' });
      return;
    }
    setPoLineItems([
      ...poLineItems,
      {
        itemId: it.id,
        orderedQty: 5,
        unitCostBDT: it.unitCostBDT,
        discountBDT: 0,
      },
    ]);
  };

  const removeLineFromPO = (index: number) => {
    setPoLineItems(poLineItems.filter((_, i) => i !== index));
  };

  const updateLineQty = (index: number, delta: number) => {
    setPoLineItems(
      poLineItems.map((line, i) =>
        i === index ? { ...line, orderedQty: Math.max(1, line.orderedQty + delta) } : line
      )
    );
  };

  const updateLinePrice = (index: number, price: number) => {
    setPoLineItems(
      poLineItems.map((line, i) => (i === index ? { ...line, unitCostBDT: Math.max(0, price) } : line))
    );
  };

  const handleCreatePoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId) {
      addToast({ type: 'error', title: 'Supplier Required', description: 'Please select a vendor supplier.' });
      return;
    }
    if (poLineItems.length === 0) {
      addToast({ type: 'error', title: 'Items Required', description: 'Please add at least one product item.' });
      return;
    }

    setIsSubmittingPO(true);
    try {
      const targetSup = suppliers.find((s) => s.id === selectedSupplierId);
      const delivery = expectedDate || todayDhakaStr;

      const created = await api.inventory.createPurchase({
        supplierId: selectedSupplierId,
        expectedDeliveryDate: delivery,
        items: poLineItems.map((item) => ({
          itemId: item.itemId,
          orderedQty: item.orderedQty,
          unitCostBDT: item.unitCostBDT,
        })),
        notes: poNotes.trim() || undefined,
      });

      // Augment created with custom invoice number if provided
      if (invoiceNumberInput.trim()) {
        created.invoiceNo = invoiceNumberInput.trim();
        created.poNumber = invoiceNumberInput.trim();
      }

      setOrders([created, ...orders]);
      addToast({
        type: 'success',
        title: isBn ? 'পারচেজ রেকর্ড সম্পন্ন' : 'Purchase Record Created',
        description: `Invoice #${created.invoiceNo || created.poNumber} saved under ${targetSup?.name || 'Supplier'}.`,
      });
      setShowCreatePO(false);
      setPoLineItems([]);
      setPoNotes('');
      setInvoiceNumberInput('');
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: isBn ? 'অর্ডার তৈরি ব্যর্থ' : 'Failed to create PO',
        description: (err as Error).message,
      });
    } finally {
      setIsSubmittingPO(false);
    }
  };

  // Open GRN action
  const openGrnModal = (po: PurchaseOrder) => {
    setActivePoForGrn(po);
    setInvoiceRefNumber(po.invoiceNo || po.poNumber || '');
    setGrnNotes('');
    const defaultDate = new Date();
    defaultDate.setFullYear(defaultDate.getFullYear() + 2);
    const expStr = defaultDate.toISOString().split('T')[0];

    const lines = po.items.map((it) => ({
      itemId: it.itemId,
      itemName: it.itemName,
      batchNumber: `LOT-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      expiryDate: expStr,
      receivedQty: Math.max(0, it.orderedQty - it.receivedQty),
      condition: 'good' as const,
    }));
    setGrnItems(lines);
  };

  const handleGrnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePoForGrn) return;

    setIsReceivingGrn(true);
    try {
      const res = await api.inventory.receiveGRN(activePoForGrn.id, {
        invoiceRefNumber: invoiceRefNumber.trim() || undefined,
        notes: grnNotes.trim() || undefined,
        items: grnItems,
      });

      setOrders((prev) => prev.map((p) => (p.id === res.po.id ? res.po : p)));
      addToast({
        type: 'success',
        title: isBn ? 'পণ্য সফলভাবে রিসিভ হয়েছে (GRN)' : 'Goods Received & Stock Incremented',
        description: `GRN ${res.grn.grnNumber} processed. Inventory quantities increased.`,
      });
      setActivePoForGrn(null);
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: isBn ? 'GRN রিসিভ ব্যর্থ' : 'Failed to receive goods',
        description: (err as Error).message,
      });
    } finally {
      setIsReceivingGrn(false);
    }
  };

  return (
    <div className="w-full space-y-5 animate-in fade-in duration-150">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0DA54F] animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#0DA54F]">
              {isBn ? 'ইনভেন্টরি ও ক্রয় ব্যবস্থাপনা' : 'Procurement & Inventory Ledger'}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700 border border-slate-200">
              Corporate Standard
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">
            {isBn ? 'পারচেজ রিপোর্ট (Purchase Report)' : 'Purchase Report'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {isBn
              ? 'তারিখ অনুযায়ী (Date-wise) এবং প্রডাক্ট অনুযায়ী (Product-wise) ভেন্ডর চালান, ক্রয়মূল্য, পরিশোধ ও বকেয়া খতিয়ান'
              : 'Date-wise and Product-wise procurement ledger, supplier invoices, unit purchase rates, and settlement records.'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => window.print()}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Print A4 Clinical Report"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            <span>{isBn ? 'প্রিন্ট রিপোর্ট (A4)' : 'Print Report (A4)'}</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-[#0DA54F] border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Download Excel / CSV"
          >
            <Download className="w-4 h-4" />
            <span>{isBn ? 'এক্সপোর্ট CSV' : 'Export CSV'}</span>
          </button>

          <button
            onClick={() => setShowCreatePO(!showCreatePO)}
            className="px-4 py-2 bg-[#0DA54F] hover:bg-[#0a8740] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{showCreatePO ? (isBn ? 'ফর্ম বন্ধ করুন' : 'Close Form') : (isBn ? '+ নতুন চালান / PO' : '+ New Purchase Order')}</span>
          </button>
        </div>
      </div>

      {/* Dynamic Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="glass-card-kpi p-4 rounded-xl border border-white/80 shadow-xs relative overflow-hidden bg-white">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">
              {isBn ? 'মোট ক্রয়মূল্য (Total Purchase Value)' : 'Total Purchase Value'}
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-[#0DA54F] flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2 tabular-nums font-mono">
            {formatBDT(summaryTotals.totalPurchaseValue)}
          </p>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            {isBn ? 'নির্বাচিত সময়সীমার মোট বিল' : 'Selected range billing'}
          </span>
        </div>

        <div className="glass-card-kpi p-4 rounded-xl border border-white/80 shadow-xs relative overflow-hidden bg-white">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-700">
              {isBn ? 'মোট পরিশোধিত (Total Paid)' : 'Total Paid'}
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <Check className="w-4 h-4 stroke-[3]" />
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-700 mt-2 tabular-nums font-mono">
            {formatBDT(summaryTotals.totalPaid)}
          </p>
          <span className="text-[10px] text-emerald-600 block mt-0.5">
            {isBn ? 'সাপ্লায়ারকে পরিশোধিত অর্থ' : 'Settled with suppliers'}
          </span>
        </div>

        <div className="glass-card-kpi p-4 rounded-xl border border-white/80 shadow-xs relative overflow-hidden bg-white">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-700">
              {isBn ? 'মোট বকেয়া দেনা (Outstanding Due)' : 'Outstanding Dues'}
            </span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-rose-700 mt-2 tabular-nums font-mono">
            {formatBDT(summaryTotals.totalDue)}
          </p>
          <span className="text-[10px] text-rose-500 block mt-0.5">
            {isBn ? 'ভেন্ডরকে প্রদেয় বাকি' : 'Payable to vendors'}
          </span>
        </div>

        <div className="glass-card-kpi p-4 rounded-xl border border-white/80 shadow-xs relative overflow-hidden bg-white">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-700">
              {isBn ? 'মোট ক্রয়কৃত পণ্য (Total Qty)' : 'Total Quantity'}
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-blue-700 mt-2 tabular-nums font-mono">
            {summaryTotals.totalQty} <span className="text-xs font-normal text-slate-500">units</span>
          </p>
          <span className="text-[10px] text-blue-600 block mt-0.5">
            {isBn ? `${displayedRows.length} টি আইটেম লাইন` : `${displayedRows.length} product lines`}
          </span>
        </div>
      </div>

      {/* Tabs Header: 1. Date Wise & 2. Product Wise */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Navigation Tabs Bar */}
        <div className="border-b border-slate-200 bg-slate-50/70 p-2 flex items-center gap-2">
          <button
            onClick={() => setActiveTab('date_wise')}
            className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'date_wise'
                ? 'bg-[#0DA54F] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Date Wise Report</span>
          </button>

          <button
            onClick={() => setActiveTab('product_wise')}
            className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'product_wise'
                ? 'bg-[#0DA54F] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Product Wise Report</span>
          </button>
        </div>

        {/* Date Filter Bar & Quick Preset Buttons */}
        <div className="p-4 border-b border-slate-100 space-y-3.5 bg-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Presets */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mr-1">
                <Calendar className="w-3.5 h-3.5 text-[#0DA54F]" />
                <span>{isBn ? 'তারিখ ফিল্টার:' : 'Date Filter:'}</span>
              </span>

              {[
                { id: 'today', labelBn: 'আজকের রিপোর্ট', labelEn: "Today's Report" },
                { id: 'yesterday', labelBn: 'গতকাল', labelEn: 'Yesterday' },
                { id: 'this_week', labelBn: 'এই সপ্তাহ', labelEn: 'This Week' },
                { id: 'this_month', labelBn: 'এই মাস', labelEn: 'This Month' },
                { id: 'all', labelBn: 'সব সময়', labelEn: 'All Time' },
                { id: 'custom', labelBn: 'কাস্টম তারিখ', labelEn: 'Custom Date' },
              ].map((preset) => {
                const active = datePreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => setDatePreset(preset.id as DateFilterPreset)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      active
                        ? 'bg-[#0DA54F] text-white shadow-2xs font-bold'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {isBn ? preset.labelBn : preset.labelEn}
                  </button>
                );
              })}
            </div>

            <div className="text-xs text-slate-500 shrink-0">
              {isBn ? 'মোট রেকর্ড: ' : 'Records count: '}
              <span className="font-bold text-slate-900 font-mono">{displayedRows.length}</span>
              <span className="text-slate-400 ml-1">
                ({activeTab === 'date_wise' ? 'Date-wise rows' : 'Product lines'})
              </span>
            </div>
          </div>

          {/* Custom Date Pickers */}
          {datePreset === 'custom' && (
            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex flex-wrap items-center gap-3 text-xs animate-in fade-in duration-150">
              <span className="font-semibold text-slate-700">{isBn ? 'তারিখ নির্বাচন:' : 'Select Range:'}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">{isBn ? 'হতে:' : 'From:'}</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-2.5 py-1 bg-white border border-slate-300 rounded-md text-xs font-mono text-slate-800"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">{isBn ? 'পর্যন্ত:' : 'To:'}</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-2.5 py-1 bg-white border border-slate-300 rounded-md text-xs font-mono text-slate-800"
                />
              </div>
              {(customStartDate || customEndDate) && (
                <button
                  onClick={() => {
                    setCustomStartDate('');
                    setCustomEndDate('');
                  }}
                  className="text-[11px] text-rose-600 hover:text-rose-700 font-semibold cursor-pointer ml-2"
                >
                  {isBn ? 'তারিখ রিসেট' : 'Reset Dates'}
                </button>
              )}
            </div>
          )}

          {/* Search, Supplier Filter & Product Filter Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100">
            <div className="flex items-center gap-2 flex-wrap flex-1">
              {/* Supplier Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500 font-medium">{isBn ? 'সাপ্লায়ার:' : 'Supplier:'}</span>
                <select
                  value={selectedSupplierFilter}
                  onChange={(e) => setSelectedSupplierFilter(e.target.value)}
                  className="text-xs rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 cursor-pointer"
                >
                  <option value="all">{isBn ? 'সকল সাপ্লায়ার' : 'All Suppliers'}</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Product Filter (Shown in Product Wise Tab) */}
              {activeTab === 'product_wise' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500 font-medium">{isBn ? 'প্রডাক্ট:' : 'Product:'}</span>
                  <select
                    value={selectedProductFilter}
                    onChange={(e) => setSelectedProductFilter(e.target.value)}
                    className="text-xs rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 max-w-[200px] truncate cursor-pointer"
                  >
                    <option value="all">{isBn ? 'সকল প্রডাক্ট' : 'All Products'}</option>
                    {uniqueProducts.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Keyword Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isBn ? 'ইনভয়েস #, সাপ্লায়ার বা প্রডাক্ট...' : 'Search Invoice #, Supplier, Product...'}
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#0DA54F] w-56 sm:w-72"
              />
            </div>
          </div>

          {/* Product Wise Rate Insight Callout */}
          {activeTab === 'product_wise' && productRateInsight && (
            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-blue-600 block">Selected Product Analysis</span>
                <span className="font-bold text-slate-900 text-sm">{productRateInsight.productName}</span>
              </div>
              <div className="flex items-center gap-4 text-xs font-mono">
                <div>
                  <span className="text-slate-500 block text-[10px]">Average Rate:</span>
                  <span className="font-bold text-[#0DA54F]">{formatBDT(productRateInsight.avgRate)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Lowest - Highest:</span>
                  <span className="font-semibold text-slate-800">
                    {formatBDT(productRateInsight.minRate)} - {formatBDT(productRateInsight.maxRate)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Total Purchased:</span>
                  <span className="font-bold text-blue-700">{productRateInsight.totalUnits} units</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tab 1: Date Wise Report Table (Exact columns: Invoice No. , Date, Supplier Name, Product Name, Price, Quantity, Discount, Total, Paid, Due) */}
        {activeTab === 'date_wise' && (
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="p-5">
                <TableSkeleton cols={10} rows={5} />
              </div>
            ) : displayedRows.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <Calendar className="w-10 h-10 text-slate-300 mx-auto" />
                <h3 className="text-sm font-bold text-slate-800">
                  {isBn ? 'তারিখ অনুযায়ী কোনো পারচেজ রেকর্ড মেলেনি' : 'No Date-Wise Purchase Records Found'}
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {isBn
                    ? 'নির্বাচিত তারিখ বা ফিল্টারে কোনো চালানের তথ্য নেই। ফিল্টার পরিবর্তন করুন বা নতুন পারচেজ চালান এন্ট্রি দিন।'
                    : 'There are no purchase invoices matching your date or search filters.'}
                </p>
                {datePreset !== 'all' && (
                  <button
                    onClick={() => setDatePreset('all')}
                    className="px-4 py-1.5 bg-emerald-50 text-[#0DA54F] border border-emerald-200 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-colors cursor-pointer inline-flex items-center gap-1"
                  >
                    <span>{isBn ? 'সকল রেকর্ড দেখুন (All Time)' : 'View All Time'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse border border-slate-300">
                <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                  <tr>
                    <th className="py-3 px-3.5 border border-slate-300 text-center">Invoice No.</th>
                    <th className="py-3 px-3.5 border border-slate-300 text-center">Date</th>
                    <th className="py-3 px-3.5 border border-slate-300">Supplier Name</th>
                    <th className="py-3 px-3.5 border border-slate-300">Product Name</th>
                    <th className="py-3 px-3.5 text-right border border-slate-300">Price</th>
                    <th className="py-3 px-3 text-center border border-slate-300">Quantity</th>
                    <th className="py-3 px-3 text-right border border-slate-300">Discount</th>
                    <th className="py-3 px-3.5 text-right border border-slate-300">Total</th>
                    <th className="py-3 px-3.5 text-right border border-slate-300">Paid</th>
                    <th className="py-3 px-3.5 text-right border border-slate-300">Due</th>
                    <th className="py-3 px-3 text-center border border-slate-300 no-print">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {dateWiseGroups.map((group) => {
                    return group.items.map((row, itemIdx) => {
                      const isFirst = itemIdx === 0;
                      return (
                        <tr key={row.uniqueKey} className="hover:bg-slate-50 transition-colors">
                          {isFirst && (
                            <td
                              rowSpan={group.items.length}
                              className="py-2.5 px-3.5 font-mono font-bold text-slate-900 border border-slate-300 align-middle bg-white whitespace-nowrap text-center"
                            >
                              {group.invoiceNo}
                            </td>
                          )}

                          {isFirst && (
                            <td
                              rowSpan={group.items.length}
                              className="py-2.5 px-3.5 text-slate-700 border border-slate-300 align-middle whitespace-nowrap bg-white text-center"
                            >
                              {group.date}
                            </td>
                          )}

                          {isFirst && (
                            <td
                              rowSpan={group.items.length}
                              className="py-2.5 px-3.5 font-semibold text-slate-800 border border-slate-300 align-middle max-w-[200px] bg-white"
                            >
                              {group.supplierName}
                            </td>
                          )}

                          <td className="py-2.5 px-3.5 font-medium text-slate-900 border border-slate-300 max-w-[240px]">
                            {row.productName}
                          </td>

                          <td className="py-2.5 px-3.5 text-right font-mono font-semibold text-slate-800 border border-slate-300 tabular-nums">
                            {formatTableNumber(row.price)}
                          </td>

                          <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900 border border-slate-300 tabular-nums">
                            {row.quantity}
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono text-slate-500 border border-slate-300 tabular-nums">
                            {formatTableNumber(row.discount)}
                          </td>

                          <td className="py-2.5 px-3.5 text-right font-mono font-bold text-slate-900 border border-slate-300 tabular-nums bg-slate-50/50">
                            {formatTableNumber(row.total)}
                          </td>

                          <td className="py-2.5 px-3.5 text-right font-mono font-semibold text-emerald-700 border border-slate-300 tabular-nums">
                            {formatTableNumber(row.paid)}
                          </td>

                          <td className="py-2.5 px-3.5 text-right font-mono font-bold text-rose-700 border border-slate-300 tabular-nums">
                            {formatTableNumber(row.due)}
                          </td>

                          {isFirst && (
                            <td
                              rowSpan={group.items.length}
                              className="py-2.5 px-3 text-center align-middle border border-slate-300 bg-white no-print"
                            >
                              <button
                                onClick={() => setViewingPo(group.rawPo)}
                                className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors inline-flex items-center justify-center cursor-pointer"
                                title="View PO Details"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    });
                  })}
                </tbody>
                {/* Summary Total Row */}
                <tfoot className="bg-slate-100/95 font-bold border-t-2 border-slate-300 text-slate-900 text-xs">
                  <tr>
                    <td colSpan={5} className="py-3 px-3.5 text-right border border-slate-300 uppercase tracking-wider text-[11px]">
                      {isBn ? 'সর্বমোট (Grand Total):' : 'Grand Total Summary:'}
                    </td>
                    <td className="py-3 px-3 text-center font-mono border border-slate-300 font-bold text-blue-700 tabular-nums">
                      {summaryTotals.totalQty}
                    </td>
                    <td className="py-3 px-3 text-right font-mono border border-slate-300 tabular-nums text-slate-600">
                      {formatTableNumber(summaryTotals.totalDiscount)}
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono font-bold border border-slate-300 tabular-nums text-slate-900">
                      {formatTableNumber(summaryTotals.totalPurchaseValue)}
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono font-bold border border-slate-300 tabular-nums text-emerald-700">
                      {formatTableNumber(summaryTotals.totalPaid)}
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono font-bold border border-slate-300 tabular-nums text-rose-700">
                      {formatTableNumber(summaryTotals.totalDue)}
                    </td>
                    <td className="border border-slate-300 no-print"></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}

        {/* Tab 2: Product Wise Report Table (Exact columns: Invoice No. , Date, Supplier Name, Product Name, Purchase Rate, Quantity, Discount, Total Purchase Value) */}
        {activeTab === 'product_wise' && (
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="p-5">
                <TableSkeleton cols={9} rows={5} />
              </div>
            ) : displayedRows.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <Package className="w-10 h-10 text-slate-300 mx-auto" />
                <h3 className="text-sm font-bold text-slate-800">
                  {isBn ? 'প্রডাক্ট অনুযায়ী কোনো পারচেজ রেকর্ড মেলেনি' : 'No Product-Wise Purchase Records Found'}
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {isBn
                    ? 'নির্বাচিত প্রডাক্ট বা ফিল্টারে কোনো ক্রয়ের তথ্য নেই। ফিল্টার পরিবর্তন করুন।'
                    : 'There are no purchase records matching your product filter.'}
                </p>
                {selectedProductFilter !== 'all' && (
                  <button
                    onClick={() => setSelectedProductFilter('all')}
                    className="px-4 py-1.5 bg-emerald-50 text-[#0DA54F] border border-emerald-200 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-colors cursor-pointer inline-flex items-center gap-1"
                  >
                    <span>{isBn ? 'সকল প্রডাক্ট দেখুন' : 'Show All Products'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse border border-slate-300">
                <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                  <tr>
                    <th className="py-3 px-3.5 border border-slate-300 text-center">Invoice No.</th>
                    <th className="py-3 px-3.5 border border-slate-300 text-center">Date</th>
                    <th className="py-3 px-3.5 border border-slate-300">Supplier Name</th>
                    <th className="py-3 px-3.5 border border-slate-300">Product Name</th>
                    <th className="py-3 px-3.5 text-right border border-slate-300">Purchase Rate</th>
                    <th className="py-3 px-3 text-center border border-slate-300">Quantity</th>
                    <th className="py-3 px-3 text-right border border-slate-300">Discount</th>
                    <th className="py-3 px-3.5 text-right border border-slate-300">Total Purchase Value</th>
                    <th className="py-3 px-3.5 text-right border border-slate-300">Paid</th>
                    <th className="py-3 px-3.5 text-right border border-slate-300">Due</th>
                    <th className="py-3 px-3 text-center border border-slate-300 no-print">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.map((row) => (
                    <tr key={row.uniqueKey} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3.5 font-mono font-bold text-slate-900 border border-slate-300 whitespace-nowrap bg-white text-center">
                        {row.invoiceNo}
                      </td>

                      <td className="py-2.5 px-3.5 text-slate-700 border border-slate-300 whitespace-nowrap bg-white text-center">
                        {row.date}
                      </td>

                      <td className="py-2.5 px-3.5 font-semibold text-slate-800 border border-slate-300 max-w-[200px] bg-white">
                        {row.supplierName}
                      </td>

                      <td className="py-2.5 px-3.5 font-bold text-slate-900 border border-slate-300 max-w-[250px] bg-blue-50/15">
                        {row.productName}
                      </td>

                      <td className="py-2.5 px-3.5 text-right font-mono font-semibold text-slate-800 border border-slate-300 tabular-nums">
                        {formatTableNumber(row.price)}
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900 border border-slate-300 tabular-nums">
                        {row.quantity}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono text-slate-500 border border-slate-300 tabular-nums">
                        {formatTableNumber(row.discount)}
                      </td>

                      <td className="py-2.5 px-3.5 text-right font-mono font-bold text-slate-900 border border-slate-300 tabular-nums bg-slate-50/50">
                        {formatTableNumber(row.total)}
                      </td>

                      <td className="py-2.5 px-3.5 text-right font-mono font-semibold text-emerald-700 border border-slate-300 tabular-nums">
                        {formatTableNumber(row.paid)}
                      </td>

                      <td className="py-2.5 px-3.5 text-right font-mono font-bold text-rose-700 border border-slate-300 tabular-nums">
                        {formatTableNumber(row.due)}
                      </td>

                      <td className="py-2.5 px-3 text-center border border-slate-300 bg-white no-print">
                        <button
                          onClick={() => setViewingPo(row.rawPo)}
                          className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors inline-flex items-center justify-center cursor-pointer"
                          title="View PO Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Summary Total Row */}
                <tfoot className="bg-slate-100/95 font-bold border-t-2 border-slate-300 text-slate-900 text-xs">
                  <tr>
                    <td colSpan={5} className="py-3 px-3.5 text-right border border-slate-300 uppercase tracking-wider text-[11px]">
                      {isBn ? 'সর্বমোট পারচেজ ভ্যালু (Total Value):' : 'Total Purchase Value Summary:'}
                    </td>
                    <td className="py-3 px-3 text-center font-mono border border-slate-300 font-bold text-blue-700 tabular-nums">
                      {summaryTotals.totalQty}
                    </td>
                    <td className="py-3 px-3 text-right font-mono border border-slate-300 tabular-nums text-slate-600">
                      {formatTableNumber(summaryTotals.totalDiscount)}
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono font-bold border border-slate-300 tabular-nums text-slate-900">
                      {formatTableNumber(summaryTotals.totalPurchaseValue)}
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono font-bold border border-slate-300 tabular-nums text-emerald-700">
                      {formatTableNumber(summaryTotals.totalPaid)}
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono font-bold border border-slate-300 tabular-nums text-rose-700">
                      {formatTableNumber(summaryTotals.totalDue)}
                    </td>
                    <td className="border border-slate-300 no-print"></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Interactive New Purchase Invoice / PO Builder Modal */}
      {showCreatePO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-[#0DA54F]" />
                <div>
                  <h3 className="font-bold text-sm">
                    {isBn ? 'নতুন ক্রয় চালান / পারচেজ অর্ডার এন্ট্রি' : 'New Purchase Order / Invoice Entry'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {isBn ? 'সাপ্লায়ার নির্বাচন ও প্রডাক্ট রেট দিয়ে চালান রেকর্ড করুন' : 'Record vendor procurement items and unit prices.'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreatePO(false)}
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePoSubmit} className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">
                    {isBn ? 'ইনভয়েস / চালান নং *' : 'Invoice / Challan No *'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 2600407 / INV-9981"
                    value={invoiceNumberInput}
                    onChange={(e) => setInvoiceNumberInput(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg font-mono font-bold text-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">
                    {isBn ? 'সাপ্লায়ার / ভেন্ডর *' : 'Supplier / Vendor *'}
                  </label>
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-white font-medium"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.paymentTerms})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">
                    {isBn ? 'ক্রয়ের তারিখ *' : 'Purchase / Order Date *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={expectedDate || todayDhakaStr}
                    onChange={(e) => setExpectedDate(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
              </div>

              {/* Add Items Box */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5 text-[#0DA54F]" />
                    <span>{isBn ? 'চালানে প্রডাক্ট যুক্ত করুন' : 'Add Product to Invoice'}</span>
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {poLineItems.length} items added
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    id="productPickerSelect"
                    className="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        addLineToPO(e.target.value);
                        e.target.value = '';
                      }
                    }}
                  >
                    <option value="" disabled>
                      {isBn ? '-- ক্যাটালগ হতে প্রডাক্ট সিলেক্ট করুন --' : '-- Select Product from Catalog --'}
                    </option>
                    {inventoryList.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.itemCode}) — {formatBDT(item.unitCostBDT)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Items Line Table */}
                {poLineItems.length > 0 && (
                  <div className="border border-slate-200 rounded-lg overflow-hidden bg-white mt-2">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-semibold">
                        <tr>
                          <th className="py-2 px-3">Product</th>
                          <th className="py-2 px-3 text-right">Price (BDT)</th>
                          <th className="py-2 px-3 text-center">Qty</th>
                          <th className="py-2 px-3 text-right">Total</th>
                          <th className="py-2 px-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {poLineItems.map((line, idx) => {
                          const inv = inventoryList.find((i) => i.id === line.itemId);
                          const lineTotal = line.orderedQty * line.unitCostBDT;

                          return (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="py-2 px-3 font-semibold text-slate-800">
                                {inv?.name || line.itemId}
                              </td>

                              <td className="py-2 px-3 text-right">
                                <input
                                  type="number"
                                  min="0"
                                  value={line.unitCostBDT}
                                  onChange={(e) => updateLinePrice(idx, parseFloat(e.target.value) || 0)}
                                  className="w-24 p-1 border border-slate-200 rounded text-right font-mono font-bold"
                                />
                              </td>

                              <td className="py-2 px-3">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => updateLineQty(idx, -1)}
                                    className="w-5 h-5 rounded bg-slate-100 text-slate-700 font-bold flex items-center justify-center"
                                  >
                                    -
                                  </button>
                                  <span className="font-mono font-bold w-6 text-center">{line.orderedQty}</span>
                                  <button
                                    type="button"
                                    onClick={() => updateLineQty(idx, 1)}
                                    className="w-5 h-5 rounded bg-slate-100 text-slate-700 font-bold flex items-center justify-center"
                                  >
                                    +
                                  </button>
                                </div>
                              </td>

                              <td className="py-2 px-3 font-mono font-bold text-slate-900 text-right">
                                {formatBDT(lineTotal)}
                              </td>

                              <td className="py-2 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => removeLineFromPO(idx)}
                                  className="text-rose-500 hover:text-rose-700 text-xs font-semibold cursor-pointer"
                                >
                                  Remove
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

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">{isBn ? 'নোট / রিমার্কস' : 'Notes / Remarks'}</label>
                <input
                  type="text"
                  placeholder="e.g. Received via courier, cold chain verified"
                  value={poNotes}
                  onChange={(e) => setPoNotes(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreatePO(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  {isBn ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPO || poLineItems.length === 0}
                  className="px-5 py-2 rounded-xl bg-[#0DA54F] hover:bg-[#0a8740] text-white font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingPO ? 'Saving Invoice...' : isBn ? 'চালান সেভ ও যুক্ত করুন' : 'Save Purchase Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GRN Modal (Receive Goods into Inventory) */}
      {activePoForGrn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-emerald-50/70">
              <div className="flex items-center gap-2">
                <PackageCheck className="w-5 h-5 text-[#0DA54F]" />
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    {isBn ? 'চালান গ্রহণ ও স্টক বৃদ্ধি (Goods Received Note - GRN)' : 'Inward Stock Receiving (GRN)'}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    PO / Invoice: {activePoForGrn.invoiceNo || activePoForGrn.poNumber} • Vendor: {activePoForGrn.supplierName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActivePoForGrn(null)}
                className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGrnSubmit} className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">
                    {isBn ? 'সাপ্লায়ার ইনভয়েস / চালান নং' : 'Supplier Invoice / Delivery Challan Ref'}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. INV-CHALLAN-8891"
                    value={invoiceRefNumber}
                    onChange={(e) => setInvoiceRefNumber(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">
                    {isBn ? 'ইনস্পেকশন নোট' : 'Receiving Inspection Remarks'}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Verified cold chain seals intact"
                    value={grnNotes}
                    onChange={(e) => setGrnNotes(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              {/* Items Inward Table */}
              <div className="space-y-1.5 pt-2">
                <span className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  {isBn ? 'প্রডাক্ট ব্যাচ ও প্রাপ্ত কোয়ান্টিটি' : 'Receive Items & Allocate Batch/Expiry'}
                </span>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-semibold">
                      <tr>
                        <th className="py-2 px-3">Product</th>
                        <th className="py-2 px-3">Batch / Lot *</th>
                        <th className="py-2 px-3">Expiry Date *</th>
                        <th className="py-2 px-3">Qty Recv</th>
                        <th className="py-2 px-3">Condition</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {grnItems.map((line, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-semibold text-slate-800 max-w-[150px] truncate">
                            {line.itemName}
                          </td>

                          <td className="py-2 px-3">
                            <input
                              type="text"
                              required
                              value={line.batchNumber}
                              onChange={(e) => {
                                const val = e.target.value;
                                setGrnItems(
                                  grnItems.map((item, i) => (i === idx ? { ...item, batchNumber: val } : item))
                                );
                              }}
                              className="w-28 p-1 border border-slate-200 rounded font-mono text-[11px]"
                            />
                          </td>

                          <td className="py-2 px-3">
                            <input
                              type="date"
                              required
                              value={line.expiryDate}
                              onChange={(e) => {
                                const val = e.target.value;
                                setGrnItems(
                                  grnItems.map((item, i) => (i === idx ? { ...item, expiryDate: val } : item))
                                );
                              }}
                              className="w-32 p-1 border border-slate-200 rounded font-mono text-[11px]"
                            />
                          </td>

                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min="0"
                              value={line.receivedQty}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10) || 0;
                                setGrnItems(
                                  grnItems.map((item, i) => (i === idx ? { ...item, receivedQty: val } : item))
                                );
                              }}
                              className="w-16 p-1 border border-slate-200 rounded font-mono font-bold text-center"
                            />
                          </td>

                          <td className="py-2 px-3">
                            <select
                              value={line.condition}
                              onChange={(e) => {
                                const val = e.target.value as any;
                                setGrnItems(
                                  grnItems.map((item, i) => (i === idx ? { ...item, condition: val } : item))
                                );
                              }}
                              className="p-1 border border-slate-200 rounded text-[11px] bg-white font-medium"
                            >
                              <option value="good">Good Seal</option>
                              <option value="damaged">Damaged / Reject</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  {isBn
                    ? 'সাবমিট করলে স্বয়ংক্রিয়ভাবে ইনভেনটরি স্টক ও লেজার আপডেট হবে।'
                    : 'Submitting will immediately increment active inventory and log audit event.'}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActivePoForGrn(null)}
                    className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
                  >
                    {isBn ? 'বাতিল' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={isReceivingGrn}
                    className="px-5 py-2 rounded-xl bg-[#0DA54F] hover:bg-[#0a8740] text-white font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isReceivingGrn ? 'Processing GRN...' : isBn ? 'চালান গ্রহণ সম্পন্ন করুন' : 'Confirm GRN Receipt'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View PO Details Modal */}
      {viewingPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#0DA54F]" />
                <h3 className="font-bold text-sm text-slate-900">
                  Purchase Invoice / PO #{viewingPo.invoiceNo || viewingPo.poNumber}
                </h3>
              </div>
              <button
                onClick={() => setViewingPo(null)}
                className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase">Vendor Supplier</span>
                  <p className="font-semibold text-slate-800">{viewingPo.supplierName}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase">Purchase Date</span>
                  <p className="font-semibold text-slate-800">{formatDateDhaka(viewingPo.orderDate)}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase">Payment Status</span>
                  <p className="font-semibold text-slate-800 uppercase">{viewingPo.paymentStatus}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase">Total Value</span>
                  <p className="font-mono font-bold text-[#0DA54F]">{formatBDT(viewingPo.totalBDT)}</p>
                </div>
              </div>

              {viewingPo.notes && (
                <div className="p-2.5 bg-slate-50 rounded-lg text-slate-600 text-[11px]">
                  <strong>Notes: </strong>{viewingPo.notes}
                </div>
              )}

              {/* Items List */}
              <div className="space-y-1.5">
                <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                  Itemized Purchase Lines
                </span>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-semibold">
                      <tr>
                        <th className="py-2 px-3">Item</th>
                        <th className="py-2 px-3">Price</th>
                        <th className="py-2 px-3 text-center">Qty</th>
                        <th className="py-2 px-3 text-right">Total Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewingPo.items.map((it, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-semibold text-slate-800">{it.itemName}</td>
                          <td className="py-2 px-3 font-mono">{formatBDT(it.unitCostBDT)}</td>
                          <td className="py-2 px-3 font-mono text-center">{it.orderedQty}</td>
                          <td className="py-2 px-3 font-mono text-right font-bold text-slate-900">
                            {formatBDT(it.totalBDT)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="pt-2 flex justify-between items-center">
                {viewingPo.status !== 'received' ? (
                  <button
                    onClick={() => {
                      setViewingPo(null);
                      openGrnModal(viewingPo);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#0DA54F] text-white font-semibold text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <PackageCheck className="w-3.5 h-3.5" />
                    <span>{isBn ? 'চালান গ্রহণ করুন (GRN)' : 'Receive GRN'}</span>
                  </button>
                ) : (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200">
                    ✓ Goods Received (GRN Complete)
                  </span>
                )}

                <button
                  onClick={() => setViewingPo(null)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white font-semibold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
