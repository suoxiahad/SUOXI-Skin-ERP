import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ClipboardList,
  Plus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Send,
  PackageCheck,
  Trash2,
  X,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { api } from '../../../api/client.ts';
import { useApp } from '../../../context/AppContext.tsx';
import { formatBDT, formatDateDhaka } from '../../../utils/format.ts';
import {
  canManageClinicStore,
  canRequestClinicStore,
  canViewClinicStoreCosts,
} from '../../../utils/rbac.ts';
import type { StoreItem, StoreRequisition } from '../../../types/index.ts';

const DEPARTMENTS = [
  'Consultation Desk',
  'Laser & Procedure Room',
  'Reception & Front Desk',
  'Billing Counter',
  'Call Center',
  'Sterilization & Nursing',
];

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'issued', label: 'Issued' },
  { value: 'received', label: 'Received' },
  { value: 'rejected', label: 'Rejected' },
];

export const StoreRequisitionsView: React.FC = () => {
  const { currentUser, activeBranchId, addToast } = useApp();
  const isManager = canManageClinicStore(currentUser);
  const canRequest = canRequestClinicStore(currentUser);
  const canSeeCosts = canViewClinicStoreCosts(currentUser);

  const [requisitions, setRequisitions] = useState<StoreRequisition[]>([]);
  const [catalogItems, setCatalogItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Create Requisition Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [reqDepartment, setReqDepartment] = useState<string>(() => {
    if (currentUser?.role === 'doctor') return 'Consultation Desk';
    if (currentUser?.role === 'therapist') return 'Laser & Procedure Room';
    if (currentUser?.role === 'receptionist') return 'Reception & Front Desk';
    if (currentUser?.role === 'cashier') return 'Billing Counter';
    if (currentUser?.role === 'call_center') return 'Call Center';
    return 'Consultation Desk';
  });
  const [reqRoom, setReqRoom] = useState('');
  const [reqPriority, setReqPriority] = useState<'normal' | 'urgent'>('normal');
  const [reqNotes, setReqNotes] = useState('');
  const [reqLines, setReqLines] = useState<Array<{ itemId: string; requestedQty: number }>>([
    { itemId: '', requestedQty: 1 },
  ]);

  // Issue Modal
  const [issuingReq, setIssuingReq] = useState<StoreRequisition | null>(null);
  const [issueQtyMap, setIssueQtyMap] = useState<Record<string, number>>({});
  const [issueNotes, setIssueNotes] = useState('');

  // Reject Modal
  const [rejectingReq, setRejectingReq] = useState<StoreRequisition | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reqs, items] = await Promise.all([
        api.store.listRequisitions({ branchId: activeBranchId || undefined }),
        api.store.listItems({ branchId: activeBranchId || undefined }),
      ]);
      setRequisitions(reqs);
      setCatalogItems(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load requisitions');
    } finally {
      setLoading(false);
    }
  }, [activeBranchId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredRequisitions = useMemo(() => {
    if (statusFilter === 'all') return requisitions;
    if (statusFilter === 'issued') {
      return requisitions.filter((r) => r.status === 'issued' || r.status === 'partially_issued');
    }
    return requisitions.filter((r) => r.status === statusFilter);
  }, [requisitions, statusFilter]);

  const openCreateModal = () => {
    setReqRoom('');
    setReqPriority('normal');
    setReqNotes('');
    setReqLines([{ itemId: catalogItems[0]?.id || '', requestedQty: 1 }]);
    setIsCreateOpen(true);
  };

  const addReqLine = () => {
    setReqLines((prev) => [...prev, { itemId: catalogItems[0]?.id || '', requestedQty: 1 }]);
  };

  const removeReqLine = (idx: number) => {
    setReqLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = reqLines.filter((l) => l.itemId && l.requestedQty > 0);
    if (validLines.length === 0) {
      addToast({ type: 'warning', title: 'Select Items', description: 'Add at least one supply item with quantity > 0.' });
      return;
    }

    // Deduplicate itemIds by summing quantities
    const mergedMap = new Map<string, number>();
    for (const line of validLines) {
      mergedMap.set(line.itemId, (mergedMap.get(line.itemId) || 0) + Math.floor(line.requestedQty));
    }

    setSubmitting(true);
    try {
      await api.store.createRequisition({
        department: reqDepartment,
        roomNumber: reqRoom.trim() || undefined,
        priority: reqPriority,
        notes: reqNotes.trim() || undefined,
        branchId: activeBranchId || undefined,
        items: Array.from(mergedMap.entries()).map(([itemId, requestedQty]) => ({ itemId, requestedQty })),
      });
      addToast({
        type: 'success',
        title: 'Requisition Submitted',
        description: `Request sent to Clinic Store for ${reqDepartment}.`,
      });
      setIsCreateOpen(false);
      await loadData();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Submission Failed',
        description: err instanceof Error ? err.message : 'Unable to submit requisition.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (req: StoreRequisition) => {
    setSubmitting(true);
    try {
      await api.store.approveRequisition(req.id, { decision: 'approve' });
      addToast({ type: 'success', title: 'Requisition Approved', description: `${req.reqNumber} is ready for issue.` });
      await loadData();
    } catch (err) {
      addToast({ type: 'error', title: 'Approval Failed', description: err instanceof Error ? err.message : 'Unable to approve.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingReq) return;
    setSubmitting(true);
    try {
      await api.store.approveRequisition(rejectingReq.id, {
        decision: 'reject',
        rejectionReason: rejectReason.trim() || 'Declined by Store Manager',
      });
      addToast({ type: 'info', title: 'Requisition Rejected', description: `${rejectingReq.reqNumber} was declined.` });
      setRejectingReq(null);
      setRejectReason('');
      await loadData();
    } catch (err) {
      addToast({ type: 'error', title: 'Rejection Failed', description: err instanceof Error ? err.message : 'Unable to reject.' });
    } finally {
      setSubmitting(false);
    }
  };

  const openIssueModal = (req: StoreRequisition) => {
    const initialMap: Record<string, number> = {};
    for (const line of req.items) {
      const target = line.approvedQty || line.requestedQty;
      const remaining = Math.max(0, target - line.issuedQty);
      const stockItem = catalogItems.find((s) => s.id === line.itemId);
      initialMap[line.itemId] = stockItem ? Math.min(remaining, stockItem.currentStock) : remaining;
    }
    setIssueQtyMap(initialMap);
    setIssueNotes('');
    setIssuingReq(req);
  };

  const handleIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issuingReq) return;
    setSubmitting(true);
    try {
      await api.store.issueRequisition(issuingReq.id, {
        issueQuantities: issueQtyMap,
        notes: issueNotes.trim() || undefined,
      });
      addToast({
        type: 'success',
        title: 'Supplies Dispatched',
        description: `Issued supplies for ${issuingReq.reqNumber} and deducted store balance.`,
      });
      setIssuingReq(null);
      await loadData();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Issue Failed',
        description: err instanceof Error ? err.message : 'Unable to issue supplies.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmReceipt = async (req: StoreRequisition) => {
    setSubmitting(true);
    try {
      await api.store.confirmReceipt(req.id);
      addToast({
        type: 'success',
        title: 'Receipt Confirmed',
        description: `Confirmed delivery of ${req.reqNumber}.`,
      });
      await loadData();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Confirmation Failed',
        description: err instanceof Error ? err.message : 'Unable to confirm receipt.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const renderStatusBadge = (status: StoreRequisition['status']) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-semibold">
            <Clock className="w-3 h-3" /> Pending
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-semibold">
            <CheckCircle2 className="w-3 h-3" /> Approved
          </span>
        );
      case 'partially_issued':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-semibold">
            <Send className="w-3 h-3" /> Partially Issued
          </span>
        );
      case 'issued':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 border border-teal-200 text-[11px] font-semibold">
            <Send className="w-3 h-3" /> Issued
          </span>
        );
      case 'received':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
            <PackageCheck className="w-3 h-3" /> Received
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-semibold">
            <XCircle className="w-3 h-3" /> Rejected
          </span>
        );
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center">
              <ClipboardList className="w-4 h-4" />
            </div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">
              Store Requisitions &amp; Internal Issue
            </h1>
          </div>
          <p className="text-xs text-slate-500">
            {isManager
              ? 'Review room & desk supply requests, approve quantities, and dispatch consumables from the central Clinic Store.'
              : 'Request clinical consumables, hygiene items, or office supplies for your room or desk and confirm delivery receipt.'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {canRequest && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              New Requisition
            </button>
          )}
        </div>
      </div>

      {/* Status Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-2 flex flex-wrap items-center gap-1.5">
        {STATUS_FILTERS.map((sf) => (
          <button
            key={sf.value}
            type="button"
            onClick={() => setStatusFilter(sf.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              statusFilter === sf.value
                ? 'bg-teal-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {sf.label}
          </button>
        ))}
      </div>

      {/* Requisitions List */}
      <div className="space-y-3">
        {error ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
            <AlertTriangle className="w-6 h-6 text-rose-500 mx-auto" />
            <p className="text-xs font-semibold text-rose-700">{error}</p>
          </div>
        ) : loading ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-xs text-slate-500">
            Loading store requisitions...
          </div>
        ) : filteredRequisitions.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
            <ClipboardList className="w-7 h-7 text-slate-300 mx-auto" />
            <p className="text-xs font-semibold text-slate-700">No requisitions found in this view.</p>
            {canRequest && (
              <p className="text-[11px] text-slate-400">
                Click "New Requisition" to request supplies for your room or desk.
              </p>
            )}
          </div>
        ) : (
          filteredRequisitions.map((req) => (
            <div key={req.id} className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="font-mono font-bold text-xs text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md">
                    {req.reqNumber}
                  </span>
                  {renderStatusBadge(req.status)}
                  {req.priority === 'urgent' && (
                    <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-bold uppercase tracking-wider">
                      Urgent
                    </span>
                  )}
                  <span className="text-xs font-semibold text-slate-800">{req.department}</span>
                  {req.roomNumber && (
                    <span className="text-[11px] text-slate-500">• {req.roomNumber}</span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <span>
                    Requested by <strong className="text-slate-700">{req.requestedByName}</strong>
                  </span>
                  <span>•</span>
                  <span>{formatDateDhaka(req.createdAt)}</span>
                  {canSeeCosts && (
                    <>
                      <span>•</span>
                      <span className="font-mono font-semibold text-slate-800">
                        Est. {formatBDT(req.totalEstimatedCostBDT)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Requested Lines */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                      <th className="py-1.5 pr-3">Item</th>
                      <th className="py-1.5 px-3 text-right">Requested</th>
                      <th className="py-1.5 px-3 text-right">Approved</th>
                      <th className="py-1.5 px-3 text-right">Issued</th>
                      {canSeeCosts && <th className="py-1.5 pl-3 text-right">Line Value</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {req.items.map((line) => (
                      <tr key={line.itemId}>
                        <td className="py-2 pr-3">
                          <span className="font-semibold text-slate-800">{line.itemName}</span>{' '}
                          <span className="font-mono text-[10px] text-slate-400">({line.itemCode})</span>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-700">
                          {line.requestedQty} {line.unit}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-700">
                          {line.approvedQty} {line.unit}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold text-teal-700">
                          {line.issuedQty} {line.unit}
                        </td>
                        {canSeeCosts && (
                          <td className="py-2 pl-3 text-right font-mono tabular-nums text-slate-700">
                            {formatBDT((line.issuedQty || line.approvedQty || line.requestedQty) * line.unitCostBDT)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(req.notes || req.rejectionReason || req.issuedByName || req.receivedByName) && (
                <div className="text-[11px] text-slate-600 bg-slate-50 rounded-lg px-3 py-2 flex flex-wrap gap-x-4 gap-y-1">
                  {req.notes && <span>Note: {req.notes}</span>}
                  {req.rejectionReason && (
                    <span className="text-rose-700 font-semibold">Rejection Reason: {req.rejectionReason}</span>
                  )}
                  {req.issuedByName && (
                    <span>
                      Issued by <strong>{req.issuedByName}</strong>
                    </span>
                  )}
                  {req.receivedByName && (
                    <span className="text-emerald-700">
                      Received by <strong>{req.receivedByName}</strong>
                    </span>
                  )}
                </div>
              )}

              {/* Role-Scoped Action Bar */}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                {isManager && req.status === 'pending' && (
                  <>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => {
                        setRejectingReq(req);
                        setRejectReason('');
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => void handleApprove(req)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Approve
                    </button>
                  </>
                )}

                {isManager && ['pending', 'approved', 'partially_issued'].includes(req.status) && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => openIssueModal(req)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Issue &amp; Dispatch
                  </button>
                )}

                {canRequest &&
                  (req.status === 'issued' || req.status === 'partially_issued') &&
                  (req.requestedById === currentUser?.id || isManager) && (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => void handleConfirmReceipt(req)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      <PackageCheck className="w-3.5 h-3.5" />
                      Confirm Receipt
                    </button>
                  )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Submit Requisition Modal */}
      {isCreateOpen && canRequest && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">Submit Clinic Store Requisition</h3>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-5 space-y-4 text-xs max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Department *</label>
                  <select
                    value={reqDepartment}
                    onChange={(e) => setReqDepartment(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-teal-500"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Room / Desk</label>
                  <input
                    type="text"
                    value={reqRoom}
                    onChange={(e) => setReqRoom(e.target.value)}
                    placeholder="e.g., Room 2 / Desk 1"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Priority</label>
                  <select
                    value={reqPriority}
                    onChange={(e) => setReqPriority(e.target.value as 'normal' | 'urgent')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-teal-500"
                  >
                    <option value="normal">Normal</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700">Requested Items *</label>
                  <button
                    type="button"
                    onClick={addReqLine}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:text-teal-800 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Row
                  </button>
                </div>

                <div className="space-y-2">
                  {reqLines.map((line, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        required
                        value={line.itemId}
                        onChange={(e) =>
                          setReqLines((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, itemId: e.target.value } : row))
                          )
                        }
                        className="flex-1 px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-teal-500"
                      >
                        <option value="">Select supply item...</option>
                        {catalogItems.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.name} ({it.currentStock} {it.unit} avail.)
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        required
                        value={line.requestedQty}
                        onChange={(e) =>
                          setReqLines((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, requestedQty: Math.max(1, Number(e.target.value)) } : row
                            )
                          )
                        }
                        className="w-24 px-3 py-2 border border-slate-200 rounded-lg tabular-nums focus:outline-none focus:border-teal-500"
                      />
                      {reqLines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeReqLine(idx)}
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={reqNotes}
                  onChange={(e) => setReqNotes(e.target.value)}
                  placeholder="Optional reason or shift context..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold cursor-pointer"
                >
                  {submitting ? 'Submitting...' : 'Submit Requisition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Issue & Dispatch Modal */}
      {issuingReq && isManager && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Issue &amp; Dispatch Supplies</h3>
                <p className="text-[11px] text-slate-500">
                  {issuingReq.reqNumber} → {issuingReq.department}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIssuingReq(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleIssueSubmit} className="p-5 space-y-4 text-xs">
              <div className="space-y-2.5">
                {issuingReq.items.map((line) => {
                  const target = line.approvedQty || line.requestedQty;
                  const remaining = Math.max(0, target - line.issuedQty);
                  const stockItem = catalogItems.find((s) => s.id === line.itemId);
                  return (
                    <div
                      key={line.itemId}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/50"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{line.itemName}</p>
                        <p className="text-[11px] text-slate-500">
                          Remaining: {remaining} {line.unit} • In Store:{' '}
                          <strong>{stockItem?.currentStock ?? '—'}</strong>
                        </p>
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={remaining}
                        value={issueQtyMap[line.itemId] ?? remaining}
                        onChange={(e) =>
                          setIssueQtyMap((prev) => ({
                            ...prev,
                            [line.itemId]: Math.max(0, Math.min(remaining, Number(e.target.value))),
                          }))
                        }
                        className="w-24 px-3 py-1.5 border border-slate-200 rounded-lg bg-white tabular-nums text-right font-semibold"
                      />
                    </div>
                  );
                })}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Dispatch Notes</label>
                <input
                  type="text"
                  value={issueNotes}
                  onChange={(e) => setIssueNotes(e.target.value)}
                  placeholder="Optional handover remarks"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIssuingReq(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold cursor-pointer"
                >
                  {submitting ? 'Dispatching...' : 'Confirm Issue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectingReq && isManager && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">Reject Requisition {rejectingReq.reqNumber}</h3>
              <button
                type="button"
                onClick={() => setRejectingReq(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleRejectSubmit} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Reason for Rejection *</label>
                <textarea
                  rows={3}
                  required
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Provide reason for declining this request..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-rose-500"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRejectingReq(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-semibold cursor-pointer"
                >
                  {submitting ? 'Rejecting...' : 'Confirm Reject'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
