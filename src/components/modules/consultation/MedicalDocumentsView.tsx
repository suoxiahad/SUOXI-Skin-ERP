import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Search,
  Upload,
  Calendar,
  User,
  ShieldCheck,
  CheckCircle,
  Clock,
  Sparkles,
  Eye,
  Download,
  Filter,
  Image as ImageIcon,
  FileCheck,
  FlaskConical,
  Zap,
  Lock,
  Plus,
  X,
  Sliders,
  Check,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';
import { api } from '../../../api/client.ts';
import type { MedicalAttachment, Patient } from '../../../types/index.ts';
import { formatDateDhaka } from '../../../utils/format.ts';
import { TableSkeleton } from '../../common/Skeleton.tsx';
import { EmptyState } from '../../common/EmptyState.tsx';

export const MedicalDocumentsView: React.FC = () => {
  const { language, addToast, currentUser } = useApp();
  const isBn = language === 'bn';

  const [documents, setDocuments] = useState<MedicalAttachment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPreviewDoc, setSelectedPreviewDoc] = useState<MedicalAttachment | null>(null);

  // Upload modal state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadPatientId, setUploadPatientId] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState<
    'Before-After Photos' | 'Informed Consent' | 'Lab & Biopsy' | 'Patch Test'
  >('Before-After Photos');
  const [uploadProcedure, setUploadProcedure] = useState('HydraFacial MD');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadSigned, setUploadSigned] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Before-After interactive comparison slider position (0-100%)
  const [comparisonSliderPos, setComparisonSliderPos] = useState<number>(50);

  // Fetch documents & patients
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    Promise.all([api.medicalDocuments.list(), api.patients.list()])
      .then(([docData, ptData]) => {
        if (isMounted) {
          setDocuments(docData || []);
          setPatients(ptData || []);
          if (ptData && ptData.length > 0) {
            setUploadPatientId(ptData[0].id);
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load medical documents:', err);
        addToast({
          type: 'error',
          title: isBn ? 'ডকুমেন্ট লোড ব্যর্থ' : 'Failed to load documents',
          description: err.message || 'Server error',
        });
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [addToast, isBn]);

  // Categories list
  const categories = [
    { id: 'all', label: isBn ? 'সকল ফাইল' : 'All Documents', icon: FileText },
    { id: 'Before-After Photos', label: isBn ? 'বিফোর-আফটার ছবি' : 'Before-After Photos', icon: ImageIcon },
    { id: 'Informed Consent', label: isBn ? 'সম্মতিপত্র (ই-স্বাক্ষর)' : 'Informed Consent', icon: FileCheck },
    { id: 'Lab & Biopsy', label: isBn ? 'ল্যাব ও বায়োপসি' : 'Lab & Biopsy', icon: FlaskConical },
    { id: 'Patch Test', label: isBn ? 'লেজার প্যাচ টেস্ট' : 'Patch Test', icon: Zap },
  ];

  // Filtered documents
  const filteredDocuments = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return documents.filter((doc) => {
      const matchCat = activeCategory === 'all' || doc.category === activeCategory;
      const matchSearch =
        !q ||
        doc.title.toLowerCase().includes(q) ||
        doc.documentCode.toLowerCase().includes(q) ||
        doc.patientName.toLowerCase().includes(q) ||
        doc.patientId.toLowerCase().includes(q) ||
        (doc.procedureName && doc.procedureName.toLowerCase().includes(q));

      return matchCat && matchSearch;
    });
  }, [documents, activeCategory, searchQuery]);

  // Handle mock upload
  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadPatientId || !uploadTitle.trim()) {
      addToast({
        type: 'warning',
        title: isBn ? 'তথ্য অসম্পূর্ণ' : 'Incomplete Form',
        description: isBn
          ? 'অনুগ্রহ করে রোগী নির্বাচন ও ডকুমেন্টের নাম প্রদান করুন।'
          : 'Please select patient and specify title.',
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const selectedPt = patients.find((p) => p.id === uploadPatientId);
      const newDoc = await api.medicalDocuments.create({
        patientId: uploadPatientId,
        title: uploadTitle.trim(),
        category: uploadCategory,
        procedureName: uploadProcedure,
        clinicalNotes: uploadNotes.trim() || undefined,
        signedByPatient: uploadSigned,
        fileFormat: uploadCategory === 'Before-After Photos' ? 'PNG' : 'PDF',
        fileSize: '2.4 MB',
      });

      setDocuments((prev) => [newDoc, ...prev]);
      setIsUploadModalOpen(false);
      setUploadTitle('');
      setUploadNotes('');
      addToast({
        type: 'success',
        title: isBn ? 'ডকুমেন্ট সংরক্ষিত হয়েছে' : 'Document Saved Successfully',
        description: isBn
          ? `"${newDoc.title}" রোগী ${selectedPt?.name || ''}-এর ফাইলে যুক্ত হয়েছে।`
          : `Document added to ${selectedPt?.name || 'patient'}'s medical archive.`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: isBn ? 'সংরক্ষণ ব্যর্থ' : 'Save Failed',
        description: err.message || 'Server error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#0DA54F] to-[#0a8740] flex items-center justify-center text-white shadow-sm shrink-0">
            <FileCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {isBn ? 'মেডিক্যাল ডকুমেন্টস ও ক্লিনিক্যাল ফাইল' : 'Medical Documents & Clinical Attachments'}
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-emerald-100 text-[#0DA54F] border border-emerald-200">
                Confidential EMR Vault
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                Legal Consent & E-Sign
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {isBn
                ? 'ক্লিনিক্যাল বিফোর-আফটার ফটো আর্চিভ, ডিজিটাল কনসেন্ট ফর্ম, ল্যাব ও বায়োপসি রিপোর্ট এবং লেজার প্যাচ টেস্ট ফাইল'
                : 'Archived before/after photography, digitally signed informed consent agreements, biopsy lab reports, and laser patch test records.'}
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsUploadModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0DA54F] hover:bg-[#0b8841] text-white rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer self-start md:self-auto shrink-0"
        >
          <Upload className="w-4 h-4" />
          <span>{isBn ? 'নতুন ডকুমেন্ট আপলোড' : 'Upload Clinical Document'}</span>
        </button>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        {/* Category Filter Buttons */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#0DA54F] text-white shadow-xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/80'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-[#0DA54F]'}`} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isBn
                ? 'পেশেন্ট আইডি, নাম, ফোন, ডকুমেন্ট কোড (DOC-...) বা প্রসিডিউরের নাম দিয়ে খুঁজুন...'
                : 'Search by Patient ID, Name, Phone, Document code (DOC-...), or Procedure name...'
            }
            className="w-full pl-9 pr-4 py-2 bg-slate-50 hover:bg-white focus:bg-white rounded-lg text-xs border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F] transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Featured Clinical Comparison Banner (If Before-After category or all) */}
      {(activeCategory === 'all' || activeCategory === 'Before-After Photos') && (
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-5 border border-slate-700 shadow-md">
          <div className="flex flex-col lg:flex-row items-center gap-6">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#0DA54F] text-white uppercase tracking-wider">
                  Interactive Photo Analysis
                </span>
                <span className="text-xs text-slate-400">High-Resolution Cross-Polarized Comparison</span>
              </div>
              <h3 className="text-base font-bold text-white">
                Bilateral Melasma & Pore Texture Improvement (Session 1 vs Session 3)
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                42% reduction in epidermal melanin pigmentation index. Slide the interactive separator to
                visualize tissue healing progress under polarized dermatological lighting.
              </p>
              <div className="flex items-center gap-4 pt-1 text-xs text-slate-400">
                <span>Patient: Taslima Akter (SX-2026-0841)</span>
                <span>·</span>
                <span>Procedure: HydraFacial MD & Nd:YAG</span>
              </div>
            </div>

            {/* Interactive Side-by-Side Visual Simulator */}
            <div className="w-full lg:w-80 h-44 relative rounded-xl overflow-hidden border-2 border-emerald-500/40 select-none bg-slate-950 flex flex-col justify-between p-3">
              {/* Simulated Before/After Split Visual */}
              <div
                className="absolute inset-0 bg-cover bg-center opacity-80"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, rgba(139, 92, 246, 0.4) 0%, rgba(13, 165, 79, 0.4) 100%)',
                }}
              />
              <div className="relative z-10 flex justify-between text-[11px] font-bold">
                <span className="px-2 py-0.5 rounded bg-black/70 text-rose-300 backdrop-blur-xs">
                  BEFORE (Session 1)
                </span>
                <span className="px-2 py-0.5 rounded bg-black/70 text-emerald-300 backdrop-blur-xs">
                  AFTER (Session 3)
                </span>
              </div>

              {/* Slider Control */}
              <div className="relative z-10 space-y-1">
                <div className="flex justify-between text-[10px] text-slate-300 font-mono">
                  <span>Epidermal Melasma Baseline</span>
                  <span>{comparisonSliderPos}% Treated</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={comparisonSliderPos}
                  onChange={(e) => setComparisonSliderPos(Number(e.target.value))}
                  className="w-full accent-[#0DA54F] cursor-ew-resize"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Documents Grid */}
      {isLoading ? (
        <TableSkeleton rows={4} cols={4} />
      ) : filteredDocuments.length === 0 ? (
        <EmptyState
          title={isBn ? 'কোনো মেডিক্যাল ডকুমেন্ট পাওয়া যায়নি' : 'No Medical Documents Found'}
          description={
            searchQuery
              ? isBn
                ? `"${searchQuery}" এর সাথে মিলে এমন কোনো ফাইল নেই।`
                : `No clinical document matching "${searchQuery}".`
              : isBn
              ? 'এই ক্যাটাগরিতে এখনো কোনো ফাইল আপলোড করা হয়নি।'
              : 'No documents uploaded in this category yet.'
          }
          actionLabel={isBn ? 'ডকুমেন্ট আপলোড করুন' : 'Upload Document'}
          onAction={() => setIsUploadModalOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredDocuments.map((doc) => (
            <div
              key={doc.id}
              className="bg-white rounded-xl border border-slate-200 hover:border-emerald-300 shadow-xs hover:shadow-md transition-all duration-200 p-4 flex flex-col justify-between group"
            >
              <div>
                {/* Header: Category Badge & Code */}
                <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100">
                  <div>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        doc.category === 'Informed Consent'
                          ? 'bg-purple-50 text-purple-700 border border-purple-200'
                          : doc.category === 'Before-After Photos'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : doc.category === 'Patch Test'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}
                    >
                      {doc.category}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400 block mt-1">
                      {doc.documentCode}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-600">
                      {doc.fileFormat}
                    </span>
                    <span className="text-[10px] text-slate-400">{doc.fileSize}</span>
                  </div>
                </div>

                {/* Title & Procedure */}
                <div className="py-3 border-b border-slate-100 space-y-1">
                  <h3 className="font-bold text-sm text-slate-900 group-hover:text-[#0DA54F] transition-colors line-clamp-2">
                    {doc.title}
                  </h3>
                  {doc.procedureName && (
                    <p className="text-[11px] text-slate-500 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-[#0DA54F]" />
                      <span>{doc.procedureName}</span>
                      {doc.sessionNumber && <span>(Session #{doc.sessionNumber})</span>}
                    </p>
                  )}
                </div>

                {/* Patient & Doctor metadata */}
                <div className="py-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="font-semibold">{doc.patientName}</span>
                    <span className="font-mono text-[11px] text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded">
                      {doc.patientId}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Dr. {doc.doctorName}</span>
                    <span>{formatDateDhaka(doc.createdAt)}</span>
                  </div>

                  {/* Legal Signature Status */}
                  {doc.category === 'Informed Consent' && (
                    <div className="pt-2">
                      <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50/80 px-2.5 py-1 rounded-lg border border-emerald-200/80">
                        <CheckCircle className="w-3.5 h-3.5 text-[#0DA54F]" />
                        <span>Digitally Signed by Patient ({doc.signatureDate || 'Verified'})</span>
                      </div>
                    </div>
                  )}

                  {doc.clinicalNotes && (
                    <p className="text-[11px] text-slate-500 line-clamp-2 italic pt-1">
                      "{doc.clinicalNotes}"
                    </p>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 mt-2">
                <button
                  onClick={() => setSelectedPreviewDoc(doc)}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-slate-600" />
                  <span>{isBn ? 'ফাইল দেখুন' : 'Preview'}</span>
                </button>

                <button
                  onClick={() => {
                    addToast({
                      type: 'success',
                      title: isBn ? 'ফাইল ডাউনলোড শুরু হয়েছে' : 'Download Started',
                      description: isBn
                        ? `${doc.documentCode} নিরাপদে ডিভাইসে সেভ করা হচ্ছে।`
                        : `Downloading ${doc.title} (${doc.fileFormat}).`,
                    });
                  }}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-[#0DA54F] hover:bg-[#0b8841] text-white rounded-lg text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isBn ? 'ডাউনলোড' : 'Download'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Document Lightbox / Preview Modal */}
      {selectedPreviewDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#0DA54F] flex items-center justify-center text-white">
                  <FileCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm tracking-tight">{selectedPreviewDoc.title}</h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {selectedPreviewDoc.documentCode} · {selectedPreviewDoc.category}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedPreviewDoc(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-5 text-slate-800 text-xs">
              {/* Document Banner */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Patient</span>
                  <span className="font-bold text-slate-900">{selectedPreviewDoc.patientName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Patient ID</span>
                  <span className="font-mono text-slate-700">{selectedPreviewDoc.patientId}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Authorized By</span>
                  <span className="text-slate-900">Dr. {selectedPreviewDoc.doctorName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Date</span>
                  <span className="text-slate-700">{formatDateDhaka(selectedPreviewDoc.createdAt)}</span>
                </div>
              </div>

              {/* Simulated High-Res Document Viewer Display */}
              <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 bg-slate-50 flex flex-col items-center justify-center text-center space-y-3 relative overflow-hidden">
                <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-[#0DA54F] flex items-center justify-center">
                  {selectedPreviewDoc.category === 'Before-After Photos' ? (
                    <ImageIcon className="w-8 h-8" />
                  ) : (
                    <FileText className="w-8 h-8" />
                  )}
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">{selectedPreviewDoc.title}</h4>
                  <p className="text-[11px] text-slate-500 mt-1 max-w-md">
                    {selectedPreviewDoc.clinicalNotes ||
                      'Protected clinical attachment stored in encrypted AES-256 cloud repository.'}
                  </p>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <span className="px-2.5 py-1 rounded bg-slate-200 text-slate-700 font-mono font-bold text-[10px]">
                    {selectedPreviewDoc.fileFormat} · {selectedPreviewDoc.fileSize}
                  </span>
                  {selectedPreviewDoc.signedByPatient && (
                    <span className="px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px] flex items-center gap-1">
                      <CheckCircle className="w-3 h-3 text-[#0DA54F]" />
                      <span>E-Signature Authenticated</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Legal Compliance Footer Notice */}
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-2 text-[11px] text-amber-900">
                <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <p>
                  <strong>Clinical Privacy Protected:</strong> Medical photography and diagnostic records are
                  restricted to authorized clinical practitioners under the Bangladesh Medical & Dental Council
                  (BMDC) and international aesthetic privacy guidelines.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs shrink-0">
              <button
                onClick={() => setSelectedPreviewDoc(null)}
                className="px-4 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-200 transition-colors font-semibold"
              >
                Close Preview
              </button>

              <button
                onClick={() => {
                  addToast({
                    type: 'success',
                    title: 'Downloading file',
                    description: `${selectedPreviewDoc.documentCode} downloaded.`,
                  });
                }}
                className="px-4 py-1.5 bg-[#0DA54F] hover:bg-[#0b8841] text-white rounded-lg font-semibold flex items-center gap-1.5 shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Attachment</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload New Clinical File Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden my-8">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Upload className="w-4 h-4 text-[#0DA54F]" />
                <h3 className="font-bold text-sm">
                  {isBn ? 'নতুন ক্লিনিক্যাল ফাইল সংযুক্তি' : 'Upload Clinical Document'}
                </h3>
              </div>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateDocument} className="p-6 space-y-4 text-xs">
              {/* Patient Selector */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isBn ? 'রোগী নির্বাচন করুন *' : 'Select Patient *'}
                </label>
                <select
                  value={uploadPatientId}
                  onChange={(e) => setUploadPatientId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                >
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.patientIdCode || p.id}) - {p.phone}
                    </option>
                  ))}
                </select>
              </div>

              {/* Category */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isBn ? 'ফাইলের ধরণ / ক্যাটাগরি *' : 'Document Category *'}
                </label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value as any)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                >
                  <option value="Before-After Photos">Before-After Photos (ক্লিনিক্যাল ছবি)</option>
                  <option value="Informed Consent">Informed Consent (আইনি সম্মতিপত্র)</option>
                  <option value="Lab & Biopsy">Lab & Biopsy (ল্যাব ও বায়োপসি রিপোর্ট)</option>
                  <option value="Patch Test">Patch Test (লেজার প্যাচ টেস্ট)</option>
                </select>
              </div>

              {/* Title */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isBn ? 'ডকুমেন্টের শিরোনাম *' : 'Document Title *'}
                </label>
                <input
                  type="text"
                  required
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="e.g. Fractional CO2 Laser Pre-Op Assessment Baseline"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                />
              </div>

              {/* Associated Procedure */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isBn ? 'সম্পর্কিত প্রসিডিউর' : 'Associated Aesthetic Procedure'}
                </label>
                <input
                  type="text"
                  value={uploadProcedure}
                  onChange={(e) => setUploadProcedure(e.target.value)}
                  placeholder="e.g. Fractional CO2 Laser Resurfacing"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isBn ? 'ক্লিনিক্যাল নোট বা পর্যবেক্ষণ' : 'Clinical Notes & Findings'}
                </label>
                <textarea
                  rows={2}
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                  placeholder="Enter notes on tissue reaction, energy fluence, or consent confirmation..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                />
              </div>

              {/* Signed check */}
              <label className="flex items-center gap-2 text-slate-700 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={uploadSigned}
                  onChange={(e) => setUploadSigned(e.target.checked)}
                  className="rounded text-[#0DA54F] focus:ring-[#0DA54F]"
                />
                <span className="font-medium">
                  {isBn
                    ? 'রোগী কর্তৃক আইনি ডিজিটাল স্বাক্ষর গৃহীত হয়েছে'
                    : 'Patient has confirmed digital signature'}
                </span>
              </label>

              {/* Form Buttons */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-[#0DA54F] hover:bg-[#0b8841] text-white rounded-lg font-bold shadow-xs flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Uploading...' : 'Save & Attach to EMR'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
