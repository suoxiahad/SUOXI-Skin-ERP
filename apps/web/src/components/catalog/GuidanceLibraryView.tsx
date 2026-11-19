import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Apple,
  Sparkles,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Plus,
  Edit3,
  Send,
  ShieldCheck,
  ShieldAlert,
  Search,
  Filter,
  RefreshCw,
  Info,
  Calendar,
  User,
  ArrowRight,
  Trash2,
  AlertCircle,
  FileCheck,
  History,
  X,
  FileText,
} from 'lucide-react';
import { catalogApi } from '../../api/catalog.js';
import { useI18n } from '../../i18n/I18nContext.js';
import { useAuth } from '../../context/AuthContext.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import type {
  TreatmentServiceDto,
  FoodLifestyleGuidanceDto,
  FoodLifestyleGuidanceItemDto,
  GuidanceSection,
  GuidanceStatus,
  CreateGuidanceRequest,
  UpdateGuidanceRequest,
  CreateGuidanceItemInput,
} from '@suoxi/shared-types';

interface GuidanceLibraryViewProps {
  initialServiceId?: string;
}

const SECTION_CONFIG: Record<
  GuidanceSection,
  { labelEn: string; labelBn: string; color: string; badgeBg: string }
> = {
  recommended_foods: {
    labelEn: 'Recommended Foods',
    labelBn: 'সুপারিশকৃত খাদ্যতালিকা',
    color: 'text-emerald-700',
    badgeBg: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  },
  foods_to_avoid: {
    labelEn: 'Foods to Avoid',
    labelBn: 'বর্জনীয় খাদ্যতালিকা',
    color: 'text-rose-700',
    badgeBg: 'bg-rose-50 border-rose-200 text-rose-800',
  },
  lifestyle_do: {
    labelEn: 'Lifestyle: Do',
    labelBn: 'জীবনধারা: করণীয়',
    color: 'text-blue-700',
    badgeBg: 'bg-blue-50 border-blue-200 text-blue-800',
  },
  lifestyle_avoid: {
    labelEn: 'Lifestyle: Avoid',
    labelBn: 'জীবনধারা: বর্জনীয়',
    color: 'text-amber-700',
    badgeBg: 'bg-amber-50 border-amber-200 text-amber-800',
  },
  general_advice: {
    labelEn: 'General Advice',
    labelBn: 'সাধারণ পরামর্শ',
    color: 'text-purple-700',
    badgeBg: 'bg-purple-50 border-purple-200 text-purple-800',
  },
};

export const GuidanceLibraryView: React.FC<GuidanceLibraryViewProps> = ({ initialServiceId }) => {
  const { lang, t } = useI18n();
  const isBn = lang === 'bn';
  const { user } = useAuth();
  const { has } = usePermissions();

  const isClinical = user?.roles?.includes('doctor') || user?.roles?.includes('super_admin');
  const canApprove = (has('guidance.approve') || user?.roles?.includes('super_admin')) && isClinical;

  // Services state (left column)
  const [services, setServices] = useState<TreatmentServiceDto[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string>(initialServiceId || '');
  const [serviceSearch, setServiceSearch] = useState('');
  const [isLoadingServices, setIsLoadingServices] = useState(true);

  // Guidance state (right column)
  const [guidanceList, setGuidanceList] = useState<FoodLifestyleGuidanceDto[]>([]);
  const [selectedGuidanceId, setSelectedGuidanceId] = useState<string>('');
  const [isLoadingGuidance, setIsLoadingGuidance] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal / Drawer for authoring or editing draft
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
  const [editTitleEn, setEditTitleEn] = useState('');
  const [editTitleBn, setEditTitleBn] = useState('');
  const [editClinicalNotes, setEditClinicalNotes] = useState('');
  const [editItems, setEditItems] = useState<
    Array<{
      id?: string;
      section: GuidanceSection;
      content_en: string;
      content_bn: string;
      sort_order: number;
    }>
  >([]);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Approval confirmation modal
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  // Toast
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Load treatment services
  const loadServices = useCallback(async () => {
    try {
      setIsLoadingServices(true);
      const res = await catalogApi.listTreatments({ activeOnly: false });
      setServices(res);
      if (!selectedServiceId && res.length > 0) {
        setSelectedServiceId(initialServiceId || res[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load treatments list');
    } finally {
      setIsLoadingServices(false);
    }
  }, [initialServiceId, selectedServiceId]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  // Load guidance versions for selected service
  const loadGuidance = useCallback(async () => {
    if (!selectedServiceId) return;
    try {
      setIsLoadingGuidance(true);
      setError(null);
      const res = await catalogApi.listGuidance({ serviceId: selectedServiceId });
      setGuidanceList(res);

      // Select active approved version first, or highest version
      if (res.length > 0) {
        const approved = res.find((g: FoodLifestyleGuidanceDto) => g.status === 'approved');
        const defaultChoice = approved || res[0];
        setSelectedGuidanceId(defaultChoice.id);
      } else {
        setSelectedGuidanceId('');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load guidance documents');
    } finally {
      setIsLoadingGuidance(false);
    }
  }, [selectedServiceId]);

  useEffect(() => {
    loadGuidance();
  }, [loadGuidance]);

  const selectedService = useMemo(
    () => services.find((s) => s.id === selectedServiceId),
    [services, selectedServiceId]
  );

  const selectedGuidance = useMemo(
    () => guidanceList.find((g) => g.id === selectedGuidanceId),
    [guidanceList, selectedGuidanceId]
  );

  const filteredServices = useMemo(() => {
    if (!serviceSearch.trim()) return services;
    const q = serviceSearch.toLowerCase().trim();
    return services.filter(
      (s) =>
        s.service_code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.name_bn && s.name_bn.toLowerCase().includes(q))
    );
  }, [services, serviceSearch]);

  // Open editor for new draft
  const openNewDraftEditor = () => {
    if (!selectedService) return;
    setEditorMode('create');
    setEditTitleEn(`${selectedService.name} Post-Care Diet & Lifestyle`);
    setEditTitleBn(`${selectedService.name_bn || selectedService.name} পরবর্তী খাদ্য ও জীবনধারা`);
    setEditClinicalNotes('');

    // Prepopulate with templates or copy from existing version
    if (selectedGuidance) {
      setEditItems(
        selectedGuidance.items.map((it) => ({
          section: it.section,
          content_en: it.content_en || '',
          content_bn: it.content_bn || '',
          sort_order: it.sort_order,
        }))
      );
    } else {
      setEditItems([
        {
          section: 'recommended_foods',
          content_en: 'Drink 2 to 3 litres of room temperature water daily',
          content_bn: 'প্রতিদিন ২-৩ লিটার স্বাভাবিক তাপমাত্রার পানি পান করুন',
          sort_order: 1,
        },
        {
          section: 'foods_to_avoid',
          content_en: 'Spicy, fried, and excessively salty meals for 48 hours',
          content_bn: '৪৮ ঘণ্টা মসলাযুক্ত, ভাজাপোড়া ও অতিরিক্ত লবণাক্ত খাবার পরিহার করুন',
          sort_order: 2,
        },
        {
          section: 'lifestyle_do',
          content_en: 'Apply broad spectrum SPF 50+ sunscreen every 3 hours outdoors',
          content_bn: 'বাইরে থাকাকালীন প্রতি ৩ ঘণ্টা পর পর এসপিএফ ৫০+ সানস্ক্রিন লাগান',
          sort_order: 3,
        },
        {
          section: 'lifestyle_avoid',
          content_en: 'Direct sun exposure, sauna, hot showers, and strenuous gym workout for 3 days',
          content_bn: '৩ দিন সরাসরি রোদ, বাষ্প স্নান ও অতিরিক্ত শারীরিক ব্যায়াম এড়িয়ে চলুন',
          sort_order: 4,
        },
        {
          section: 'general_advice',
          content_en: 'Contact the clinic immediately if severe redness or irritation persists',
          content_bn: 'অতিরিক্ত লালচে ভাব বা জ্বালাপোড়া অব্যাহত থাকলে অবিলম্বে সেন্টারে যোগাযোগ করুন',
          sort_order: 5,
        },
      ]);
    }

    setEditorError(null);
    setIsEditorOpen(true);
  };

  // Open editor for existing draft
  const openEditDraftEditor = () => {
    if (!selectedGuidance) return;
    if (selectedGuidance.status === 'approved') {
      showToast('error', 'Approved guidance versions are immutable. Creating a new draft version instead.');
      openNewDraftEditor();
      return;
    }
    if (selectedGuidance.status === 'retired') {
      showToast('error', 'Retired guidance versions cannot be edited.');
      return;
    }

    setEditorMode('edit');
    setEditTitleEn(selectedGuidance.title);
    setEditTitleBn(selectedGuidance.title_bn || '');
    setEditClinicalNotes(selectedGuidance.clinical_notes || '');
    setEditItems(
      selectedGuidance.items.map((it) => ({
        id: it.id,
        section: it.section,
        content_en: it.content_en || '',
        content_bn: it.content_bn || '',
        sort_order: it.sort_order,
      }))
    );
    setEditorError(null);
    setIsEditorOpen(true);
  };

  const handleAddItem = (section: GuidanceSection) => {
    setEditItems((prev) => [
      ...prev,
      {
        section,
        content_en: '',
        content_bn: '',
        sort_order: prev.length + 1,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setEditItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateItem = (index: number, field: 'content_en' | 'content_bn' | 'section', val: string) => {
    setEditItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [field]: val } : item))
    );
  };

  const handleSaveEditor = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditorError(null);

    if (!editTitleEn.trim()) {
      setEditorError('Guidance title is required');
      return;
    }

    if (editItems.length === 0) {
      setEditorError('At least one guidance item is required across the sections');
      return;
    }

    // Validate that each item has at least one language
    for (let i = 0; i < editItems.length; i++) {
      const it = editItems[i];
      if (!it.content_en.trim() && !it.content_bn.trim()) {
        setEditorError(
          `Item #${i + 1} (${SECTION_CONFIG[it.section]?.labelEn}) must have at least English or Bangla text`
        );
        return;
      }
    }

    try {
      setIsSubmitting(true);
      if (editorMode === 'create') {
        const createData: CreateGuidanceRequest = {
          service_id: selectedServiceId,
          title: editTitleEn.trim(),
          title_bn: editTitleBn.trim() || undefined,
          clinical_notes: editClinicalNotes.trim() || undefined,
          items: editItems.map((it, idx) => ({
            section: it.section,
            content_en: it.content_en.trim() || undefined,
            content_bn: it.content_bn.trim() || undefined,
            sort_order: idx + 1,
          })),
        };
        const created = await catalogApi.createGuidance(createData);
        showToast('success', `Guidance v${created.version_number} saved as draft`);
        setIsEditorOpen(false);
        await loadGuidance();
        setSelectedGuidanceId(created.id);
      } else if (selectedGuidance) {
        const updateData: UpdateGuidanceRequest = {
          title: editTitleEn.trim(),
          title_bn: editTitleBn.trim() || undefined,
          clinical_notes: editClinicalNotes.trim() || undefined,
          items: editItems.map((it, idx) => ({
            id: it.id,
            section: it.section,
            content_en: it.content_en.trim() || undefined,
            content_bn: it.content_bn.trim() || undefined,
            sort_order: idx + 1,
          })),
        };
        const updated = await catalogApi.updateGuidance(selectedGuidance.id, updateData);
        showToast('success', `Guidance v${updated.version_number} draft updated`);
        setIsEditorOpen(false);
        await loadGuidance();
      }
    } catch (err: any) {
      setEditorError(err.message || 'Failed to save guidance');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitForApproval = async () => {
    if (!selectedGuidance) return;
    try {
      const res = await catalogApi.submitGuidance(selectedGuidance.id);
      showToast('success', `Guidance v${res.version_number} submitted for clinical approval`);
      await loadGuidance();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to submit guidance for approval');
    }
  };

  const handleApproveGuidance = async () => {
    if (!selectedGuidance) return;
    try {
      setIsApproving(true);
      const res = await catalogApi.approveGuidance(selectedGuidance.id);
      showToast(
        'success',
        `Guidance v${res.version_number} approved! Any previous approved version was atomically retired.`
      );
      setIsApproveModalOpen(false);
      await loadGuidance();
    } catch (err: any) {
      showToast('error', err.message || 'Approval failed');
    } finally {
      setIsApproving(false);
    }
  };

  // Group items of the currently viewed version into the 5 sections
  const groupedItems = useMemo(() => {
    const map: Record<GuidanceSection, FoodLifestyleGuidanceItemDto[]> = {
      recommended_foods: [],
      foods_to_avoid: [],
      lifestyle_do: [],
      lifestyle_avoid: [],
      general_advice: [],
    };
    if (selectedGuidance) {
      for (const item of selectedGuidance.items) {
        if (map[item.section]) {
          map[item.section].push(item);
        }
      }
    }
    return map;
  }, [selectedGuidance]);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg border flex items-center gap-2 text-sm font-medium animate-in fade-in slide-in-from-top-2 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Main Split Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Treatment Services Selector */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-[#0DA54F]/10 text-[#0DA54F] rounded-lg">
                <Apple className="w-4 h-4" />
              </span>
              <h2 className="text-sm font-bold text-slate-900">
                {isBn ? 'ট্রিটমেন্ট নির্বাচন' : 'Select Treatment'}
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-500 font-semibold">
              {services.length} services
            </span>
          </div>

          {/* Search Treatments */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={serviceSearch}
              onChange={(e) => setServiceSearch(e.target.value)}
              placeholder={isBn ? 'ট্রিটমেন্ট খুঁজুন...' : 'Search procedure...'}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
            />
          </div>

          {/* Treatment List */}
          <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1 scrollbar-thin">
            {isLoadingServices ? (
              <div className="p-6 text-center text-xs text-slate-400">Loading treatments...</div>
            ) : filteredServices.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">No matching services</div>
            ) : (
              filteredServices.map((s) => {
                const isSelected = s.id === selectedServiceId;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedServiceId(s.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50/70 border-[#0DA54F] shadow-2xs'
                        : 'bg-white border-slate-200 hover:bg-slate-50/80 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {s.service_code}
                      </span>
                      <span className="text-[11px] font-mono font-semibold text-slate-700">
                        ৳ {Number(s.base_price).toLocaleString('en-US')}
                      </span>
                    </div>

                    <div className="font-semibold text-xs text-slate-900 truncate">{s.name}</div>
                    {s.name_bn && (
                      <div className="text-[10px] text-slate-500 font-bengali truncate mt-0.5">
                        {s.name_bn}
                      </div>
                    )}

                    <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-100 text-[10px] text-slate-500">
                      <span>{s.category_name || s.category_code}</span>
                      <span>{s.default_followup_days ? `${s.default_followup_days}d follow-up` : 'No follow-up'}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Versions & Guidance Content */}
        <div className="lg:col-span-8 space-y-4">
          {/* Service Header Card */}
          {selectedService && (
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200">
                    {selectedService.service_code}
                  </span>
                  <h2 className="text-base font-bold text-slate-900">{selectedService.name}</h2>
                </div>
                {selectedService.name_bn && (
                  <p className="text-xs text-slate-500 font-bengali mt-0.5">{selectedService.name_bn}</p>
                )}
                <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                  <span>
                    Category:{' '}
                    <strong className="text-slate-800">{selectedService.category_name}</strong>
                  </span>
                  <span>
                    Follow-up interval:{' '}
                    <strong className="text-slate-800">{selectedService.default_followup_days || 14} days</strong>
                  </span>
                </div>
              </div>

              <button
                onClick={openNewDraftEditor}
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#0DA54F] hover:bg-[#0b8841] text-white rounded-lg text-xs font-semibold transition-all shadow-xs cursor-pointer whitespace-nowrap self-start sm:self-auto"
              >
                <Plus className="w-4 h-4" />
                <span>{isBn ? 'নতুন সংস্করণ খসড়া' : 'New Version Draft'}</span>
              </button>
            </div>
          )}

          {/* Versions Selector Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  {isBn ? 'নির্দেশিকা সংস্করণসমূহ' : 'Guidance Versions'} ({guidanceList.length})
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Rule: Only 1 approved version active per service
              </span>
            </div>

            {guidanceList.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                No guidance document created yet for this service.{' '}
                <button
                  onClick={openNewDraftEditor}
                  className="text-[#0DA54F] font-semibold underline hover:text-[#0b8841] ml-1"
                >
                  Create Version 1
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                {guidanceList.map((g) => {
                  const isSelected = g.id === selectedGuidanceId;
                  return (
                    <button
                      key={g.id}
                      onClick={() => setSelectedGuidanceId(g.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span className="font-bold">v{g.version_number}</span>

                      {/* Status Tag */}
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                          g.status === 'approved'
                            ? isSelected
                              ? 'bg-emerald-500 text-white'
                              : 'bg-emerald-100 text-emerald-800'
                            : g.status === 'pending_approval'
                            ? isSelected
                              ? 'bg-amber-400 text-slate-950'
                              : 'bg-amber-100 text-amber-800'
                            : g.status === 'retired'
                            ? isSelected
                              ? 'bg-slate-700 text-slate-300'
                              : 'bg-slate-200 text-slate-600 line-through'
                            : isSelected
                            ? 'bg-slate-700 text-slate-200'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {g.status.replace('_', ' ')}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected Guidance Detail Card */}
          {selectedGuidance ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              {/* Guidance Meta Header */}
              <div className="p-5 border-b border-slate-200 bg-slate-50/60">
                {/* SAMPLE ONLY Banner (A-08 Compliance) */}
                {selectedGuidance.is_sample && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-center gap-2 text-xs font-semibold text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>SAMPLE ONLY — real guidance must be clinician-approved (open decision A-08)</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900">
                        {selectedGuidance.title}
                      </h3>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                          selectedGuidance.status === 'approved'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : selectedGuidance.status === 'pending_approval'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : selectedGuidance.status === 'retired'
                            ? 'bg-slate-100 text-slate-600 border border-slate-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-300'
                        }`}
                      >
                        {selectedGuidance.status === 'approved' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                        {selectedGuidance.status === 'pending_approval' && <Clock className="w-3.5 h-3.5 text-amber-600" />}
                        {selectedGuidance.status === 'retired' && <XCircle className="w-3.5 h-3.5 text-slate-400" />}
                        <span>{selectedGuidance.status.replace('_', ' ')}</span>
                      </span>
                    </div>

                    {selectedGuidance.title_bn && (
                      <p className="text-xs text-slate-500 font-bengali mt-0.5">
                        {selectedGuidance.title_bn}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 mt-2 text-[11px] text-slate-500">
                      <span>Author: <strong className="text-slate-700">{selectedGuidance.author_name}</strong></span>
                      {selectedGuidance.approver_name && (
                        <span>
                          Approver: <strong className="text-slate-700">{selectedGuidance.approver_name}</strong>
                          {selectedGuidance.approved_at && (
                            <span className="text-slate-400 ml-1">
                              ({new Date(selectedGuidance.approved_at).toLocaleDateString()})
                            </span>
                          )}
                        </span>
                      )}
                      <span>Version: <strong className="font-mono text-slate-700">v{selectedGuidance.version_number}</strong></span>
                    </div>
                  </div>

                  {/* Actions Header Bar */}
                  <div className="flex items-center gap-2 whitespace-nowrap self-start sm:self-auto">
                    {/* Edit Draft */}
                    {selectedGuidance.status === 'draft' && (
                      <button
                        onClick={openEditDraftEditor}
                        className="px-3 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit Draft</span>
                      </button>
                    )}

                    {/* Submit for Approval */}
                    {selectedGuidance.status === 'draft' && (
                      <button
                        onClick={handleSubmitForApproval}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Submit for Approval</span>
                      </button>
                    )}

                    {/* Approve (guidance.approve permission + clinical role only) */}
                    {(selectedGuidance.status === 'draft' || selectedGuidance.status === 'pending_approval') && (
                      <button
                        onClick={() => setIsApproveModalOpen(true)}
                        disabled={!canApprove}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer ${
                          canApprove
                            ? 'bg-[#0DA54F] hover:bg-[#0b8841] text-white'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                        }`}
                        title={
                          canApprove
                            ? 'Approve this version (retires old approved version atomically)'
                            : 'Only clinicians (Doctor/Super Admin) with guidance.approve permission may approve'
                        }
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Approve Version</span>
                      </button>
                    )}

                    {/* If already approved, show immutable badge */}
                    {selectedGuidance.status === 'approved' && (
                      <button
                        onClick={openNewDraftEditor}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                        title="Approved versions are immutable. Create a new draft version to edit."
                      >
                        <Plus className="w-3.5 h-3.5 text-slate-500" />
                        <span>Branch New Draft</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Guidance Sections (5 Standardized Sections) */}
              <div className="p-6 space-y-6">
                {(Object.keys(SECTION_CONFIG) as GuidanceSection[]).map((sectionKey) => {
                  const conf = SECTION_CONFIG[sectionKey];
                  const items = groupedItems[sectionKey] || [];

                  return (
                    <div key={sectionKey} className="space-y-3">
                      <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold border uppercase tracking-wide ${conf.badgeBg}`}>
                            {conf.labelEn}
                          </span>
                          <span className="text-xs text-slate-500 font-bengali">
                            {conf.labelBn}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">
                          {items.length} item{items.length !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {items.length === 0 ? (
                        <p className="text-xs text-slate-400 italic pl-2">No instructions recorded for this section.</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                          {items.map((it, idx) => (
                            <div
                              key={it.id}
                              className="p-3 bg-slate-50/80 rounded-lg border border-slate-200 space-y-1 hover:border-slate-300 transition-colors"
                            >
                              <div className="flex items-start gap-2">
                                <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-mono font-bold shrink-0 mt-0.5">
                                  {idx + 1}
                                </span>
                                <div className="flex-1 space-y-1">
                                  {it.content_en && (
                                    <p className="text-xs font-medium text-slate-900 leading-relaxed">
                                      {it.content_en}
                                    </p>
                                  )}
                                  {it.content_bn && (
                                    <p className="text-xs text-slate-600 font-bengali leading-relaxed">
                                      {it.content_bn}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-xs">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">Select a guidance version</p>
              <p className="text-xs text-slate-400 mt-1">Pick a version from the tabs above or create a new draft.</p>
            </div>
          )}
        </div>
      </div>

      {/* Editor Drawer (Create or Edit Draft) */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => !isSubmitting && setIsEditorOpen(false)}
          />

          <div className="relative w-full max-w-2xl bg-white shadow-2xl z-10 flex flex-col h-full overflow-hidden border-l border-slate-200 animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-[#0DA54F]/10 text-[#0DA54F] rounded-lg">
                  <Apple className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editorMode === 'create'
                      ? 'Create New Guidance Draft Version'
                      : `Edit Draft v${selectedGuidance?.version_number}`}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Author dietary and post-care lifestyle instructions (bilingual English / বাংলা)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEditorOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveEditor} className="flex-1 overflow-y-auto p-6 space-y-5">
              {editorError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold text-rose-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{editorError}</span>
                </div>
              )}

              {/* Title En & Bn */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Guidance Sheet Title (English) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editTitleEn}
                    onChange={(e) => setEditTitleEn(e.target.value)}
                    placeholder="e.g. HydraFacial Post-Treatment Diet"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Guidance Sheet Title (বাংলা)
                  </label>
                  <input
                    type="text"
                    value={editTitleBn}
                    onChange={(e) => setEditTitleBn(e.target.value)}
                    placeholder="যেমন: হাইড্রাফেসিয়াল পরবর্তী খাদ্যতালিকা"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bengali focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                  />
                </div>
              </div>

              {/* Clinical Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Clinical Context & Physician Notes
                </label>
                <textarea
                  value={editClinicalNotes}
                  onChange={(e) => setEditClinicalNotes(e.target.value)}
                  placeholder="Optional internal remarks for consultation attach..."
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                />
              </div>

              {/* Items Across 5 Sections */}
              <div className="space-y-4 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Guidance Items ({editItems.length})
                  </label>
                  <span className="text-[11px] text-slate-500">
                    Rule: Each item requires at least English or Bangla text
                  </span>
                </div>

                <div className="space-y-3">
                  {editItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2 relative"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-mono font-bold">
                            {idx + 1}
                          </span>
                          <select
                            value={item.section}
                            onChange={(e) =>
                              handleUpdateItem(idx, 'section', e.target.value as GuidanceSection)
                            }
                            className="px-2 py-1 bg-white border border-slate-200 rounded text-xs font-semibold text-slate-800"
                          >
                            {(Object.keys(SECTION_CONFIG) as GuidanceSection[]).map((sec) => (
                              <option key={sec} value={sec}>
                                {SECTION_CONFIG[sec].labelEn}
                              </option>
                            ))}
                          </select>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                          title="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <input
                            type="text"
                            value={item.content_en}
                            onChange={(e) => handleUpdateItem(idx, 'content_en', e.target.value)}
                            placeholder="Instruction in English..."
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs focus:ring-1 focus:ring-[#0DA54F]"
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            value={item.content_bn}
                            onChange={(e) => handleUpdateItem(idx, 'content_bn', e.target.value)}
                            placeholder="বাংলায় নির্দেশনা..."
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs font-bengali focus:ring-1 focus:ring-[#0DA54F]"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Quick Add Buttons for Sections */}
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  {(Object.keys(SECTION_CONFIG) as GuidanceSection[]).map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => handleAddItem(sec)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded text-[11px] font-medium text-slate-700 flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>+ {SECTION_CONFIG[sec].labelEn}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Drawer Actions */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-[#0DA54F] hover:bg-[#0b8841] text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editorMode === 'create' ? 'Save as Draft' : 'Update Draft'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Approve Guidance Confirmation Modal */}
      {isApproveModalOpen && selectedGuidance && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => !isApproving && setIsApproveModalOpen(false)}
          />

          <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl p-6 border border-slate-200 z-10 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <span className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                <ShieldCheck className="w-6 h-6" />
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-900">Approve Guidance Version</h3>
                <p className="text-xs text-slate-500 font-mono">
                  {selectedService?.name} — v{selectedGuidance.version_number}
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1">
              <p className="font-bold">Clinical Approval Governance Rule:</p>
              <p>
                In accordance with K1 clinical standards, approving version{' '}
                <strong>v{selectedGuidance.version_number}</strong> will{' '}
                <strong>atomically retire</strong> any previously approved guidance version for this
                procedure in a single transaction.
              </p>
              <p className="pt-1 text-slate-600">
                Once approved, this version will become immutable and can be attached to official patient
                prescriptions.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsApproveModalOpen(false)}
                disabled={isApproving}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApproveGuidance}
                disabled={isApproving}
                className="px-4 py-2 bg-[#0DA54F] hover:bg-[#0b8841] text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isApproving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm & Approve</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
