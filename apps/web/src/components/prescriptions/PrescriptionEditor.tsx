import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Pill,
  Plus,
  Trash2,
  Calendar,
  Eye,
  CheckCircle2,
  Printer,
  Download,
  Share2,
  AlertTriangle,
  History,
  Lock,
  Sparkles,
  ArrowLeft,
  X,
  ExternalLink,
} from 'lucide-react';
import { prescriptionsApi } from '../../api/prescriptions.js';
import { catalogApi } from '../../api/catalog.js';
import type {
  PrescriptionDto,
  CreatePrescriptionItemInput,
  TreatmentServiceDto,
  FoodLifestyleGuidanceDto,
} from '@suoxi/shared-types';
import { useI18n } from '../../i18n/I18nContext.js';
import { useAuth } from '../../context/AuthContext.js';

interface PrescriptionEditorProps {
  prescriptionId?: string;
  onBack?: () => void;
}

export const PrescriptionEditor: React.FC<PrescriptionEditorProps> = ({
  prescriptionId = 'rx-sample-01',
  onBack,
}) => {
  const { lang } = useI18n();
  const isBn = lang === 'bn';
  const { user } = useAuth();
  const isDoctorOrSuperAdmin = user?.roles.includes('doctor') || user?.roles.includes('super_admin');

  const [loading, setLoading] = useState<boolean>(true);
  const [prescription, setPrescription] = useState<PrescriptionDto | null>(null);
  const [services, setServices] = useState<TreatmentServiceDto[]>([]);
  const [activeGuidance, setActiveGuidance] = useState<FoodLifestyleGuidanceDto | null>(null);

  // Form states
  const [diagnosis, setDiagnosis] = useState<string>('');
  const [advice, setAdvice] = useState<string>('');
  const [followupAdvice, setFollowupAdvice] = useState<string>('');
  const [nextSessionDate, setNextSessionDate] = useState<string>('');
  const [language, setLanguage] = useState<'en' | 'bn' | 'both'>('both');
  const [suggestFood, setSuggestFood] = useState<boolean>(false);
  const [serviceId, setServiceId] = useState<string>('');
  const [items, setItems] = useState<CreatePrescriptionItemInput[]>([]);

  // Modals & Panels
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState<boolean>(false);
  const [showCorrectModal, setShowCorrectModal] = useState<boolean>(false);
  const [correctReason, setCorrectReason] = useState<string>('');
  const [showVoidModal, setShowVoidModal] = useState<boolean>(false);
  const [voidReason, setVoidReason] = useState<string>('');
  const [showHistoryDrawer, setShowHistoryDrawer] = useState<boolean>(false);
  const [versionHistory, setVersionHistory] = useState<PrescriptionDto[]>([]);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Common quick aesthetic diagnoses
  const quickDiagnoses = [
    'Post-acne hyperpigmentation',
    'Melasma (Epidermal)',
    'Atrophic acne scarring',
    'Telangiectasia / Facial Erythema',
    'Androgenetic Alopecia (Grade II)',
  ];

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [rx, srvList] = await Promise.all([
        prescriptionsApi.getPrescription(prescriptionId),
        catalogApi.listTreatments({ activeOnly: true }),
      ]);

      if (rx) {
        setPrescription(rx);
        setDiagnosis(rx.diagnosis || '');
        setAdvice(rx.advice || '');
        setFollowupAdvice(rx.followupAdvice || '');
        setNextSessionDate(rx.nextSessionDate || '');
        setLanguage(rx.language || 'both');
        setSuggestFood(rx.suggestFood);
        setServiceId(rx.serviceId || '');
        setItems(
          (rx.items || []).map((it: any) => ({
            itemName: it.itemName,
            itemNameBn: it.itemNameBn || undefined,
            strength: it.strength || undefined,
            dosage: it.dosage || undefined,
            frequency: it.frequency || undefined,
            frequencyBn: it.frequencyBn || undefined,
            duration: it.duration || undefined,
            route: it.route || 'Topical',
            instructions: it.instructions || undefined,
            instructionsBn: it.instructionsBn || undefined,
            sortOrder: it.sortOrder,
          }))
        );

        if (rx.serviceId) {
          try {
            const gList = await catalogApi.listGuidance({ serviceId: rx.serviceId, status: 'approved' });
            if (gList && gList.length > 0) {
              setActiveGuidance(gList[0]);
            } else {
              setActiveGuidance(null);
            }
          } catch {
            setActiveGuidance(null);
          }
        }
      }

      if (srvList) {
        setServices(srvList);
      }
    } catch (err) {
      console.error('Failed to load prescription:', err);
    } finally {
      setLoading(false);
    }
  }, [prescriptionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // When serviceId changes in editor, check if approved guidance exists
  useEffect(() => {
    if (!serviceId) {
      setActiveGuidance(null);
      setSuggestFood(false);
      return;
    }
    catalogApi.listGuidance({ serviceId, status: 'approved' }).then((gList) => {
      if (gList && gList.length > 0) {
        setActiveGuidance(gList[0]);
      } else {
        setActiveGuidance(null);
        setSuggestFood(false);
      }
    });
  }, [serviceId]);

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        itemName: '',
        strength: '',
        dosage: '',
        frequency: '1+0+1',
        duration: '30 days',
        route: 'Topical',
        instructions: '',
        sortOrder: items.length + 1,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (index: number, field: keyof CreatePrescriptionItemInput, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleSaveDraft = async () => {
    if (!prescription) return;
    try {
      setActionLoading(true);
      const res = await prescriptionsApi.patchPrescription(prescription.id, {
        diagnosis,
        advice,
        followupAdvice,
        nextSessionDate,
        language,
        suggestFood,
        serviceId: serviceId || undefined,
        items,
      });
      if (res) {
        setPrescription(res);
      }
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleFinalize = async () => {
    if (!prescription) return;
    try {
      setActionLoading(true);
      // Save draft edits first
      await prescriptionsApi.patchPrescription(prescription.id, {
        diagnosis,
        advice,
        followupAdvice,
        nextSessionDate,
        language,
        suggestFood,
        serviceId: serviceId || undefined,
        items,
      });

      const res = await prescriptionsApi.finalizePrescription(prescription.id);
      if (res) {
        setPrescription(res);
        setShowFinalizeConfirm(false);
      }
    } catch (err: any) {
      alert(`Finalization failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCorrect = async () => {
    if (!prescription || !correctReason.trim()) return;
    try {
      setActionLoading(true);
      const res = await prescriptionsApi.correctPrescription(prescription.id, correctReason.trim());
      if (res) {
        setPrescription(res);
        setShowCorrectModal(false);
        setCorrectReason('');
        await loadData();
      }
    } catch (err: any) {
      alert(`Correction failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleVoid = async () => {
    if (!prescription || !voidReason.trim()) return;
    try {
      setActionLoading(true);
      const res = await prescriptionsApi.voidPrescription(prescription.id, voidReason.trim());
      if (res) {
        setPrescription(res);
        setShowVoidModal(false);
        setVoidReason('');
      }
    } catch (err: any) {
      alert(`Void failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleTogglePublish = async () => {
    if (!prescription) return;
    try {
      setActionLoading(true);
      const nextState = !prescription.publishedToPortal;
      const res = await prescriptionsApi.publishPrescription(prescription.id, nextState);
      if (res) {
        setPrescription({ ...prescription, publishedToPortal: res.publishedToPortal });
      }
    } catch (err: any) {
      alert(`Publish failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenPdf = async () => {
    if (!prescription) return;
    try {
      const blob = await prescriptionsApi.getPdfBlob(prescription.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err: any) {
      alert(`Failed to load PDF: ${err.message}`);
    }
  };

  const handleLoadHistory = async () => {
    if (!prescription) return;
    try {
      const hist = await prescriptionsApi.getPrescriptionHistory(prescription.prescriptionCode);
      if (hist) {
        setVersionHistory(hist);
        setShowHistoryDrawer(true);
      }
    } catch (err) {
      console.error('Failed to load version history:', err);
    }
  };

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto animate-pulse space-y-6">
        <div className="h-8 bg-slate-200 rounded w-1/4"></div>
        <div className="h-96 bg-slate-100 rounded-xl"></div>
      </div>
    );
  }

  if (!prescription) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center bg-white rounded-xl border border-slate-200">
        <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-800">Prescription not found</h3>
      </div>
    );
  }

  const isFinalized = prescription.status === 'finalized';
  const isSuperseded = prescription.status === 'superseded';
  const isVoid = prescription.status === 'void';
  const isLocked = isFinalized || isSuperseded || isVoid;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner / Actions Bar */}
      <div className="bg-white/90 backdrop-blur-md p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-lg">
            ℞
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">
                {prescription.prescriptionCode}
              </h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                v{prescription.versionNumber}
              </span>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                  isFinalized
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : isSuperseded
                    ? 'bg-slate-100 text-slate-600 border border-slate-300 line-through'
                    : isVoid
                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                }`}
              >
                {prescription.status.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Patient: <strong>{prescription.patientName}</strong> ({prescription.patientCode || 'PT-01'}) · Doctor: {prescription.doctorName}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleLoadHistory}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5"
          >
            <History className="w-3.5 h-3.5" />
            <span>{isBn ? 'ভার্সন ইতিহাস' : 'History'}</span>
          </button>

          {!isLocked && (
            <>
              <button
                onClick={handleSaveDraft}
                disabled={actionLoading}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                {isBn ? 'ড্রাফট সেভ' : 'Save Draft'}
              </button>

              {isDoctorOrSuperAdmin && (
                <button
                  onClick={() => setShowFinalizeConfirm(true)}
                  disabled={actionLoading}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm flex items-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{isBn ? 'চূড়ান্ত করুন (Finalize)' : 'Finalize Rx'}</span>
                </button>
              )}
            </>
          )}

          {isFinalized && (
            <>
              <button
                onClick={handleOpenPdf}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{isBn ? 'প্রিন্ট / ভিউ' : 'Print / View PDF'}</span>
              </button>

              <button
                onClick={handleOpenPdf}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isBn ? 'ডাউনলোড' : 'Download PDF'}</span>
              </button>

              <button
                onClick={handleTogglePublish}
                disabled={actionLoading}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors ${
                  prescription.publishedToPortal
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>
                  {prescription.publishedToPortal
                    ? isBn
                      ? 'পোর্টালে প্রকাশিত ✓'
                      : 'Published to Portal ✓'
                    : isBn
                    ? 'পোর্টাল প্রকাশ'
                    : 'Publish to Portal'}
                </span>
              </button>

              {isDoctorOrSuperAdmin && (
                <>
                  <button
                    onClick={() => setShowCorrectModal(true)}
                    className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg"
                  >
                    {isBn ? 'সংশোধন (Correct)' : 'Create Correction (v2)'}
                  </button>

                  <button
                    onClick={() => setShowVoidModal(true)}
                    className="px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg"
                  >
                    {isBn ? 'বাতিল (Void)' : 'Void Rx'}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Editor Surface */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
        {/* Row 1: Diagnosis & Quick-Select */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
              {isBn ? 'ক্লিনিক্যাল ডায়াগনোসিস' : 'Clinical Diagnosis'} *
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{isBn ? 'ভাষা:' : 'Language:'}</span>
              <div className="flex rounded-md border border-slate-200 p-0.5 bg-slate-50 text-xs">
                {(['en', 'bn', 'both'] as const).map((l) => (
                  <button
                    key={l}
                    disabled={isLocked}
                    onClick={() => setLanguage(l)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                      language === l ? 'bg-white shadow-xs font-bold text-emerald-700' : 'text-slate-600'
                    }`}
                  >
                    {l === 'en' ? 'English' : l === 'bn' ? 'বাংলা' : 'Both'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <input
            type="text"
            disabled={isLocked}
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
            placeholder="e.g. Post-acne hyperpigmentation, Melasma..."
            className="w-full p-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none disabled:bg-slate-100"
          />

          {!isLocked && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-slate-400 font-medium">Quick select:</span>
              {quickDiagnoses.map((qd) => (
                <button
                  key={qd}
                  type="button"
                  onClick={() => setDiagnosis(qd)}
                  className="text-[11px] px-2 py-0.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 rounded border border-slate-200 transition-colors"
                >
                  {qd}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Row 2: Medicines / Products Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg font-serif font-black text-emerald-700">℞</span>
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                {isBn ? 'প্রেসক্রিপশন ওষুধ ও থেরাপিউটিক স্কিনকেয়ার' : 'Prescribed Medications & Therapeutic Skincare'}
              </span>
            </div>
            {!isLocked && (
              <button
                type="button"
                onClick={handleAddItem}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isBn ? 'ওষুধ যোগ করুন' : 'Add Medication'}</span>
              </button>
            )}
          </div>

          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="p-2.5 w-1/4">{isBn ? 'ওষুধ / প্রোডাক্ট' : 'Item Name'}</th>
                  <th className="p-2.5 w-1/6">{isBn ? 'শক্তি (Strength)' : 'Strength'}</th>
                  <th className="p-2.5 w-1/6">{isBn ? 'মাত্রা (Dosage)' : 'Dosage'}</th>
                  <th className="p-2.5 w-1/6">{isBn ? 'ফ্রিকোয়েন্সি' : 'Frequency'}</th>
                  <th className="p-2.5 w-1/12">{isBn ? 'সময়কাল' : 'Duration'}</th>
                  <th className="p-2.5 w-1/12">{isBn ? 'রুট' : 'Route'}</th>
                  <th className="p-2.5 w-1/4">{isBn ? 'নির্দেশনা' : 'Instructions'}</th>
                  {!isLocked && <th className="p-2.5 w-10 text-center"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-slate-400 italic">
                      {isBn ? 'কোনো ওষুধ যোগ করা হয়নি।' : 'No prescription items added. Click Add Medication.'}
                    </td>
                  </tr>
                ) : (
                  items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="p-2">
                        <input
                          type="text"
                          disabled={isLocked}
                          value={item.itemName}
                          onChange={(e) => handleItemChange(idx, 'itemName', e.target.value)}
                          placeholder="e.g. Sunscreen SPF 50+"
                          className="w-full p-1.5 border border-slate-200 rounded text-xs disabled:bg-slate-50 font-medium"
                        />
                        {language !== 'en' && (
                          <input
                            type="text"
                            disabled={isLocked}
                            value={item.itemNameBn || ''}
                            onChange={(e) => handleItemChange(idx, 'itemNameBn', e.target.value)}
                            placeholder="বাংলা নাম (ঐচ্ছিক)"
                            className="w-full p-1 border border-slate-100 rounded text-[11px] text-slate-600 mt-1"
                          />
                        )}
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          disabled={isLocked}
                          value={item.strength || ''}
                          onChange={(e) => handleItemChange(idx, 'strength', e.target.value)}
                          placeholder="e.g. 10%"
                          className="w-full p-1.5 border border-slate-200 rounded text-xs disabled:bg-slate-50"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          disabled={isLocked}
                          value={item.dosage || ''}
                          onChange={(e) => handleItemChange(idx, 'dosage', e.target.value)}
                          placeholder="e.g. 2 drops"
                          className="w-full p-1.5 border border-slate-200 rounded text-xs disabled:bg-slate-50"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          disabled={isLocked}
                          value={item.frequency || ''}
                          onChange={(e) => handleItemChange(idx, 'frequency', e.target.value)}
                          placeholder="1+0+1 / Every morning"
                          className="w-full p-1.5 border border-slate-200 rounded text-xs disabled:bg-slate-50"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          disabled={isLocked}
                          value={item.duration || ''}
                          onChange={(e) => handleItemChange(idx, 'duration', e.target.value)}
                          placeholder="30 days"
                          className="w-full p-1.5 border border-slate-200 rounded text-xs disabled:bg-slate-50"
                        />
                      </td>
                      <td className="p-2">
                        <select
                          disabled={isLocked}
                          value={item.route || 'Topical'}
                          onChange={(e) => handleItemChange(idx, 'route', e.target.value)}
                          className="w-full p-1.5 border border-slate-200 rounded text-xs disabled:bg-slate-50"
                        >
                          <option value="Topical">Topical</option>
                          <option value="Oral">Oral</option>
                          <option value="Intradermal">Intradermal</option>
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          disabled={isLocked}
                          value={item.instructions || ''}
                          onChange={(e) => handleItemChange(idx, 'instructions', e.target.value)}
                          placeholder="Apply 20 mins prior to sun"
                          className="w-full p-1.5 border border-slate-200 rounded text-xs disabled:bg-slate-50"
                        />
                      </td>
                      {!isLocked && (
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Row 3: Advice & Next Session Date */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="md:col-span-2 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                {isBn ? 'সাধারণ পরামর্শ (General Advice)' : 'General Clinical Advice'}
              </label>
              <textarea
                disabled={isLocked}
                value={advice}
                onChange={(e) => setAdvice(e.target.value)}
                rows={2}
                placeholder="Avoid direct sun exposure and refrain from picking skin..."
                className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none disabled:bg-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                {isBn ? 'ফলো-আপ পরামর্শ' : 'Follow-up Advice'}
              </label>
              <input
                type="text"
                disabled={isLocked}
                value={followupAdvice}
                onChange={(e) => setFollowupAdvice(e.target.value)}
                placeholder="Return if irritation occurs, follow up in 2 weeks"
                className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none disabled:bg-slate-100"
              />
            </div>
          </div>

          {/* Hard Rule 2: Next Session Date (Clinician wall-clock time) */}
          <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 uppercase tracking-wide mb-1">
                <Calendar className="w-4 h-4 text-emerald-600" />
                <span>{isBn ? 'পরবর্তী সেশনের তারিখ' : 'Next Session Date'}</span>
              </div>
              <p className="text-[11px] text-emerald-700 leading-tight">
                {isBn
                  ? 'শুধুমাত্র চিকিৎসক এই তারিখ নির্ধারণ করবেন (Hard Rule 2)।'
                  : 'Only the doctor sets the next-session clinic date (Hard Rule 2).'}
              </p>
            </div>

            <div className="mt-3">
              <input
                type="date"
                disabled={isLocked || !isDoctorOrSuperAdmin}
                value={nextSessionDate}
                onChange={(e) => setNextSessionDate(e.target.value)}
                className="w-full p-2 text-sm bg-white border border-emerald-300 rounded-lg font-semibold text-emerald-900 outline-none disabled:bg-emerald-100/50"
              />
            </div>
          </div>
        </div>

        {/* Row 4: Suggest Food & Treatment Service Binding */}
        <div className="border-t border-slate-200 pt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="w-full md:w-1/2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                {isBn ? 'সম্পর্কিত ট্রিটমেন্ট সার্ভিস' : 'Associated Treatment Service'}
              </label>
              <select
                disabled={isLocked}
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none disabled:bg-slate-100"
              >
                <option value="">-- {isBn ? 'সার্ভিস নির্বাচন করুন' : 'Select Treatment Service'} --</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Checkbox: Suggest Food (Shown ONLY if selected treatment has approved guidance) */}
            {activeGuidance ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-3">
                <input
                  type="checkbox"
                  id="suggestFoodCheck"
                  disabled={isLocked}
                  checked={suggestFood}
                  onChange={(e) => setSuggestFood(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                />
                <label htmlFor="suggestFoodCheck" className="text-xs font-semibold text-emerald-900 cursor-pointer">
                  {isBn
                    ? 'খাদ্য ও জীবনযাপন নির্দেশিকা পৃষ্ঠা সংযুক্ত করুন (Suggest Food)'
                    : 'Suggest Food (attach Food & Lifestyle guidance page)'}
                  <span className="block text-[11px] font-normal text-emerald-700 mt-0.5">
                    {isBn
                      ? `ক্লিনিক্যাল নির্দেশিকা ভার্সন v${activeGuidance.version_number} অনুমোদিত`
                      : `Guidance version v${activeGuidance.version_number}, approved by ${activeGuidance.approved_by || 'Dr. Farhana Khan'}`}
                  </span>
                </label>
              </div>
            ) : (
              <div className="text-xs text-slate-400 italic">
                {serviceId
                  ? 'No approved Food & Lifestyle guidance library exists for this service.'
                  : 'Select an aesthetic service with approved clinical guidance to enable Suggest Food.'}
              </div>
            )}
          </div>

          {/* Live Preview of Page 2 "Food & Lifestyle Guidance" when suggestFood is checked */}
          {suggestFood && activeGuidance && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Live Preview: Page 2 — Food & Lifestyle Guidance (খাবার ও জীবনযাপন নির্দেশিকা)
                  </span>
                </div>
                <span className="text-xs text-emerald-700 font-semibold bg-emerald-100 px-2 py-0.5 rounded">
                  v{activeGuidance.version_number} Approved
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {activeGuidance.items.map((it, idx) => (
                  <div key={idx} className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                    <span className="text-[10px] font-bold uppercase text-emerald-700">
                      {it.section.replace('_', ' ')}
                    </span>
                    <p className="text-slate-800 font-medium">{it.content_en}</p>
                    {it.content_bn && <p className="text-slate-500 text-[11px]">{it.content_bn}</p>}
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-slate-500 italic text-center">
                * When finalized, this guidance library will be frozen as an immutable clinical snapshot attached to {prescription.prescriptionCode}.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal: Finalize Prescription */}
      {showFinalizeConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200 p-6 space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-slate-900">
                {isBn ? 'প্রেসক্রিপশন চূড়ান্তকরণ নিশ্চিত করুন' : 'Confirm Finalization'}
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              <strong>Finalized prescriptions cannot be edited.</strong> To correct, you will have to create a new version (v{prescription.versionNumber + 1}). An official A4 PDF will be generated and signed with SHA-256.
            </p>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                onClick={() => setShowFinalizeConfirm(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                {isBn ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                onClick={handleFinalize}
                disabled={actionLoading}
                className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                {actionLoading ? 'Finalizing...' : isBn ? 'হ্যাঁ, চূড়ান্ত করুন' : 'Confirm Finalize'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Correct Prescription (v2) */}
      {showCorrectModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200 p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              {isBn ? 'প্রেসক্রিপশন সংশোধন (Create Correction)' : 'Create Correction (New Version)'}
            </h3>
            <p className="text-xs text-slate-600">
              This action will mark version v{prescription.versionNumber} as <em>superseded</em> and spawn an editable draft version v{prescription.versionNumber + 1}. A mandatory reason is required.
            </p>
            <textarea
              value={correctReason}
              onChange={(e) => setCorrectReason(e.target.value)}
              rows={3}
              placeholder="e.g. Adjusted dosage of serum due to mild skin peeling..."
              className="w-full p-2.5 text-xs border border-slate-200 rounded-lg outline-none"
            />
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                onClick={() => setShowCorrectModal(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                {isBn ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                onClick={handleCorrect}
                disabled={!correctReason.trim() || actionLoading}
                className="px-4 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-50"
              >
                {actionLoading ? 'Spawning v2...' : isBn ? 'সংশোধন সম্পন্ন' : 'Create Correction'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Void Prescription */}
      {showVoidModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200 p-6 space-y-4">
            <h3 className="text-base font-bold text-rose-700">
              {isBn ? 'প্রেসক্রিপশন বাতিল করুন (Void)' : 'Void Prescription'}
            </h3>
            <p className="text-xs text-slate-600">
              Voiding cancels this prescription completely. Financial/clinical records are never hard-deleted. State the reason below.
            </p>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              rows={3}
              placeholder="e.g. Patient declined medication plan..."
              className="w-full p-2.5 text-xs border border-slate-200 rounded-lg outline-none"
            />
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                onClick={() => setShowVoidModal(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                {isBn ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                onClick={handleVoid}
                disabled={!voidReason.trim() || actionLoading}
                className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50"
              >
                {actionLoading ? 'Voiding...' : isBn ? 'বাতিল নিশ্চিত' : 'Confirm Void'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer: Version Genealogy History */}
      {showHistoryDrawer && (
        <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-md bg-white h-full shadow-2xl p-6 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-bold text-slate-900">
                    {prescription.prescriptionCode} {isBn ? 'ভার্সন ইতিহাস' : 'Version Genealogy'}
                  </h3>
                </div>
                <button
                  onClick={() => setShowHistoryDrawer(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                {versionHistory.map((v) => (
                  <div
                    key={v.id}
                    className={`p-3.5 rounded-lg border text-xs space-y-1.5 ${
                      v.id === prescription.id
                        ? 'border-emerald-300 bg-emerald-50/50'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">
                        Version v{v.versionNumber}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                          v.status === 'finalized'
                            ? 'bg-emerald-100 text-emerald-800'
                            : v.status === 'superseded'
                            ? 'bg-slate-200 text-slate-600 line-through'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {v.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="text-slate-600">
                      Diagnosis: <strong>{v.diagnosis}</strong>
                    </div>

                    {v.finalizedAt && (
                      <div className="text-[11px] text-slate-500">
                        Finalized by {v.finalizedByName || 'Doctor'} on{' '}
                        {new Date(v.finalizedAt).toLocaleString()}
                      </div>
                    )}

                    {v.supersededReason && (
                      <div className="text-[11px] text-amber-800 bg-amber-50 p-1.5 rounded border border-amber-200 mt-1">
                        <strong>Correction reason:</strong> {v.supersededReason}
                      </div>
                    )}

                    {v.voidReason && (
                      <div className="text-[11px] text-rose-800 bg-rose-50 p-1.5 rounded border border-rose-200 mt-1">
                        <strong>Void reason:</strong> {v.voidReason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => setShowHistoryDrawer(false)}
              className="w-full mt-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              {isBn ? 'বন্ধ করুন' : 'Close History'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
