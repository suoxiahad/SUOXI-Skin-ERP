import React, { useState, useEffect, useMemo } from 'react';
import {
  ClipboardList,
  Plus,
  Search,
  Trash2,
  Copy,
  Check,
  Save,
  ArrowRight,
  Droplet,
  Sun,
  Apple,
  Sparkles,
  FlaskConical,
  Pill,
  Star,
  AlertCircle,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';
import { api } from '../../../api/client.ts';
import type { RxProtocol, RxProtocolCategory } from '../../../types/index.ts';
import {
  PROTOCOL_CATEGORIES,
  DIAGNOSIS_PRESETS,
  INVESTIGATION_CHIPS,
  PROCEDURE_OPTIONS,
  MEDICINE_FORMS,
  SKIN_TYPES,
  QUICK_ADVICE_CHIPS,
  DEFAULT_MORNING_ROUTINE,
  DEFAULT_EVENING_ROUTINE,
  DEFAULT_RECOMMENDED_FOODS,
  DEFAULT_PROHIBITED_FOODS,
  getContextualSuggestionsForDiagnosis,
  type RxMedicineDraft,
} from './consultationPresets.ts';

export const PENDING_PROTOCOL_STORAGE_KEY = 'suoxi_pending_protocol_id';

function createEmptyProtocol(): Omit<RxProtocol, 'id' | 'updatedAt' | 'createdBy'> {
  return {
    name: '',
    subtitle: '',
    category: 'General Dermatology',
    isActive: true,
    isDefaultBaseline: false,
    diagnosis: '',
    chiefComplaints: '',
    investigations: '',
    examinationNotes: '',
    skinType: 'combination',
    targetZones: [],
    procedures: [],
    medicines: [],
    adviceList: [],
    sunInstructions:
      'Apply broad-spectrum SPF 50+ PA++++ 20 minutes before sun or heat exposure; reapply every 3 hours.',
    sunInstructionsBn:
      'রোদে বা চুলার পাশে যাওয়ার ২০ মিনিট আগে সানস্ক্রিন ব্যবহার করুন এবং প্রতি ৩ ঘণ্টায় রি-অ্যাপ্লাই করুন।',
    waterLiters: 2.5,
    followUpDays: 14,
    morningRoutine: [...DEFAULT_MORNING_ROUTINE],
    eveningRoutine: [...DEFAULT_EVENING_ROUTINE],
    recommendedFoods: [...DEFAULT_RECOMMENDED_FOODS],
    prohibitedFoods: [...DEFAULT_PROHIBITED_FOODS],
  };
}

export const RxProtocolsView: React.FC = () => {
  const { currentUser, addToast, navigate } = useApp();
  const canEdit =
    !currentUser || currentUser.role === 'doctor' || currentUser.role === 'super_admin';

  const [protocols, setProtocols] = useState<RxProtocol[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | RxProtocolCategory>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Editable Draft State
  const [draft, setDraft] = useState<Omit<RxProtocol, 'id' | 'updatedAt' | 'createdBy'>>(
    createEmptyProtocol()
  );
  const [customProcedureInput, setCustomProcedureInput] = useState('');
  const [adviceInput, setAdviceInput] = useState('');
  const [morningInput, setMorningInput] = useState('');
  const [eveningInput, setEveningInput] = useState('');
  const [recFoodInput, setRecFoodInput] = useState('');
  const [avoidFoodInput, setAvoidFoodInput] = useState('');

  const loadProtocols = async (selectIdAfter?: string) => {
    setIsLoading(true);
    try {
      const list = await api.rxProtocols.list(false);
      setProtocols(list);
      const target =
        (selectIdAfter ? list.find((p) => p.id === selectIdAfter) : null) ||
        list[0] ||
        null;
      if (target && !isCreatingNew) {
        setSelectedId(target.id);
        hydrateDraft(target);
      }
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Failed to load Rx Protocols',
        description: (err as Error).message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProtocols();
  }, []);

  const hydrateDraft = (proto: RxProtocol) => {
    setDraft({
      name: proto.name,
      subtitle: proto.subtitle,
      category: proto.category,
      isActive: proto.isActive,
      isDefaultBaseline: Boolean(proto.isDefaultBaseline),
      diagnosis: proto.diagnosis,
      chiefComplaints: proto.chiefComplaints,
      investigations: proto.investigations || '',
      examinationNotes: proto.examinationNotes || '',
      skinType: proto.skinType,
      targetZones: [...(proto.targetZones || [])],
      procedures: [...(proto.procedures || [])],
      medicines: (proto.medicines || []).map((m) => ({ ...m })),
      adviceList: [...(proto.adviceList || [])],
      sunInstructions: proto.sunInstructions || '',
      sunInstructionsBn: proto.sunInstructionsBn || '',
      waterLiters: proto.waterLiters || 2.5,
      followUpDays: proto.followUpDays ?? 14,
      morningRoutine: [...(proto.morningRoutine || [])],
      eveningRoutine: [...(proto.eveningRoutine || [])],
      recommendedFoods: [...(proto.recommendedFoods || [])],
      prohibitedFoods: [...(proto.prohibitedFoods || [])],
    });
  };

  const handleSelectProtocol = (proto: RxProtocol) => {
    setIsCreatingNew(false);
    setSelectedId(proto.id);
    hydrateDraft(proto);
  };

  const handleStartNew = () => {
    setIsCreatingNew(true);
    setSelectedId(null);
    setDraft(createEmptyProtocol());
  };

  const handleDuplicate = async (proto: RxProtocol) => {
    if (!canEdit) return;
    try {
      const created = await api.rxProtocols.create({
        ...proto,
        name: `${proto.name} (Copy)`,
        isDefaultBaseline: false,
      });
      window.dispatchEvent(new CustomEvent('rx-protocols-updated'));
      setIsCreatingNew(false);
      await loadProtocols(created.id);
      addToast({
        type: 'success',
        title: 'Protocol Duplicated',
        description: `"${created.name}" created.`,
      });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Duplicate Failed',
        description: (err as Error).message,
      });
    }
  };

  const handleDelete = async (proto: RxProtocol) => {
    if (!canEdit) return;
    try {
      await api.rxProtocols.remove(proto.id);
      window.dispatchEvent(new CustomEvent('rx-protocols-updated'));
      const remaining = protocols.filter((p) => p.id !== proto.id);
      setProtocols(remaining);
      if (selectedId === proto.id) {
        if (remaining.length > 0) {
          setSelectedId(remaining[0].id);
          hydrateDraft(remaining[0]);
        } else {
          handleStartNew();
        }
      }
      addToast({
        type: 'info',
        title: 'Protocol Removed',
        description: `"${proto.name}" deleted from clinic library.`,
      });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Delete Failed',
        description: (err as Error).message,
      });
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canEdit) {
      addToast({
        type: 'warning',
        title: 'Read-only Access',
        description: 'Only Doctors or Super Admins can save Rx protocols.',
      });
      return;
    }
    if (draft.name.trim().length < 2) {
      addToast({
        type: 'warning',
        title: 'Protocol Name Required',
        description: 'Enter a descriptive name before saving.',
      });
      return;
    }

    const cleanDraft = {
      ...draft,
      name: draft.name.trim(),
      subtitle:
        draft.subtitle.trim() ||
        `${draft.medicines.length} Rx · ${draft.procedures.length} procedures`,
      medicines: draft.medicines.filter((m) => m.name.trim().length > 0),
    };

    setIsSaving(true);
    try {
      let saved: RxProtocol;
      if (isCreatingNew || !selectedId) {
        saved = await api.rxProtocols.create(cleanDraft);
        setIsCreatingNew(false);
        setSelectedId(saved.id);
      } else {
        saved = await api.rxProtocols.update(selectedId, cleanDraft);
      }
      window.dispatchEvent(new CustomEvent('rx-protocols-updated'));
      await loadProtocols(saved.id);
      addToast({
        type: 'success',
        title: `Saved: ${saved.name}`,
        description: saved.isDefaultBaseline
          ? 'Updated protocol & set as Clinic Baseline Care for new prescriptions.'
          : 'Synced to Consultation Desk Rx Protocols menu.',
      });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Save Failed',
        description: (err as Error).message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenInDesk = async () => {
    if (selectedId && !isCreatingNew) {
      try {
        sessionStorage.setItem(PENDING_PROTOCOL_STORAGE_KEY, selectedId);
      } catch {
        // ignore
      }
    }
    navigate('/consultation/desk');
  };

  const filteredProtocols = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return protocols.filter((p) => {
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.diagnosis.toLowerCase().includes(q) ||
        p.subtitle.toLowerCase().includes(q) ||
        p.procedures.some((pr) => pr.toLowerCase().includes(q)) ||
        p.medicines.some((m) => m.name.toLowerCase().includes(q))
      );
    });
  }, [protocols, searchQuery, categoryFilter]);

  const contextualSuggestions = useMemo(
    () => getContextualSuggestionsForDiagnosis(draft.diagnosis),
    [draft.diagnosis]
  );

  // Helpers for array fields
  const toggleProcedure = (procName: string) => {
    setDraft((prev) => ({
      ...prev,
      procedures: prev.procedures.includes(procName)
        ? prev.procedures.filter((p) => p !== procName)
        : [...prev.procedures, procName],
    }));
  };

  const appendInvestigationChip = (test: string) => {
    setDraft((prev) => {
      const current = prev.investigations.trim();
      if (current.toLowerCase().includes(test.toLowerCase())) return prev;
      return {
        ...prev,
        investigations: current ? `${current}, ${test}` : test,
      };
    });
  };

  const addMedicine = (preset?: RxMedicineDraft) => {
    const item: RxMedicineDraft = preset
      ? { ...preset }
      : {
          name: '',
          genericName: '',
          form: 'Cream',
          dosage: 'PM (Night)',
          duration: '30 days',
          instructions: '',
          instructionsBn: '',
        };
    setDraft((prev) => ({ ...prev, medicines: [...prev.medicines, item] }));
  };

  const updateMedicine = (idx: number, field: keyof RxMedicineDraft, val: string) => {
    setDraft((prev) => ({
      ...prev,
      medicines: prev.medicines.map((m, i) => (i === idx ? { ...m, [field]: val } : m)),
    }));
  };

  const removeMedicine = (idx: number) => {
    setDraft((prev) => ({
      ...prev,
      medicines: prev.medicines.filter((_, i) => i !== idx),
    }));
  };

  const addListItem = (
    field: 'morningRoutine' | 'eveningRoutine' | 'recommendedFoods' | 'prohibitedFoods' | 'adviceList',
    val: string,
    clearFn: () => void
  ) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    setDraft((prev) => ({
      ...prev,
      [field]: prev[field].includes(trimmed) ? prev[field] : [...prev[field], trimmed],
    }));
    clearFn();
  };

  const updateListItem = (
    field: 'morningRoutine' | 'eveningRoutine' | 'recommendedFoods' | 'prohibitedFoods' | 'adviceList',
    idx: number,
    val: string
  ) => {
    setDraft((prev) => ({
      ...prev,
      [field]: prev[field].map((item, i) => (i === idx ? val : item)),
    }));
  };

  const removeListItem = (
    field: 'morningRoutine' | 'eveningRoutine' | 'recommendedFoods' | 'prohibitedFoods' | 'adviceList',
    idx: number
  ) => {
    setDraft((prev) => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== idx),
    }));
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Rx Protocols &amp; Care Templates
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Central clinical library for diagnoses, investigations, medicines, procedures, and Page 2 Food &amp; Skincare routines.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => navigate('/consultation/desk')}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>Consultation Desk</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          {canEdit && (
            <button
              type="button"
              onClick={handleStartNew}
              className="px-4 py-2 rounded-xl bg-[#0DA54F] hover:bg-[#0a8740] text-white text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-[0.98] shadow-xs cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Protocol</span>
            </button>
          )}
        </div>
      </div>

      {!canEdit && (
        <div className="px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            You are viewing Rx Protocols in read-only mode. Only Doctors or Super Admins can create or modify protocols.
          </span>
        </div>
      )}

      {/* 2-Column Master-Detail Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: Protocol Library */}
        <aside className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-[#0DA54F]" />
              <span className="text-xs font-bold text-slate-900">
                Clinic Protocols
              </span>
            </div>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {filteredProtocols.length} of {protocols.length}
            </span>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search protocol, diagnosis, or Rx..."
              className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-300 bg-slate-50/50 focus:bg-white focus:border-[#0DA54F] outline-none"
            />
          </div>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as 'all' | RxProtocolCategory)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 focus:border-[#0DA54F] outline-none"
          >
            <option value="all">All Categories</option>
            {PROTOCOL_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {/* List */}
          <div className="divide-y divide-slate-100 max-h-[680px] overflow-y-auto -mx-1 px-1">
            {isLoading ? (
              <div className="space-y-2 py-2">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : filteredProtocols.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <p className="text-xs font-semibold text-slate-700">No protocols match filter</p>
                <p className="text-[11px] text-slate-500">
                  Adjust search or create a new clinical protocol.
                </p>
              </div>
            ) : (
              filteredProtocols.map((proto) => {
                const isSelected = !isCreatingNew && selectedId === proto.id;
                return (
                  <div
                    key={proto.id}
                    className={`py-2.5 px-2.5 rounded-xl transition-colors cursor-pointer ${
                      isSelected ? 'bg-emerald-50/80' : 'hover:bg-slate-50'
                    }`}
                    onClick={() => handleSelectProtocol(proto)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p
                            className={`text-xs font-bold truncate ${
                              isSelected ? 'text-[#0DA54F]' : 'text-slate-900'
                            }`}
                          >
                            {proto.name}
                          </p>
                          {proto.isDefaultBaseline && (
                            <Star
                              className="w-3 h-3 text-amber-500 fill-amber-400 shrink-0"
                              aria-label="Baseline Care Template"
                            />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          {proto.category} · {proto.medicines.length} Rx · {proto.procedures.length} Proc
                        </p>
                        {!proto.isActive && (
                          <p className="text-[10.5px] font-semibold text-slate-400 mt-0.5">
                            Inactive in Consultation Desk
                          </p>
                        )}
                      </div>

                      {canEdit && (
                        <div
                          className="flex items-center gap-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => handleDuplicate(proto)}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                            title="Duplicate protocol"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(proto)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                            title="Delete protocol"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* RIGHT COLUMN: Protocol Builder Editor */}
        <form
          onSubmit={handleSave}
          className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-5 space-y-6"
        >
          {/* Editor Top Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {isCreatingNew ? 'Create New Rx Protocol' : draft.name || 'Edit Protocol'}
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Changes save centrally for all doctors in the Consultation Desk.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {!isCreatingNew && selectedId && (
                <button
                  type="button"
                  onClick={handleOpenInDesk}
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <span>Load in Desk</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#0DA54F]" />
                </button>
              )}

              {canEdit && (
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl bg-[#0DA54F] hover:bg-[#0a8740] disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSaving ? 'Saving...' : isCreatingNew ? 'Create Protocol' : 'Save Protocol'}</span>
                </button>
              )}
            </div>
          </div>

          {/* 1. Protocol Identity & Toggles */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-5">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Protocol Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Rosacea Calm & Barrier Care"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 focus:border-[#0DA54F] outline-none"
                />
              </div>

              <div className="md:col-span-4">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Category
                </label>
                <select
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({ ...draft, category: e.target.value as RxProtocolCategory })
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-[#0DA54F] outline-none"
                >
                  {PROTOCOL_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Follow-up (Days)
                </label>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={draft.followUpDays}
                  onChange={(e) =>
                    setDraft({ ...draft, followUpDays: parseInt(e.target.value, 10) || 0 })
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold tabular-nums focus:border-[#0DA54F] outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              <div className="md:col-span-7">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Short Summary / Subtitle
                </label>
                <input
                  type="text"
                  value={draft.subtitle}
                  onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
                  placeholder="e.g. Q-Switch Laser + Azelaic + Vit C + Strict SPF"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-800 focus:border-[#0DA54F] outline-none"
                />
              </div>

              <div className="md:col-span-5 flex flex-wrap items-center gap-4 pt-4">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.isActive}
                    onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                    className="accent-[#0DA54F] w-3.5 h-3.5"
                  />
                  <span>Active in Desk</span>
                </label>

                <label
                  className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer"
                  title="Sets Page 2 Food, Hydration & Skincare Routine defaults for fresh prescriptions"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(draft.isDefaultBaseline)}
                    onChange={(e) =>
                      setDraft({ ...draft, isDefaultBaseline: e.target.checked })
                    }
                    className="accent-amber-500 w-3.5 h-3.5"
                  />
                  <span>Default Baseline Care</span>
                </label>
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* 2. Clinical Assessment Defaults */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Clinical Assessment Defaults
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Default Chief Complaints
                </label>
                <textarea
                  rows={2}
                  value={draft.chiefComplaints}
                  onChange={(e) => setDraft({ ...draft, chiefComplaints: e.target.value })}
                  placeholder="Typical presenting complaints..."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-[#0DA54F] outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Default Skin Type
                </label>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {SKIN_TYPES.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setDraft({ ...draft, skinType: st.id })}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                        draft.skinType === st.id
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 mb-1.5">
                <FlaskConical className="w-3.5 h-3.5 text-[#0DA54F]" />
                <span>Default Investigation</span>
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {INVESTIGATION_CHIPS.map((test) => {
                  const active = draft.investigations.toLowerCase().includes(test.toLowerCase());
                  return (
                    <button
                      key={test}
                      type="button"
                      onClick={() => appendInvestigationChip(test)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border cursor-pointer ${
                        active
                          ? 'bg-emerald-50 text-[#0DA54F] border-emerald-300 font-semibold'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      + {test}
                    </button>
                  );
                })}
              </div>
              <textarea
                rows={2}
                value={draft.investigations}
                onChange={(e) => setDraft({ ...draft, investigations: e.target.value })}
                placeholder="Default lab / screening investigations..."
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-[#0DA54F] outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                Provisional Diagnosis
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {DIAGNOSIS_PRESETS.map((diag) => (
                  <button
                    key={diag}
                    type="button"
                    onClick={() => setDraft({ ...draft, diagnosis: diag })}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border cursor-pointer ${
                      draft.diagnosis === diag
                        ? 'bg-[#0DA54F] text-white border-[#0DA54F]'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {diag}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={draft.diagnosis}
                onChange={(e) => setDraft({ ...draft, diagnosis: e.target.value })}
                placeholder="Provisional diagnosis title..."
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 focus:border-[#0DA54F] outline-none"
              />
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* 3. In-Clinic Procedures */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Recommended In-Clinic Procedures
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {PROCEDURE_OPTIONS.map((proc) => {
                const selected = draft.procedures.includes(proc.name);
                return (
                  <button
                    key={proc.name}
                    type="button"
                    onClick={() => toggleProcedure(proc.name)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border flex items-center gap-1.5 cursor-pointer ${
                      selected
                        ? 'bg-[#0DA54F] text-white border-[#0DA54F] font-semibold'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {selected && <Check className="w-3 h-3" />}
                    <span>{proc.name}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 max-w-md">
              <input
                type="text"
                value={customProcedureInput}
                onChange={(e) => setCustomProcedureInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customProcedureInput.trim()) {
                    e.preventDefault();
                    toggleProcedure(customProcedureInput.trim());
                    setCustomProcedureInput('');
                  }
                }}
                placeholder="Add custom procedure..."
                className="flex-1 rounded-xl border border-slate-300 px-3 py-1.5 text-xs focus:border-[#0DA54F] outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (!customProcedureInput.trim()) return;
                  toggleProcedure(customProcedureInput.trim());
                  setCustomProcedureInput('');
                }}
                className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Add
              </button>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* 4. Rx Medications & Topical Skincare */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Pill className="w-3.5 h-3.5 text-[#0DA54F]" />
                <span>℞ Medications &amp; Topical Skincare ({draft.medicines.length})</span>
              </h3>
              <button
                type="button"
                onClick={() => addMedicine()}
                className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-[#0DA54F]" />
                <span>Add Rx Item</span>
              </button>
            </div>

            {/* Quick Regimen Suggestions */}
            <div className="flex flex-wrap gap-1.5">
              {contextualSuggestions.map((sug, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => addMedicine(sug)}
                  className="px-2.5 py-1 rounded-lg bg-emerald-50/70 hover:bg-emerald-100/70 border border-emerald-200 text-[11px] font-medium text-slate-800 cursor-pointer"
                >
                  + {sug.name} ({sug.form})
                </button>
              ))}
            </div>

            {draft.medicines.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">
                No Rx items added yet. Click “Add Rx Item” or pick a suggestion above.
              </p>
            ) : (
              <div className="space-y-3">
                {draft.medicines.map((med, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2 text-xs"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                      <div className="sm:col-span-5">
                        <input
                          type="text"
                          value={med.name}
                          onChange={(e) => updateMedicine(idx, 'name', e.target.value)}
                          placeholder="Product / Medicine Name"
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-900 outline-none focus:border-[#0DA54F]"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <input
                          type="text"
                          value={med.genericName || ''}
                          onChange={(e) => updateMedicine(idx, 'genericName', e.target.value)}
                          placeholder="Generic"
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 outline-none focus:border-[#0DA54F]"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <select
                          value={med.form}
                          onChange={(e) => updateMedicine(idx, 'form', e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-medium outline-none focus:border-[#0DA54F]"
                        >
                          {MEDICINE_FORMS.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => removeMedicine(idx)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                          title="Remove medicine"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <input
                        type="text"
                        value={med.dosage}
                        onChange={(e) => updateMedicine(idx, 'dosage', e.target.value)}
                        placeholder="Dosage (e.g. PM / 1+0+1)"
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 outline-none focus:border-[#0DA54F]"
                      />
                      <input
                        type="text"
                        value={med.duration}
                        onChange={(e) => updateMedicine(idx, 'duration', e.target.value)}
                        placeholder="Duration (e.g. 30 days)"
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 outline-none focus:border-[#0DA54F]"
                      />
                      <input
                        type="text"
                        value={med.instructions}
                        onChange={(e) => updateMedicine(idx, 'instructions', e.target.value)}
                        placeholder="Instructions (EN)"
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 outline-none focus:border-[#0DA54F]"
                      />
                      <input
                        type="text"
                        value={med.instructionsBn || ''}
                        onChange={(e) => updateMedicine(idx, 'instructionsBn', e.target.value)}
                        placeholder="নির্দেশনা (বাংলা)"
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-bengali outline-none focus:border-[#0DA54F]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <hr className="border-slate-100" />

          {/* 5. Advice (EN / BN) */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Clinical Advice (EN / BN)
            </h3>

            {draft.adviceList.length > 0 && (
              <div className="space-y-1.5">
                {draft.adviceList.map((adv, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={adv}
                      onChange={(e) => updateListItem('adviceList', idx, e.target.value)}
                      className="flex-1 rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-bengali focus:border-[#0DA54F] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => removeListItem('adviceList', idx)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={adviceInput}
                onChange={(e) => setAdviceInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addListItem('adviceList', adviceInput, () => setAdviceInput(''));
                  }
                }}
                placeholder="Type custom advice in English or বাংলা..."
                className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bengali focus:border-[#0DA54F] outline-none"
              />
              <button
                type="button"
                onClick={() => addListItem('adviceList', adviceInput, () => setAdviceInput(''))}
                className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Add
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {QUICK_ADVICE_CHIPS.map((chip, idx) => {
                const selected = draft.adviceList.includes(chip);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        adviceList: selected
                          ? prev.adviceList.filter((a) => a !== chip)
                          : [...prev.adviceList, chip],
                      }))
                    }
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bengali border text-left cursor-pointer ${
                      selected
                        ? 'bg-emerald-50 text-[#0DA54F] border-emerald-300 font-semibold'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    + {chip}
                  </button>
                );
              })}
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* 6. Page 2: Food, Hydration & Skincare Routine Editor */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Apple className="w-3.5 h-3.5 text-[#0DA54F]" />
                <span>Page 2 · Food, Hydration &amp; AM/PM Routine</span>
              </h3>
              <span className="text-[11px] text-slate-400">
                Printed &amp; shown in Live Preview Page 2
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-3">
                <label className="flex items-center gap-1 text-[11px] font-bold text-slate-700 mb-1">
                  <Droplet className="w-3.5 h-3.5 text-sky-500" />
                  <span>Water Target (L/day)</span>
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="8"
                  value={draft.waterLiters}
                  onChange={(e) =>
                    setDraft({ ...draft, waterLiters: parseFloat(e.target.value) || 2.5 })
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold tabular-nums focus:border-[#0DA54F] outline-none"
                />
              </div>
              <div className="md:col-span-9">
                <label className="flex items-center gap-1 text-[11px] font-bold text-slate-700 mb-1">
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                  <span>Sun &amp; Heat Care (EN)</span>
                </label>
                <input
                  type="text"
                  value={draft.sunInstructions}
                  onChange={(e) => setDraft({ ...draft, sunInstructions: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-[#0DA54F] outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Sun &amp; Heat Care (বাংলা নির্দেশনা)
              </label>
              <input
                type="text"
                value={draft.sunInstructionsBn}
                onChange={(e) => setDraft({ ...draft, sunInstructionsBn: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-bengali focus:border-[#0DA54F] outline-none"
              />
            </div>

            {/* AM / PM Routine Editors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* AM Routine */}
              <div className="p-3.5 rounded-xl border border-amber-200/80 bg-amber-50/30 space-y-2">
                <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AM Skincare Routine</span>
                </p>
                <div className="space-y-1.5">
                  {draft.morningRoutine.map((step, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={step}
                        onChange={(e) => updateListItem('morningRoutine', i, e.target.value)}
                        className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#0DA54F]"
                      />
                      <button
                        type="button"
                        onClick={() => removeListItem('morningRoutine', i)}
                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <input
                    type="text"
                    value={morningInput}
                    onChange={(e) => setMorningInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addListItem('morningRoutine', morningInput, () => setMorningInput(''));
                      }
                    }}
                    placeholder="Add AM step..."
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#0DA54F]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      addListItem('morningRoutine', morningInput, () => setMorningInput(''))
                    }
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* PM Routine */}
              <div className="p-3.5 rounded-xl border border-indigo-200/80 bg-indigo-50/30 space-y-2">
                <p className="text-xs font-bold text-indigo-900">PM Skincare Routine</p>
                <div className="space-y-1.5">
                  {draft.eveningRoutine.map((step, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={step}
                        onChange={(e) => updateListItem('eveningRoutine', i, e.target.value)}
                        className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#0DA54F]"
                      />
                      <button
                        type="button"
                        onClick={() => removeListItem('eveningRoutine', i)}
                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <input
                    type="text"
                    value={eveningInput}
                    onChange={(e) => setEveningInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addListItem('eveningRoutine', eveningInput, () => setEveningInput(''));
                      }
                    }}
                    placeholder="Add PM step..."
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#0DA54F]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      addListItem('eveningRoutine', eveningInput, () => setEveningInput(''))
                    }
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            {/* Recommended & Prohibited Foods */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Recommended Skin Foods */}
              <div className="p-3.5 rounded-xl border border-emerald-200/80 bg-emerald-50/30 space-y-2">
                <p className="text-xs font-bold text-emerald-900">Recommended Skin Foods</p>
                <div className="space-y-1.5">
                  {draft.recommendedFoods.map((food, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={food}
                        onChange={(e) => updateListItem('recommendedFoods', i, e.target.value)}
                        className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#0DA54F]"
                      />
                      <button
                        type="button"
                        onClick={() => removeListItem('recommendedFoods', i)}
                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <input
                    type="text"
                    value={recFoodInput}
                    onChange={(e) => setRecFoodInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addListItem('recommendedFoods', recFoodInput, () => setRecFoodInput(''));
                      }
                    }}
                    placeholder="Add recommended food..."
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#0DA54F]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      addListItem('recommendedFoods', recFoodInput, () => setRecFoodInput(''))
                    }
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Strictly Avoid Foods */}
              <div className="p-3.5 rounded-xl border border-rose-200/80 bg-rose-50/30 space-y-2">
                <p className="text-xs font-bold text-rose-900">Strictly Avoid</p>
                <div className="space-y-1.5">
                  {draft.prohibitedFoods.map((food, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={food}
                        onChange={(e) => updateListItem('prohibitedFoods', i, e.target.value)}
                        className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#0DA54F]"
                      />
                      <button
                        type="button"
                        onClick={() => removeListItem('prohibitedFoods', i)}
                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <input
                    type="text"
                    value={avoidFoodInput}
                    onChange={(e) => setAvoidFoodInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addListItem('prohibitedFoods', avoidFoodInput, () => setAvoidFoodInput(''));
                      }
                    }}
                    placeholder="Add food to avoid..."
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#0DA54F]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      addListItem('prohibitedFoods', avoidFoodInput, () => setAvoidFoodInput(''))
                    }
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
