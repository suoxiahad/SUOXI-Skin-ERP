import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Wrench,
  Plus,
  Search,
  RefreshCw,
  UserCheck,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  X,
} from 'lucide-react';
import { api } from '../../../api/client.ts';
import { useApp } from '../../../context/AppContext.tsx';
import { formatBDT } from '../../../utils/format.ts';
import { canManageClinicStore, canViewClinicStoreCosts } from '../../../utils/rbac.ts';
import type { InstrumentCondition, StoreInstrument } from '../../../types/index.ts';

export const StoreInstrumentsView: React.FC = () => {
  const { currentUser, activeBranchId, addToast } = useApp();
  const isManager = canManageClinicStore(currentUser);
  const canSeeCosts = canViewClinicStoreCosts(currentUser);

  const [instruments, setInstruments] = useState<StoreInstrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [custodyFilter, setCustodyFilter] = useState<string>('all');

  // Modals
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [assigningInst, setAssigningInst] = useState<StoreInstrument | null>(null);
  const [returningInst, setReturningInst] = useState<StoreInstrument | null>(null);
  const [reportingInst, setReportingInst] = useState<StoreInstrument | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Register fields
  const [regName, setRegName] = useState('');
  const [regCategory, setRegCategory] = useState('Clinical Instruments & Tools');
  const [regSerial, setRegSerial] = useState('');
  const [regCost, setRegCost] = useState<number>(0);
  const [regRoom, setRegRoom] = useState('');
  const [regHolder, setRegHolder] = useState('');
  const [regNotes, setRegNotes] = useState('');

  // Assign fields
  const [assignRoom, setAssignRoom] = useState('');
  const [assignHolder, setAssignHolder] = useState('');
  const [assignNotes, setAssignNotes] = useState('');

  // Return fields
  const [returnCond, setReturnCond] = useState<'good' | 'under_repair' | 'damaged'>('good');
  const [returnNotes, setReturnNotes] = useState('');

  // Fault / Status fields
  const [faultCondition, setFaultCondition] = useState<InstrumentCondition>('under_repair');
  const [faultNotes, setFaultNotes] = useState('');

  const loadInstruments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.store.listInstruments({ branchId: activeBranchId || undefined });
      setInstruments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load instruments');
    } finally {
      setLoading(false);
    }
  }, [activeBranchId]);

  useEffect(() => {
    void loadInstruments();
  }, [loadInstruments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return instruments.filter((inst) => {
      if (custodyFilter !== 'all' && inst.custodyStatus !== custodyFilter) return false;
      if (q) {
        const m =
          inst.name.toLowerCase().includes(q) ||
          inst.assetTag.toLowerCase().includes(q) ||
          (inst.serialNumber && inst.serialNumber.toLowerCase().includes(q)) ||
          (inst.assignedRoom && inst.assignedRoom.toLowerCase().includes(q)) ||
          (inst.assignedToUserName && inst.assignedToUserName.toLowerCase().includes(q));
        if (!m) return false;
      }
      return true;
    });
  }, [instruments, search, custodyFilter]);

  const stats = useMemo(() => {
    return {
      total: instruments.length,
      assigned: instruments.filter((i) => i.custodyStatus === 'assigned').length,
      inStore: instruments.filter((i) => i.custodyStatus === 'in_store').length,
      maintenance: instruments.filter((i) => i.custodyStatus === 'maintenance' || i.condition === 'under_repair' || i.condition === 'damaged').length,
    };
  }, [instruments]);

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim()) return;
    setSubmitting(true);
    try {
      await api.store.createInstrument({
        name: regName.trim(),
        category: regCategory.trim() || undefined,
        serialNumber: regSerial.trim() || undefined,
        purchaseCostBDT: Math.max(0, Number(regCost) || 0),
        assignedRoom: regRoom.trim() || undefined,
        assignedToUserName: regHolder.trim() || undefined,
        notes: regNotes.trim() || undefined,
        branchId: activeBranchId || undefined,
      });
      addToast({ type: 'success', title: 'Instrument Registered', description: `${regName.trim()} added to asset registry.` });
      setIsRegisterOpen(false);
      setRegName('');
      setRegSerial('');
      setRegCost(0);
      setRegRoom('');
      setRegHolder('');
      setRegNotes('');
      await loadInstruments();
    } catch (err) {
      addToast({ type: 'error', title: 'Registration Failed', description: err instanceof Error ? err.message : 'Unable to register.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningInst || !assignRoom.trim() || !assignHolder.trim()) return;
    setSubmitting(true);
    try {
      await api.store.assignInstrument(assigningInst.id, {
        assignedRoom: assignRoom.trim(),
        assignedToUserName: assignHolder.trim(),
        notes: assignNotes.trim() || undefined,
      });
      addToast({
        type: 'success',
        title: 'Custody Assigned',
        description: `${assigningInst.assetTag} assigned to ${assignHolder.trim()} (${assignRoom.trim()}).`,
      });
      setAssigningInst(null);
      await loadInstruments();
    } catch (err) {
      addToast({ type: 'error', title: 'Assignment Failed', description: err instanceof Error ? err.message : 'Unable to assign.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returningInst) return;
    setSubmitting(true);
    try {
      await api.store.returnInstrument(returningInst.id, {
        condition: returnCond,
        notes: returnNotes.trim() || undefined,
      });
      addToast({
        type: 'success',
        title: 'Returned to Store',
        description: `${returningInst.assetTag} returned in '${returnCond.replace('_', ' ')}' condition.`,
      });
      setReturningInst(null);
      await loadInstruments();
    } catch (err) {
      addToast({ type: 'error', title: 'Return Failed', description: err instanceof Error ? err.message : 'Unable to return.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportingInst) return;
    setSubmitting(true);
    try {
      await api.store.updateInstrumentStatus(reportingInst.id, {
        condition: faultCondition,
        notes: faultNotes.trim() || undefined,
      });
      addToast({
        type: 'success',
        title: 'Condition Updated',
        description: `${reportingInst.assetTag} marked as ${faultCondition.replace('_', ' ')}.`,
      });
      setReportingInst(null);
      await loadInstruments();
    } catch (err) {
      addToast({ type: 'error', title: 'Update Failed', description: err instanceof Error ? err.message : 'Unable to update status.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkRepaired = async (inst: StoreInstrument) => {
    setSubmitting(true);
    try {
      await api.store.updateInstrumentStatus(inst.id, {
        condition: 'good',
        notes: 'Cleared from maintenance and ready for clinical use',
      });
      addToast({ type: 'success', title: 'Instrument Cleared', description: `${inst.assetTag} marked Good.` });
      await loadInstruments();
    } catch (err) {
      addToast({ type: 'error', title: 'Update Failed', description: err instanceof Error ? err.message : 'Unable to update.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center">
              <Wrench className="w-4 h-4" />
            </div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">
              Clinical Instruments &amp; Custody
            </h1>
          </div>
          <p className="text-xs text-slate-500">
            Track reusable clinical instruments, room custody assignments, return checks, and repair tickets.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void loadInstruments()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {isManager && (
            <button
              type="button"
              onClick={() => setIsRegisterOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Register Instrument
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Registered Assets</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{stats.total}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Assigned to Rooms</p>
          <p className="text-2xl font-bold text-teal-700 mt-1 tabular-nums">{stats.assigned}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Available in Store</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1 tabular-nums">{stats.inStore}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Repair / Maintenance</p>
          <p className={`text-2xl font-bold mt-1 tabular-nums ${stats.maintenance > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
            {stats.maintenance}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search asset tag, instrument name, serial no., room, or staff..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
          />
        </div>
        <select
          value={custodyFilter}
          onChange={(e) => setCustodyFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:border-teal-500"
        >
          <option value="all">All Custody Statuses</option>
          <option value="assigned">Assigned to Room</option>
          <option value="in_store">In Central Store</option>
          <option value="maintenance">Under Maintenance</option>
          <option value="retired">Retired</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {error ? (
          <div className="p-8 text-center text-xs text-rose-600">{error}</div>
        ) : loading ? (
          <div className="p-10 text-center text-xs text-slate-500">Loading instruments registry...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">No clinical instruments found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Asset Tag</th>
                  <th className="py-3 px-4">Instrument Name</th>
                  <th className="py-3 px-4">Serial No.</th>
                  <th className="py-3 px-4">Custody Status</th>
                  <th className="py-3 px-4">Assigned Room &amp; Holder</th>
                  <th className="py-3 px-4">Condition</th>
                  {canSeeCosts && <th className="py-3 px-4 text-right">Purchase Cost</th>}
                  <th className="py-3 px-4">Last Service</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((inst) => (
                  <tr key={inst.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-700 whitespace-nowrap">
                      {inst.assetTag}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{inst.name}</div>
                      {inst.notes && <div className="text-[11px] text-slate-400 truncate max-w-xs">{inst.notes}</div>}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                      {inst.serialNumber || '—'}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {inst.custodyStatus === 'assigned' && (
                        <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 border border-teal-200 text-[11px] font-semibold">
                          Assigned
                        </span>
                      )}
                      {inst.custodyStatus === 'in_store' && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
                          In Store
                        </span>
                      )}
                      {inst.custodyStatus === 'maintenance' && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-semibold">
                          Maintenance
                        </span>
                      )}
                      {inst.custodyStatus === 'retired' && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 text-[11px] font-semibold">
                          Retired
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {inst.assignedRoom || inst.assignedToUserName ? (
                        <div>
                          <div className="font-semibold text-slate-800">{inst.assignedRoom || '—'}</div>
                          <div className="text-[11px] text-slate-500">{inst.assignedToUserName}</div>
                        </div>
                      ) : (
                        <span className="text-slate-400">Central Store</span>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                          inst.condition === 'good' || inst.condition === 'in_use'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : inst.condition === 'under_repair'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {inst.condition === 'good' || inst.condition === 'in_use' ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <AlertTriangle className="w-3 h-3" />
                        )}
                        {inst.condition.replace('_', ' ')}
                      </span>
                    </td>
                    {canSeeCosts && (
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {formatBDT(inst.purchaseCostBDT)}
                      </td>
                    )}
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                      {inst.lastServiceDate || '—'}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {isManager && inst.custodyStatus === 'in_store' && inst.condition !== 'damaged' && inst.condition !== 'retired' && (
                          <button
                            type="button"
                            onClick={() => {
                              setAssigningInst(inst);
                              setAssignRoom('');
                              setAssignHolder('');
                              setAssignNotes('');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 text-[11px] font-semibold cursor-pointer"
                          >
                            <UserCheck className="w-3 h-3" />
                            Assign
                          </button>
                        )}
                        {isManager && inst.custodyStatus === 'assigned' && (
                          <button
                            type="button"
                            onClick={() => {
                              setReturningInst(inst);
                              setReturnCond('good');
                              setReturnNotes('');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-semibold cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Return
                          </button>
                        )}
                        {isManager && (inst.custodyStatus === 'maintenance' || inst.condition === 'under_repair' || inst.condition === 'damaged') && (
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => void handleMarkRepaired(inst)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-semibold cursor-pointer"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Mark Repaired
                          </button>
                        )}
                        {!isManager && inst.condition !== 'retired' && (
                          <button
                            type="button"
                            onClick={() => {
                              setReportingInst(inst);
                              setFaultCondition('under_repair');
                              setFaultNotes('');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-semibold cursor-pointer"
                          >
                            <AlertTriangle className="w-3 h-3" />
                            Report Fault / Repair
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Register Instrument Modal */}
      {isRegisterOpen && isManager && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">Register Clinical Instrument</h3>
              <button
                type="button"
                onClick={() => setIsRegisterOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleRegisterSubmit} className="p-5 space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Instrument Name *</label>
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="e.g., Heine Delta 30 Dermascope"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Serial Number</label>
                  <input
                    type="text"
                    value={regSerial}
                    onChange={(e) => setRegSerial(e.target.value)}
                    placeholder="e.g., HN-D30-9910"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Purchase Cost (BDT)</label>
                  <input
                    type="number"
                    min={0}
                    value={regCost}
                    onChange={(e) => setRegCost(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg tabular-nums focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Initial Room (Optional)</label>
                  <input
                    type="text"
                    value={regRoom}
                    onChange={(e) => setRegRoom(e.target.value)}
                    placeholder="Leave blank for Store"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Custodian Staff (Optional)</label>
                  <input
                    type="text"
                    value={regHolder}
                    onChange={(e) => setRegHolder(e.target.value)}
                    placeholder="e.g., Dr. Farhana Rahman"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Notes</label>
                  <input
                    type="text"
                    value={regNotes}
                    onChange={(e) => setRegNotes(e.target.value)}
                    placeholder="Calibration or warranty details"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsRegisterOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold cursor-pointer"
                >
                  {submitting ? 'Registering...' : 'Register Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Custody Modal */}
      {assigningInst && isManager && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Assign Instrument Custody</h3>
                <p className="text-[11px] text-slate-500">
                  {assigningInst.assetTag} — {assigningInst.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAssigningInst(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAssignSubmit} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Assigned Room / Desk *</label>
                <input
                  type="text"
                  required
                  value={assignRoom}
                  onChange={(e) => setAssignRoom(e.target.value)}
                  placeholder="e.g., Laser Room 1"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Custodian Staff Name *</label>
                <input
                  type="text"
                  required
                  value={assignHolder}
                  onChange={(e) => setAssignHolder(e.target.value)}
                  placeholder="e.g., Dr. Farhana Rahman"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Handover Notes</label>
                <input
                  type="text"
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                  placeholder="Optional accessories included"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAssigningInst(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold cursor-pointer"
                >
                  {submitting ? 'Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Return to Store Modal */}
      {returningInst && isManager && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Return Instrument to Store</h3>
                <p className="text-[11px] text-slate-500">
                  {returningInst.assetTag} — {returningInst.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReturningInst(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleReturnSubmit} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Return Condition *</label>
                <select
                  value={returnCond}
                  onChange={(e) => setReturnCond(e.target.value as 'good' | 'under_repair' | 'damaged')}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-teal-500"
                >
                  <option value="good">Good (Ready for Store)</option>
                  <option value="under_repair">Needs Repair / Servicing</option>
                  <option value="damaged">Damaged</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Inspection Notes</label>
                <textarea
                  rows={2}
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  placeholder="Condition notes on return..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReturningInst(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold cursor-pointer"
                >
                  {submitting ? 'Processing...' : 'Confirm Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Clinical Staff Fault / Repair Modal */}
      {reportingInst && !isManager && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Report Instrument Fault / Repair</h3>
                <p className="text-[11px] text-slate-500">
                  {reportingInst.assetTag} — {reportingInst.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReportingInst(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleStatusSubmit} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Condition *</label>
                <select
                  value={faultCondition}
                  onChange={(e) => setFaultCondition(e.target.value as InstrumentCondition)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-amber-500"
                >
                  <option value="under_repair">Needs Calibration / Repair</option>
                  <option value="damaged">Damaged / Unusable</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Issue Description *</label>
                <textarea
                  rows={3}
                  required
                  value={faultNotes}
                  onChange={(e) => setFaultNotes(e.target.value)}
                  placeholder="Describe the fault or calibration issue..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReportingInst(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold cursor-pointer"
                >
                  {submitting ? 'Submitting...' : 'Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
