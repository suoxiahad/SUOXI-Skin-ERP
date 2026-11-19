import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Sparkles,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  AlertCircle,
  Filter,
  Edit2,
  BookOpen,
  Apple,
  RefreshCw,
  X,
  Building2,
  ShieldAlert,
  ChevronRight,
  ChevronLeft,
  FolderPlus,
  Layers,
  Tag,
  Trash2,
  Check,
} from 'lucide-react';
import { catalogApi } from '../../api/catalog.js';
import { useI18n } from '../../i18n/I18nContext.js';
import { useAuth } from '../../context/AuthContext.js';
import type {
  TreatmentCategoryDto,
  TreatmentServiceDto,
  TreatmentFollowupRuleDto,
  CreateTreatmentServiceRequest,
  UpdateTreatmentServiceRequest,
} from '@suoxi/shared-types';

interface TreatmentsListViewProps {
  onNavigateToGuidance?: (serviceId: string) => void;
  isAddTreatmentOpen?: boolean;
  onCloseAddTreatment?: () => void;
  isAddCategoryOpen?: boolean;
  onCloseAddCategory?: () => void;
}

export const TreatmentsListView: React.FC<TreatmentsListViewProps> = ({
  onNavigateToGuidance,
  isAddTreatmentOpen,
  onCloseAddTreatment,
  isAddCategoryOpen,
  onCloseAddCategory,
}) => {
  const { lang, t } = useI18n();
  const isBn = lang === 'bn';
  const { user } = useAuth();

  const [categories, setCategories] = useState<TreatmentCategoryDto[]>([]);
  const [treatments, setTreatments] = useState<TreatmentServiceDto[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drawer states
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingTreatment, setEditingTreatment] = useState<TreatmentServiceDto | null>(null);

  // Category modal states
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [catNameEn, setCatNameEn] = useState('');
  const [catNameBn, setCatNameBn] = useState('');
  const [catCode, setCatCode] = useState('');
  const [catDescription, setCatDescription] = useState('');
  const [catSubmitting, setCatSubmitting] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);

  // Follow-up rules drawer state
  const [rulesDrawerService, setRulesDrawerService] = useState<TreatmentServiceDto | null>(null);
  const [rulesList, setRulesList] = useState<TreatmentFollowupRuleDto[]>([]);
  const [isLoadingRules, setIsLoadingRules] = useState(false);
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [newRuleInterval, setNewRuleInterval] = useState(14);
  const [newRuleMaxFollowups, setNewRuleMaxFollowups] = useState(1);
  const [newRuleInstructionsEn, setNewRuleInstructionsEn] = useState('');
  const [newRuleInstructionsBn, setNewRuleInstructionsBn] = useState('');
  const [newRuleClinicalApproval, setNewRuleClinicalApproval] = useState(true);

  // Form states for Add/Edit
  const [formCode, setFormCode] = useState('');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formNameEn, setFormNameEn] = useState('');
  const [formNameBn, setFormNameBn] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPrice, setFormPrice] = useState('4500');
  const [formDuration, setFormDuration] = useState(60);
  const [formFollowupDays, setFormFollowupDays] = useState(14);
  const [formRequiresClinical, setFormRequiresClinical] = useState(false);
  const [formAllowedResources, setFormAllowedResources] = useState<string[]>(['res-room-1']);
  const [formIsActive, setFormIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Toast
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [catsRes, srvsRes] = await Promise.all([
        catalogApi.getCategories(),
        catalogApi.listTreatments({
          categoryId: selectedCategory !== 'all' ? selectedCategory : undefined,
          activeOnly,
          search: searchQuery.trim() || undefined,
        }),
      ]);
      setCategories(catsRes);
      setTreatments(srvsRes);
    } catch (err: any) {
      setError(err.message || 'Failed to load treatment catalog');
    } finally {
      setIsLoading(false);
    }
  }, [selectedCategory, activeOnly, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sync external props triggers
  useEffect(() => {
    if (isAddTreatmentOpen) {
      openAddDrawer();
    } else {
      setIsDrawerOpen(false);
    }
  }, [isAddTreatmentOpen]);

  useEffect(() => {
    if (isAddCategoryOpen) {
      openAddCategoryModal();
    } else {
      setIsCategoryModalOpen(false);
    }
  }, [isAddCategoryOpen]);

  const openAddCategoryModal = () => {
    setCatNameEn('');
    setCatNameBn('');
    setCatCode('');
    setCatDescription('');
    setCatError(null);
    setIsCategoryModalOpen(true);
  };

  const closeCategoryModal = () => {
    setIsCategoryModalOpen(false);
    onCloseAddCategory?.();
  };

  const closeTreatmentDrawer = () => {
    setIsDrawerOpen(false);
    onCloseAddTreatment?.();
  };

  const openAddDrawer = () => {
    setEditingTreatment(null);
    setFormCode('');
    setFormCategoryId(categories[0]?.id || 'cat-facial');
    setFormNameEn('');
    setFormNameBn('');
    setFormDescription('');
    setFormPrice('4500');
    setFormDuration(60);
    setFormFollowupDays(14);
    setFormRequiresClinical(false);
    setFormAllowedResources(['res-room-1']);
    setFormIsActive(true);
    setFormError(null);
    setIsDrawerOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCatError(null);

    if (!catNameEn.trim()) {
      setCatError('Category name (English) is required');
      return;
    }

    try {
      setCatSubmitting(true);
      const newCat = await catalogApi.createCategory({
        name: catNameEn.trim(),
        name_bn: catNameBn.trim() || undefined,
        code: catCode.trim() || undefined,
        description: catDescription.trim() || undefined,
      });

      setCategories((prev) => {
        if (prev.some((c) => c.id === newCat.id)) return prev;
        return [...prev, newCat];
      });

      setSelectedCategory(newCat.code);
      showToast('success', `Category "${newCat.name}" created successfully`);
      closeCategoryModal();
    } catch (err: any) {
      setCatError(err.message || 'Failed to create category');
    } finally {
      setCatSubmitting(false);
    }
  };

  const openEditDrawer = (t: TreatmentServiceDto) => {
    setEditingTreatment(t);
    setFormCode(t.service_code);
    setFormCategoryId(t.category_id);
    setFormNameEn(t.name);
    setFormNameBn(t.name_bn || '');
    setFormDescription(t.description || '');
    setFormPrice(t.base_price);
    setFormDuration(t.default_duration_minutes);
    setFormFollowupDays(t.default_followup_days ?? 14);
    setFormRequiresClinical(t.requires_clinical_approval);
    setFormAllowedResources(t.allowed_resource_ids || []);
    setFormIsActive(t.is_active);
    setFormError(null);
    setIsDrawerOpen(true);
  };

  const handleSaveTreatment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formCode.trim()) {
      setFormError('Service code is required');
      return;
    }
    if (!formNameEn.trim()) {
      setFormError('Treatment name is required');
      return;
    }
    const priceNum = Number(formPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      setFormError('Price must be a valid positive amount');
      return;
    }

    try {
      setIsSubmitting(true);
      if (editingTreatment) {
        const updateData: UpdateTreatmentServiceRequest = {
          service_code: formCode.trim().toUpperCase(),
          category_id: formCategoryId,
          name: formNameEn.trim(),
          name_bn: formNameBn.trim() || undefined,
          description: formDescription.trim() || undefined,
          base_price: formPrice,
          default_duration_minutes: formDuration,
          default_followup_days: formFollowupDays,
          requires_clinical_approval: formRequiresClinical,
          allowed_resource_ids: formAllowedResources,
          is_active: formIsActive,
        };
        await catalogApi.updateTreatment(editingTreatment.id, updateData);
        showToast('success', `Treatment "${formNameEn}" updated successfully`);
      } else {
        const createData: CreateTreatmentServiceRequest = {
          service_code: formCode.trim().toUpperCase(),
          category_id: formCategoryId,
          name: formNameEn.trim(),
          name_bn: formNameBn.trim() || undefined,
          description: formDescription.trim() || undefined,
          base_price: formPrice,
          default_duration_minutes: formDuration,
          default_followup_days: formFollowupDays,
          requires_clinical_approval: formRequiresClinical,
          allowed_resource_ids: formAllowedResources,
          is_active: formIsActive,
        };
        await catalogApi.createTreatment(createData);
        showToast('success', `Treatment "${formNameEn}" created successfully`);
      }
      closeTreatmentDrawer();
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save treatment service');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openFollowupRules = async (t: TreatmentServiceDto) => {
    setRulesDrawerService(t);
    setIsAddingRule(false);
    setNewRuleInterval(t.default_followup_days || 14);
    setNewRuleMaxFollowups(1);
    setNewRuleInstructionsEn('');
    setNewRuleInstructionsBn('');
    setNewRuleClinicalApproval(true);
    try {
      setIsLoadingRules(true);
      const res = await catalogApi.getFollowupRules(t.id);
      setRulesList(res);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to load follow-up rules');
    } finally {
      setIsLoadingRules(false);
    }
  };

  const handleSaveFollowupRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rulesDrawerService) return;
    try {
      await catalogApi.createFollowupRule(rulesDrawerService.id, {
        interval_days: newRuleInterval,
        max_followups: newRuleMaxFollowups,
        instructions: newRuleInstructionsEn.trim() || undefined,
        instructions_bn: newRuleInstructionsBn.trim() || undefined,
        needs_clinical_approval: newRuleClinicalApproval,
      });
      showToast('success', 'Follow-up rule saved successfully');
      setIsAddingRule(false);
      // Reload rules
      const res = await catalogApi.getFollowupRules(rulesDrawerService.id);
      setRulesList(res);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to save follow-up rule');
    }
  };

  const toggleResource = (resId: string) => {
    setFormAllowedResources((prev) =>
      prev.includes(resId) ? prev.filter((r) => r !== resId) : [...prev, resId]
    );
  };

  const standardResourceOptions = [
    { id: 'res-room-1', name: 'Room 1 (Facial Suite)', type: 'room' },
    { id: 'res-room-2', name: 'Room 2 (Consultation & PRP)', type: 'room' },
    { id: 'res-room-laser', name: 'Laser Suite (Q-Switch / Carbon)', type: 'room' },
    { id: 'res-dev-hydra', name: 'HydraFacial MD Elite Device', type: 'device' },
    { id: 'res-dev-laser', name: 'Nd:YAG Laser Device', type: 'device' },
  ];

  // =========================================================================
  // 1. STANDALONE SINGLE PAGE: ADD / EDIT TREATMENT SERVICE
  // =========================================================================
  if (isDrawerOpen) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto pb-12 animate-in fade-in duration-150">
        {/* Navigation Breadcrumb & Back button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <button
              type="button"
              onClick={closeTreatmentDrawer}
              className="hover:text-emerald-700 font-medium flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>{isBn ? 'ট্রিটমেন্ট তালিকা' : 'Treatment List'}</span>
            </button>
            <span>/</span>
            <span className="font-bold text-slate-800">
              {editingTreatment
                ? isBn ? 'ট্রিটমেন্ট সম্পাদনা' : 'Edit Treatment'
                : isBn ? 'নতুন ট্রিটমেন্ট তৈরি' : 'Add New Treatment'}
            </span>
          </div>

          <button
            type="button"
            onClick={closeTreatmentDrawer}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-white bg-slate-50 transition-colors cursor-pointer shadow-2xs"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>{isBn ? 'তালিকায় ফিরে যান' : 'Back to Treatment List'}</span>
          </button>
        </div>

        {/* Page Hero Header */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0DA54F] to-[#0a8740] flex items-center justify-center text-white shadow-xs shrink-0">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                {editingTreatment
                  ? isBn ? 'ট্রিটমেন্ট সম্পাদনা' : 'Edit Treatment Service'
                  : isBn ? 'নতুন ট্রিটমেন্ট তৈরি করুন' : 'Create New Treatment Service'}
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                {editingTreatment
                  ? `Editing procedure code: ${editingTreatment.service_code}`
                  : (isBn
                    ? 'ক্লিনিক্যাল সেবা, প্রমিত রেট চার্ট, সেশন সময়কাল ও রুম নির্ধারণ করুন'
                    : 'Configure clinical protocols, procedure details, pricing, and required room/devices')}
              </p>
            </div>
          </div>
        </div>

        {/* Form Error Toast */}
        {formError && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* Form Container */}
        <form onSubmit={handleSaveTreatment} className="space-y-6">
          {/* Card 1: Basic Information */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Tag className="w-4 h-4 text-[#0DA54F]" />
              <span>{isBn ? 'প্রাথমিক তথ্য ও শ্রেণীবিন্যাস' : 'Basic Procedure & Classification'}</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Service Code <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                  placeholder="e.g. HF-001, CO2-002"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Service Category <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formCategoryId}
                  onChange={(e) => setFormCategoryId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                  required
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.name_bn ? `(${c.name_bn})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Treatment Name (English) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formNameEn}
                  onChange={(e) => setFormNameEn(e.target.value)}
                  placeholder="e.g. Fractional CO2 Laser Resurfacing"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Treatment Name (বাংলা) <span className="text-slate-400 font-normal">(ঐচ্ছিক)</span>
                </label>
                <input
                  type="text"
                  value={formNameBn}
                  onChange={(e) => setFormNameBn(e.target.value)}
                  placeholder="যেমনঃ ফ্র্যাকশনাল সিও২ লেজার রিসারফেসিং"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bengali focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Clinical Description & Indications
              </label>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Clinical indications, procedure overview, and therapeutic goals..."
                rows={3}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F] resize-none"
              />
            </div>
          </div>

          {/* Card 2: Pricing & Session Parameters */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Clock className="w-4 h-4 text-[#0DA54F]" />
              <span>{isBn ? 'মূল্য ও সেশন সময়কাল' : 'Pricing & Clinical Parameters'}</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Base Price (BDT ৳) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                  min="0"
                  step="100"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Default Duration (Minutes) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  value={formDuration}
                  onChange={(e) => setFormDuration(parseInt(e.target.value, 10) || 30)}
                  min="5"
                  max="480"
                  step="5"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Follow-up Interval (Days)
                </label>
                <input
                  type="number"
                  value={formFollowupDays}
                  onChange={(e) => setFormFollowupDays(parseInt(e.target.value, 10) || 0)}
                  min="0"
                  max="365"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <label className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/70 transition-colors">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">Requires Clinical Approval</span>
                  <p className="text-[11px] text-slate-500">Mandates doctor sign-off before booking</p>
                </div>
                <input
                  type="checkbox"
                  checked={formRequiresClinical}
                  onChange={(e) => setFormRequiresClinical(e.target.checked)}
                  className="rounded border-slate-300 text-[#0DA54F] focus:ring-[#0DA54F] w-4 h-4 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/70 transition-colors">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">Active Service</span>
                  <p className="text-[11px] text-slate-500">Visible in booking calendar and service list</p>
                </div>
                <input
                  type="checkbox"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="rounded border-slate-300 text-[#0DA54F] focus:ring-[#0DA54F] w-4 h-4 cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* Card 3: Room & Device Allocations */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Building2 className="w-4 h-4 text-[#0DA54F]" />
              <span>{isBn ? 'রিসোর্স ও রুম বরাদ্দ' : 'Resource Allocation & Facility Constraints'}</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {standardResourceOptions.map((res) => {
                const isSelected = formAllowedResources.includes(res.id);
                return (
                  <label
                    key={res.id}
                    className={`flex items-center justify-between p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 font-semibold shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleResource(res.id)}
                        className="rounded border-slate-300 text-[#0DA54F] focus:ring-[#0DA54F] w-4 h-4"
                      />
                      <span>{res.name}</span>
                    </div>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-white text-slate-600 border border-slate-200">
                      {res.type}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={closeTreatmentDrawer}
              disabled={isSubmitting}
              className="px-5 py-2.5 border border-slate-200 hover:bg-white bg-slate-50 rounded-xl text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
            >
              {isBn ? 'বাতিল' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-[#0DA54F] hover:bg-[#0b8841] text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-60 transition-all"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{isBn ? 'সংরক্ষণ হচ্ছে...' : 'Saving...'}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{editingTreatment ? (isBn ? 'পরিবর্তন সংরক্ষণ করুন' : 'Save Changes') : (isBn ? 'ট্রিটমেন্ট সংরক্ষণ করুন' : 'Create Treatment')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // =========================================================================
  // 2. STANDALONE SINGLE PAGE: TREATMENT CATEGORIES MANAGEMENT
  // =========================================================================
  if (isCategoryModalOpen) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto pb-12 animate-in fade-in duration-150">
        {/* Navigation Breadcrumb & Back button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <button
              type="button"
              onClick={closeCategoryModal}
              className="hover:text-emerald-700 font-medium flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>{isBn ? 'ট্রিটমেন্ট তালিকা' : 'Treatment List'}</span>
            </button>
            <span>/</span>
            <span className="font-bold text-slate-800">
              {isBn ? 'ক্যাটাগরি ম্যানেজমেন্ট' : 'Category Management'}
            </span>
          </div>

          <button
            type="button"
            onClick={closeCategoryModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-white bg-slate-50 transition-colors cursor-pointer shadow-2xs"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>{isBn ? 'তালিকায় ফিরে যান' : 'Back to Treatment List'}</span>
          </button>
        </div>

        {/* Page Hero Header */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0DA54F] to-[#0a8740] flex items-center justify-center text-white shadow-xs shrink-0">
              <FolderPlus className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                {isBn ? 'ট্রিটমেন্ট ক্যাটাগরি ও বিভাগ' : 'Treatment Categories & Departments'}
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                {isBn
                  ? 'ক্লিনিকাল সেবাসমূহকে বিভিন্ন বিভাগে শ্রেণীবদ্ধ ও পরিচালনা করুন'
                  : 'Manage aesthetic procedure departments, clinical groups, and service categorization'}
              </p>
            </div>
          </div>
        </div>

        {/* Two-column layout: Add Form (left) + Existing Categories (right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Form */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs h-fit space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Plus className="w-4 h-4 text-[#0DA54F]" />
              <span>{isBn ? 'নতুন ক্যাটাগরি তৈরি করুন' : 'Add New Category'}</span>
            </h2>

            {catError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{catError}</span>
              </div>
            )}

            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Category Name (English) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={catNameEn}
                  onChange={(e) => {
                    setCatNameEn(e.target.value);
                    if (!catCode || catCode === catNameEn.toLowerCase().replace(/[^a-z0-9]+/g, '_')) {
                      setCatCode(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_'));
                    }
                  }}
                  placeholder="e.g. Body Contouring & Slimming"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Category Name (বাংলা) <span className="text-slate-400 font-normal">(ঐচ্ছিক)</span>
                </label>
                <input
                  type="text"
                  value={catNameBn}
                  onChange={(e) => setCatNameBn(e.target.value)}
                  placeholder="যেমনঃ বডি কনট্যুরিং ও স্লিমমিং"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bengali text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Category Code / Identifier
                </label>
                <input
                  type="text"
                  value={catCode}
                  onChange={(e) => setCatCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="e.g. body_contouring"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description <span className="text-slate-400 font-normal">(ঐচ্ছিক)</span>
                </label>
                <textarea
                  rows={3}
                  value={catDescription}
                  onChange={(e) => setCatDescription(e.target.value)}
                  placeholder="Clinical procedures, body shaping, skin tightening..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F] resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={closeCategoryModal}
                  disabled={catSubmitting}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  {isBn ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={catSubmitting}
                  className="px-5 py-2 bg-[#0DA54F] hover:bg-[#0b8841] text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {catSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{isBn ? 'সংরক্ষণ হচ্ছে...' : 'Saving...'}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{isBn ? 'ক্যাটাগরি সংরক্ষণ করুন' : 'Save Category'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: Existing Categories List */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#0DA54F]" />
                <span>{isBn ? 'বর্তমান ক্যাটাগরিসমূহ' : 'Existing Categories'} ({categories.length})</span>
              </h2>
              <span className="text-[11px] text-slate-500 font-mono">
                {categories.length} total departments
              </span>
            </div>

            <div className="space-y-2.5">
              {categories.map((c) => {
                const count = treatments.filter((t) => t.category_id === c.id).length;
                return (
                  <div
                    key={c.id}
                    className="p-3.5 bg-slate-50 hover:bg-emerald-50/40 rounded-xl border border-slate-200 transition-colors flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">{c.name}</span>
                        {c.name_bn && (
                          <span className="text-[11px] text-slate-500 font-bengali">
                            ({c.name_bn})
                          </span>
                        )}
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white text-slate-600 border border-slate-200">
                          {c.code || c.id}
                        </span>
                      </div>
                      {c.description && (
                        <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{c.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-1 rounded-md text-[11px] font-semibold bg-emerald-100/70 text-emerald-800">
                        {count} {isBn ? 'সেবা' : 'services'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 3. STANDALONE SINGLE PAGE: FOLLOW-UP PROTOCOL RULES
  // =========================================================================
  if (rulesDrawerService) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto pb-12 animate-in fade-in duration-150">
        {/* Navigation Breadcrumb & Back button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <button
              type="button"
              onClick={() => setRulesDrawerService(null)}
              className="hover:text-emerald-700 font-medium flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>{isBn ? 'ট্রিটমেন্ট তালিকা' : 'Treatment List'}</span>
            </button>
            <span>/</span>
            <span className="font-bold text-slate-800">
              {rulesDrawerService.name} — Follow-up Protocol Rules
            </span>
          </div>

          <button
            type="button"
            onClick={() => setRulesDrawerService(null)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-white bg-slate-50 transition-colors cursor-pointer shadow-2xs"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>{isBn ? 'তালিকায় ফিরে যান' : 'Back to Treatment List'}</span>
          </button>
        </div>

        {/* Page Hero Header */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-xs shrink-0">
              <Clock className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                {isBn ? 'ফলো-আপ প্রোটোকল ও রুলস' : 'Follow-up Protocol & Recall Rules'}
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Service: <span className="font-semibold text-slate-700">{rulesDrawerService.service_code} — {rulesDrawerService.name}</span>
              </p>
            </div>
          </div>

          {onNavigateToGuidance && (
            <button
              type="button"
              onClick={() => {
                const sid = rulesDrawerService.id;
                setRulesDrawerService(null);
                onNavigateToGuidance(sid);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-semibold transition-colors cursor-pointer border border-emerald-200"
            >
              <Apple className="w-4 h-4 text-[#0DA54F]" />
              <span>Open Food & Lifestyle Guidance</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Rules Content */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-5">
          <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900">
            <strong>Default interval for {rulesDrawerService.name}: </strong>
            <span>{rulesDrawerService.default_followup_days || 14} days</span>. Automatic follow-up tasks are scheduled based on these rules.
          </div>

          {/* Existing Rules List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Configured Rules</h3>
              {!isAddingRule && (
                <button
                  type="button"
                  onClick={() => setIsAddingRule(true)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#0DA54F] hover:text-[#0b8841] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add New Rule</span>
                </button>
              )}
            </div>

            {isLoadingRules ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading rules...</div>
            ) : rulesList.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <p className="text-xs text-slate-500">No custom follow-up rules configured yet.</p>
                <button
                  type="button"
                  onClick={() => setIsAddingRule(true)}
                  className="mt-2 text-xs font-semibold text-[#0DA54F] hover:underline cursor-pointer"
                >
                  Configure first rule
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {rulesList.map((r) => (
                  <div key={r.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">Interval: {r.interval_days} days</span>
                        <span className="text-slate-400">•</span>
                        <span className="text-slate-600">Max Follow-ups: {r.max_followups}</span>
                        {r.needs_clinical_approval && (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-amber-100 text-amber-900 font-semibold">
                            Clinical Approval Required
                          </span>
                        )}
                      </div>
                      {(r.instructions || r.instructions_bn) && (
                        <p className="text-slate-600 mt-1">{r.instructions || r.instructions_bn}</p>
                      )}
                    </div>
                    <span className="px-2 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-semibold rounded-md border border-emerald-200">
                      Active Protocol
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Rule Form */}
          {isAddingRule && (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
              <h4 className="text-xs font-bold text-slate-900">Configure New Rule</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Interval (Days)</label>
                  <input
                    type="number"
                    value={newRuleInterval}
                    onChange={(e) => setNewRuleInterval(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Max Follow-ups</label>
                  <input
                    type="number"
                    value={newRuleMaxFollowups}
                    onChange={(e) => setNewRuleMaxFollowups(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs"
                    min="1"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Instructions (English / বাংলা)</label>
                <input
                  type="text"
                  value={newRuleInstructionsEn}
                  onChange={(e) => setNewRuleInstructionsEn(e.target.value)}
                  placeholder="e.g. Inquire about erythema resolution and sunscreen adherence..."
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newRuleClinicalApproval}
                  onChange={(e) => setNewRuleClinicalApproval(e.target.checked)}
                  className="rounded border-slate-300 text-[#0DA54F] focus:ring-[#0DA54F]"
                />
                <span>Requires Clinical Approval</span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingRule(false)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={(e) => handleSaveFollowupRule(e)}
                  className="px-4 py-1.5 bg-[#0DA54F] hover:bg-[#0b8841] text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Save Rule
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // MAIN VIEW: TREATMENT CATALOG LIST TABLE
  // =========================================================================
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

      {/* Header & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-[#0DA54F]/10 text-[#0DA54F] rounded-lg">
              <Sparkles className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-900">
              {isBn ? 'ট্রিটমেন্ট লিস্ট ও ক্লিনিক্যাল সার্ভিস' : 'Treatment List & Clinical Services'}
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {isBn
              ? 'ক্লিনিকাল সেবা, প্রমিত মূল্যতালিকা, ডিফল্ট ফলো-আপ ও রিসোর্স কনফিগারেশন'
              : 'Master directory of clinical aesthetic procedures, BDT pricing, follow-up intervals, and room/device requirements.'}
          </p>
        </div>
      </div>

      {/* Category Chips & Filter Controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-4">
        {/* Category Chips: Facial, Laser, Hair, Peel, Acne care, Body, Consultation */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-[#0DA54F] text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {isBn ? 'সকল বিভাগ' : 'All Categories'}
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.code)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === cat.code
                  ? 'bg-[#0DA54F] text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {isBn && cat.name_bn ? cat.name_bn : cat.name}
            </button>
          ))}
        </div>

        {/* Search & Active Toggles */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isBn ? 'কোড বা নাম দিয়ে খুঁজুন...' : 'Search by code or service name...'}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
            />
          </div>

          <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
                className="rounded border-slate-300 text-[#0DA54F] focus:ring-[#0DA54F]"
              />
              <span>{isBn ? 'শুধু সক্রিয় সেবা' : 'Active services only'}</span>
            </label>

            <button
              onClick={loadData}
              className="p-2 text-slate-500 hover:text-slate-800 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs flex items-center gap-1 cursor-pointer"
              title="Refresh catalog"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isBn ? 'রিফ্রেশ' : 'Refresh'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Treatments Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-2 border-[#0DA54F] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-slate-500 font-medium">Loading treatment catalog...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-600">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-80" />
            <p className="text-sm font-semibold">{error}</p>
            <button
              onClick={loadData}
              className="mt-3 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-lg font-medium"
            >
              Retry
            </button>
          </div>
        ) : treatments.length === 0 ? (
          <div className="p-12 text-center">
            <Sparkles className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-700">No treatments found</p>
            <p className="text-xs text-slate-400 mt-1">Try adjusting your category filter or search keywords.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Treatment Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-right">Price (৳)</th>
                  <th className="py-3 px-4 text-center">Default Duration</th>
                  <th className="py-3 px-4 text-center">Follow-up Interval</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {treatments.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                    {/* Code */}
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                      <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-700 border border-slate-200">
                        {t.service_code}
                      </span>
                    </td>

                    {/* Name (Bangla below) */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">{t.name}</div>
                      {t.name_bn && (
                        <div className="text-[11px] text-slate-500 font-bengali mt-0.5">
                          {t.name_bn}
                        </div>
                      )}
                      {t.requires_clinical_approval && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 mt-1">
                          <ShieldAlert className="w-3 h-3" />
                          <span>Requires Doctor Approval</span>
                        </span>
                      )}
                    </td>

                    {/* Category */}
                    <td className="py-3.5 px-4">
                      <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[11px] font-medium border border-slate-200">
                        {t.category_name || t.category_code}
                      </span>
                    </td>

                    {/* Price (৳) */}
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                      ৳ {Number(t.base_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>

                    {/* Duration */}
                    <td className="py-3.5 px-4 text-center font-mono text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{t.default_duration_minutes} min</span>
                      </span>
                    </td>

                    {/* Follow-up */}
                    <td className="py-3.5 px-4 text-center font-mono text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{t.default_followup_days ? `${t.default_followup_days} days` : 'None'}</span>
                      </span>
                    </td>

                    {/* Active */}
                    <td className="py-3.5 px-4 text-center">
                      {t.is_active ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Active</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          <XCircle className="w-3 h-3 text-slate-400" />
                          <span>Inactive</span>
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        onClick={() => openEditDrawer(t)}
                        className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        title="Edit treatment"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => openFollowupRules(t)}
                        className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        title="Follow-up Rules"
                      >
                        <Clock className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => onNavigateToGuidance && onNavigateToGuidance(t.id)}
                        className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                        title="Food & Lifestyle Guidance"
                      >
                        <Apple className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
