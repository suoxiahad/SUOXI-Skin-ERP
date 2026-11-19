import React, { useEffect, useState } from 'react';
import {
  X,
  History,
  Camera,
  Package,
  Copy,
  Calendar,
  Sparkles,
  FileCheck,
  Upload,
  CheckCircle,
  SlidersHorizontal,
  ShieldCheck,
  Image as ImageIcon,
} from 'lucide-react';
import type {
  Patient,
  Prescription,
  Consultation,
  TreatmentPackage,
  MedicalAttachment,
} from '../../../types/index.ts';
import { api } from '../../../api/client.ts';
import { formatDateDhaka } from '../../../utils/format.ts';

interface PatientHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient | null;
  consultations: Consultation[];
  prescriptions: Prescription[];
  packages: TreatmentPackage[];
  documents: MedicalAttachment[];
  onCopyPrescription: (rx: Prescription) => void;
  onDocumentAdded: (doc: MedicalAttachment) => void;
  addToast: (toast: { type: 'success' | 'error' | 'info' | 'warning'; title: string; description?: string }) => void;
}

export const PatientHistoryDrawer: React.FC<PatientHistoryDrawerProps> = ({
  isOpen,
  onClose,
  patient,
  consultations,
  prescriptions,
  packages,
  documents,
  onCopyPrescription,
  onDocumentAdded,
  addToast,
}) => {
  const [activeTab, setActiveTab] = useState<'visits' | 'photos' | 'packages'>('visits');
  const [selectedPhotoDoc, setSelectedPhotoDoc] = useState<MedicalAttachment | null>(null);
  const [sliderPos, setSliderPos] = useState<number>(52);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  // Quick photo upload state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [photoTitle, setPhotoTitle] = useState('');
  const [photoProcedure, setPhotoProcedure] = useState('HydraFacial MD with GlySal Peel');
  const [photoType, setPhotoType] = useState<'before' | 'after' | 'during'>('before');
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [photoNotes, setPhotoNotes] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  useEffect(() => {
    const photoDocs = documents.filter((d) => d.category === 'Before-After Photos' || d.type === 'clinical_photo');
    if (photoDocs.length > 0 && !selectedPhotoDoc) {
      setSelectedPhotoDoc(photoDocs[0]);
    }
  }, [documents, selectedPhotoDoc]);

  if (!isOpen || !patient) return null;

  const photoDocs = documents.filter(
    (d) => d.category === 'Before-After Photos' || d.type === 'clinical_photo'
  );
  const otherDocs = documents.filter(
    (d) => d.category !== 'Before-After Photos' && d.type !== 'clinical_photo'
  );

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!photoTitle.trim()) {
      setPhotoTitle(`${photoProcedure} — ${photoType.toUpperCase()} Photo`);
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPhotoDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUploadPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photoTitle.trim()) return;
    setIsUploading(true);
    try {
      const created = await api.medicalDocuments.create({
        patientId: patient.id,
        title: photoTitle.trim(),
        type: 'clinical_photo',
        category: 'Before-After Photos',
        procedureName: photoProcedure,
        photoType,
        fileUrl: photoDataUrl || `/assets/clinical/${photoType}_${Date.now()}.png`,
        thumbnailUrl: photoDataUrl || undefined,
        fileFormat: 'PNG',
        fileSize: '1.8 MB',
        clinicalNotes: photoNotes.trim() || undefined,
        signedByPatient: true,
      });
      onDocumentAdded(created);
      setSelectedPhotoDoc(created);
      setIsUploadOpen(false);
      setPhotoTitle('');
      setPhotoNotes('');
      setPhotoDataUrl('');
      addToast({
        type: 'success',
        title: 'Clinical Photo Saved',
        description: `${created.title} added to ${patient.name}'s EMR gallery.`,
      });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Upload Failed',
        description: (err as Error).message,
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] transition-opacity"
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <aside className="relative z-10 w-full max-w-2xl bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col animate-suoxi-drawer">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 bg-white">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 truncate">
                {patient.name}
              </h2>
              <span className="text-xs font-mono text-slate-500 shrink-0">
                {patient.patientIdCode}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span>{patient.phone}</span>
              <span aria-hidden="true">·</span>
              <span className="capitalize">{patient.gender}</span>
              {patient.age && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{patient.age} yrs</span>
                </>
              )}
              {patient.skinType && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="capitalize">{patient.skinType} skin</span>
                </>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
            aria-label="Close history drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Segmented Tab Bar */}
        <div className="px-6 py-3 bg-slate-50/70 border-b border-slate-200 flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('visits')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'visits'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <History className="w-3.5 h-3.5 text-[#0DA54F]" />
            <span>Visits & Past Rx ({prescriptions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('photos')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'photos'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <Camera className="w-3.5 h-3.5 text-[#0DA54F]" />
            <span>Before / After Photos ({photoDocs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('packages')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'packages'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <Package className="w-3.5 h-3.5 text-[#0DA54F]" />
            <span>Active Packages ({packages.length})</span>
          </button>
        </div>

        {/* Scrollable Drawer Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* TAB 1: PAST VISITS & PRESCRIPTIONS */}
          {activeTab === 'visits' && (
            <div className="space-y-4">
              {prescriptions.length === 0 && consultations.length === 0 ? (
                <div className="py-12 px-6 text-center rounded-xl border border-dashed border-slate-300 bg-slate-50/50">
                  <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-700">First Recorded Visit</p>
                  <p className="text-xs text-slate-500 mt-1">
                    No previous consultations or prescriptions found for {patient.name}.
                  </p>
                </div>
              ) : (
                <>
                  {prescriptions.map((rx) => (
                    <div
                      key={rx.id}
                      className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="font-mono font-semibold text-slate-800">
                              {rx.prescriptionCode}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">{formatDateDhaka(rx.createdAt)}</span>
                            <span aria-hidden="true">·</span>
                            <span className="text-[#0DA54F] font-medium">Dr. {rx.doctorName}</span>
                          </div>
                          <h4 className="text-sm font-bold text-slate-900 mt-1">
                            {rx.diagnosis}
                          </h4>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            onCopyPrescription(rx);
                            onClose();
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-[#0DA54F] border border-emerald-200 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy to Current Rx</span>
                        </button>
                      </div>

                      {rx.medicines.length > 0 && (
                        <div className="divide-y divide-slate-100 border-t border-slate-100 pt-2">
                          {rx.medicines.map((med, i) => (
                            <div
                              key={med.id || i}
                              className="py-1.5 flex items-baseline justify-between gap-3 text-xs"
                            >
                              <div className="text-slate-700">
                                <span className="font-semibold text-slate-900">
                                  {i + 1}. {med.name}
                                </span>{' '}
                                <span className="text-slate-400">({med.form})</span>
                              </div>
                              <span className="text-slate-500 tabular-nums shrink-0">
                                {med.dosage} · {med.duration}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {rx.nextSessionDate && (
                        <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 text-xs text-slate-600">
                          <Calendar className="w-3.5 h-3.5 text-[#0DA54F]" />
                          <span>
                            Next Session Prescribed:{' '}
                            <strong className="text-slate-800 tabular-nums">
                              {formatDateDhaka(rx.nextSessionDate)}
                            </strong>
                          </span>
                        </div>
                      )}
                    </div>
                  ))}

                  {consultations.length > 0 && (
                    <div className="pt-2 space-y-2.5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Clinical Assessment Notes ({consultations.length})
                      </h4>
                      {consultations.map((c) => (
                        <div
                          key={c.id}
                          className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 text-xs space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-slate-500">
                            <span className="font-semibold text-slate-800">{c.clinicalDiagnosis}</span>
                            <span className="tabular-nums">{formatDateDhaka(c.consultationDate)}</span>
                          </div>
                          <p className="text-slate-600">{c.examinationNotes}</p>
                          {c.recommendedProcedures.length > 0 && (
                            <p className="text-[#0DA54F] font-medium">
                              Procedures: {c.recommendedProcedures.join(' · ')}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* TAB 2: BEFORE / AFTER PHOTOS & CONSENT */}
          {activeTab === 'photos' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  Compare pre-op baseline and post-session clinical progress
                </p>
                <button
                  type="button"
                  onClick={() => setIsUploadOpen((v) => !v)}
                  className="px-3 py-1.5 rounded-lg bg-[#0DA54F] hover:bg-[#0a8740] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isUploadOpen ? 'Cancel Upload' : 'Add Clinical Photo'}</span>
                </button>
              </div>

              {isUploadOpen && (
                <form
                  onSubmit={handleUploadPhoto}
                  className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-3 text-xs animate-suoxi-pop"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Photo Stage
                      </label>
                      <select
                        value={photoType}
                        onChange={(e) => setPhotoType(e.target.value as 'before' | 'after' | 'during')}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium"
                      >
                        <option value="before">Before (Pre-Op Baseline)</option>
                        <option value="after">After (Post-Session Result)</option>
                        <option value="during">During Procedure</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Procedure
                      </label>
                      <input
                        type="text"
                        value={photoProcedure}
                        onChange={(e) => setPhotoProcedure(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Title *
                    </label>
                    <input
                      type="text"
                      required
                      value={photoTitle}
                      onChange={(e) => setPhotoTitle(e.target.value)}
                      placeholder="e.g. Melasma Toning - Session 2 Progress"
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Attach Image File (Optional)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFilePick}
                      className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-white file:text-slate-700 hover:file:bg-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Clinical Notes
                    </label>
                    <input
                      type="text"
                      value={photoNotes}
                      onChange={(e) => setPhotoNotes(e.target.value)}
                      placeholder="Lighting, melanin index, erythema observations..."
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isUploading}
                      className="px-4 py-2 rounded-lg bg-[#0DA54F] hover:bg-[#0a8740] text-white font-semibold text-xs cursor-pointer"
                    >
                      {isUploading ? 'Saving...' : 'Save to Patient EMR'}
                    </button>
                  </div>
                </form>
              )}

              {/* Interactive Comparison Viewer */}
              {selectedPhotoDoc && (
                <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-900 text-white">
                  <div className="px-4 py-2.5 bg-slate-800/90 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-[#0DA54F] shrink-0" />
                      <span className="font-semibold truncate">{selectedPhotoDoc.title}</span>
                    </div>
                    <span className="text-[11px] text-slate-300 tabular-nums shrink-0">
                      {formatDateDhaka(selectedPhotoDoc.createdAt)}
                    </span>
                  </div>

                  <div className="relative h-60 bg-slate-950 select-none overflow-hidden">
                    {!failedImages[selectedPhotoDoc.id] &&
                    (selectedPhotoDoc.thumbnailUrl || selectedPhotoDoc.fileUrl) ? (
                      <>
                        {/* Base After/Current Layer */}
                        <img
                          src={selectedPhotoDoc.thumbnailUrl || selectedPhotoDoc.fileUrl}
                          alt={selectedPhotoDoc.title}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setFailedImages((prev) => ({ ...prev, [selectedPhotoDoc.id]: true }))
                          }
                          className="w-full h-full object-cover"
                        />
                        {/* Split Comparison Overlay */}
                        <div
                          style={{ width: `${sliderPos}%` }}
                          className="absolute inset-y-0 left-0 overflow-hidden border-r-2 border-white/90"
                        >
                          <img
                            src={selectedPhotoDoc.thumbnailUrl || selectedPhotoDoc.fileUrl}
                            alt={`${selectedPhotoDoc.title} baseline comparison`}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover brightness-90 contrast-110 saturate-75"
                            style={{ maxWidth: 'none', width: '600px' }}
                          />
                        </div>
                      </>
                    ) : (
                      /* Resilient Zero-Broken-Image Clinical Comparison Frame */
                      <div className="w-full h-full relative flex">
                        <div
                          style={{ width: `${sliderPos}%` }}
                          className="h-full bg-gradient-to-br from-slate-800 to-slate-900 border-r-2 border-[#0DA54F] flex flex-col items-center justify-center p-4 overflow-hidden"
                        >
                          <ImageIcon className="w-7 h-7 text-slate-400 mb-2" />
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                            Baseline Capture
                          </span>
                          <span className="text-[11px] text-slate-400 mt-1 text-center">
                            Session 1 · Pre-Treatment
                          </span>
                        </div>
                        <div className="flex-1 h-full bg-gradient-to-br from-emerald-950/70 to-slate-900 flex flex-col items-center justify-center p-4">
                          <Sparkles className="w-7 h-7 text-[#0DA54F] mb-2" />
                          <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                            {selectedPhotoDoc.photoType === 'before' ? 'Target Outcome' : 'Post-Session Result'}
                          </span>
                          <span className="text-[11px] text-slate-300 mt-1 text-center">
                            {selectedPhotoDoc.procedureName || 'Clinical Progress'}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Labels */}
                    <span className="absolute top-3 left-3 px-2 py-0.5 rounded bg-black/60 text-[10px] font-semibold uppercase tracking-wider">
                      Before
                    </span>
                    <span className="absolute top-3 right-3 px-2 py-0.5 rounded bg-[#0DA54F]/85 text-[10px] font-semibold uppercase tracking-wider">
                      After
                    </span>

                    {/* Range Slider Input */}
                    <input
                      type="range"
                      min={10}
                      max={90}
                      value={sliderPos}
                      onChange={(e) => setSliderPos(Number(e.target.value))}
                      aria-label="Before and after comparison slider"
                      className="absolute inset-x-4 bottom-3 z-10 accent-[#0DA54F] cursor-ew-resize"
                    />
                  </div>

                  {selectedPhotoDoc.clinicalNotes && (
                    <div className="px-4 py-2.5 bg-slate-900 text-xs text-slate-300 border-t border-slate-800">
                      {selectedPhotoDoc.clinicalNotes}
                    </div>
                  )}
                </div>
              )}

              {/* Photo Cards List */}
              {photoDocs.length === 0 ? (
                <div className="py-10 px-6 text-center rounded-xl border border-dashed border-slate-300 bg-slate-50/50">
                  <Camera className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-700">No Clinical Photos Yet</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Capture or upload baseline Before & After photography for visual tracking.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {photoDocs.map((doc) => {
                    const isSelected = selectedPhotoDoc?.id === doc.id;
                    return (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => setSelectedPhotoDoc(doc)}
                        className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'border-[#0DA54F] bg-emerald-50/40'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span className="font-mono font-semibold text-slate-700">
                            {doc.documentCode}
                          </span>
                          <span className="uppercase font-semibold text-[#0DA54F]">
                            {doc.photoType || 'clinical'}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-900 mt-1 line-clamp-2">
                          {doc.title}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1">
                          {doc.procedureName || doc.category} · {formatDateDhaka(doc.createdAt)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Consent & Lab Docs */}
              {otherDocs.length > 0 && (
                <div className="pt-2 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Informed Consent & Patch Tests ({otherDocs.length})
                  </h4>
                  {otherDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileCheck className="w-4 h-4 text-[#0DA54F] shrink-0" />
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 truncate">{doc.title}</p>
                          <p className="text-[11px] text-slate-500">
                            {doc.category} · {formatDateDhaka(doc.createdAt)}
                          </p>
                        </div>
                      </div>
                      {doc.signedByPatient && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0DA54F] shrink-0">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Signed
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ACTIVE PACKAGES */}
          {activeTab === 'packages' && (
            <div className="space-y-3">
              {packages.length === 0 ? (
                <div className="py-12 px-6 text-center rounded-xl border border-dashed border-slate-300 bg-slate-50/50">
                  <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-700">No Active Packages</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Recommended procedures pushed to the Cashier Desk can be converted into session packages.
                  </p>
                </div>
              ) : (
                packages.map((pkg) => {
                  const pct = pkg.totalSessions > 0
                    ? Math.round((pkg.completedSessions / pkg.totalSessions) * 100)
                    : 0;
                  return (
                    <div
                      key={pkg.id}
                      className="p-4 rounded-xl border border-slate-200 bg-white space-y-2.5 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{pkg.packageName}</p>
                          <p className="text-slate-500 mt-0.5">
                            {pkg.serviceCategory} · Expires {formatDateDhaka(pkg.expiryDate)}
                          </p>
                        </div>
                        <span className="font-bold text-[#0DA54F] tabular-nums shrink-0">
                          {pkg.completedSessions}/{pkg.totalSessions} Sessions
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#0DA54F] rounded-full transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>Remaining: {pkg.remainingSessions} sessions</span>
                        <span className="capitalize font-medium text-slate-700">Status: {pkg.status}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50/80 flex items-center justify-between text-xs">
          <span className="text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#0DA54F]" />
            Confidential BMDC Aesthetic EMR
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 font-semibold text-slate-700 cursor-pointer"
          >
            Done
          </button>
        </div>
      </aside>
    </div>
  );
};
