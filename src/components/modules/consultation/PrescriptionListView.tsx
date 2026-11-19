import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Search,
  Printer,
  Calendar,
  User,
  Phone,
  Stethoscope,
  Clock,
  Sparkles,
  ShieldCheck,
  CheckCircle,
  Copy,
  ExternalLink,
  Filter,
  Eye,
  Send,
  X,
  Droplet,
  Sun,
  Pill,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';
import { api } from '../../../api/client.ts';
import type { Prescription } from '../../../types/index.ts';
import { formatDateDhaka } from '../../../utils/format.ts';
import { TableSkeleton } from '../../common/Skeleton.tsx';
import { EmptyState } from '../../common/EmptyState.tsx';
import { PrescriptionSheetTemplate } from '../doctor/PrescriptionSheetTemplate.tsx';

export const PrescriptionListView: React.FC = () => {
  const { language, addToast, setActivePrescriptionPrintId, navigate } = useApp();
  const isBn = language === 'bn';

  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState('all');
  const [activeModalRx, setActiveModalRx] = useState<Prescription | null>(null);

  // Fetch prescriptions
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    api.prescriptions
      .list()
      .then((data) => {
        if (isMounted) {
          setPrescriptions(data || []);
        }
      })
      .catch((err) => {
        console.error('Failed to load prescriptions:', err);
        addToast({
          type: 'error',
          title: isBn ? 'প্রেসক্রিপশন লোড ব্যর্থ' : 'Failed to load prescriptions',
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

  // Unique doctors for filter
  const doctorsList = useMemo(() => {
    const docSet = new Set<string>();
    prescriptions.forEach((rx) => {
      if (rx.doctorName) docSet.add(rx.doctorName);
    });
    return Array.from(docSet);
  }, [prescriptions]);

  // Filtered list: Search by Patient ID, Phone, Name, or Rx Code
  const filteredPrescriptions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return prescriptions.filter((rx) => {
      const matchSearch =
        !q ||
        rx.prescriptionCode.toLowerCase().includes(q) ||
        rx.patientName.toLowerCase().includes(q) ||
        (rx.patientId && rx.patientId.toLowerCase().includes(q)) ||
        (rx.diagnosis && rx.diagnosis.toLowerCase().includes(q)) ||
        (rx.medicines &&
          rx.medicines.some(
            (m) =>
              m.name.toLowerCase().includes(q) ||
              (m.genericName && m.genericName.toLowerCase().includes(q))
          ));

      const matchDoctor = selectedDoctor === 'all' || rx.doctorName === selectedDoctor;
      return matchSearch && matchDoctor;
    });
  }, [prescriptions, searchQuery, selectedDoctor]);

  const handleCopyRxSummary = (rx: Prescription) => {
    const summary = `SUOXI Aesthetic Clinic - Prescription ${rx.prescriptionCode}\nPatient: ${rx.patientName} (${rx.patientAge || 'N/A'}y, ${rx.patientGender || ''})\nDoctor: ${rx.doctorName}\nDiagnosis: ${rx.diagnosis}\nNext Session: ${rx.nextSessionDate || 'To be decided'}\nTotal Medicines: ${rx.medicines.length}`;
    navigator.clipboard.writeText(summary);
    addToast({
      type: 'success',
      title: isBn ? 'প্রেসক্রিপশন সামারি কপি হয়েছে' : 'Prescription Summary Copied',
      description: isBn
        ? 'রোগীর মোবাইলে এসএমএস বা হোয়াটসঅ্যাপে পাঠানোর জন্য ক্লিপবোর্ডে কপি করা হয়েছে।'
        : 'Summary text copied to clipboard for patient dispatch.',
    });
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#0DA54F] to-[#0a8740] flex items-center justify-center text-white shadow-sm shrink-0">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {isBn ? 'প্রেসক্রিপশন তালিকা ও আরএক্স সংরক্ষণাগার' : 'Prescription Directory & Rx Archives'}
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-emerald-100 text-[#0DA54F] border border-emerald-200">
                BMDC Verified
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                Dual Language (EN/BN)
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {isBn
                ? 'পেশেন্ট আইডি, মোবাইল নম্বর ও প্রেসক্রিপশন কোড দিয়ে যেকোনো প্রেসক্রিপশন সহজেই খুঁজুন এবং প্রিন্ট করুন'
                : 'Search, filter, view, print and dispatch verified clinical prescriptions, topical regimens, and lifestyle care directives.'}
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate('/consultation/desk')}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0DA54F] hover:bg-[#0b8841] text-white rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer self-start md:self-auto shrink-0"
        >
          <Stethoscope className="w-4 h-4" />
          <span>{isBn ? 'নতুন প্রেসক্রিপশন তৈরি (ডেস্ক)' : 'Create Prescription (Desk)'}</span>
        </button>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                isBn
                  ? 'পেশেন্ট আইডি (SX-...), মোবাইল নম্বর, রোগীর নাম বা আরএক্স কোড দিয়ে খুঁজুন...'
                  : 'Search by Patient ID (SX-...), mobile number, patient name, or Rx code...'
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

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 shrink-0">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <span>{isBn ? 'ডাক্তার:' : 'Doctor:'}</span>
              <select
                value={selectedDoctor}
                onChange={(e) => setSelectedDoctor(e.target.value)}
                className="bg-transparent font-medium text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="all">{isBn ? 'সকল ডাক্তার' : 'All Doctors'}</option>
                {doctorsList.map((doc) => (
                  <option key={doc} value={doc}>
                    {doc}
                  </option>
                ))}
              </select>
            </div>

            <div className="px-3 py-1.5 bg-emerald-50 text-[#0DA54F] font-bold text-xs rounded-lg border border-emerald-200/80 shrink-0">
              <span>{filteredPrescriptions.length}</span>{' '}
              <span className="font-normal text-[11px] text-emerald-800">
                {isBn ? 'প্রেসক্রিপশন' : 'Prescriptions'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Prescriptions List / Table */}
      {isLoading ? (
        <TableSkeleton rows={4} cols={5} />
      ) : filteredPrescriptions.length === 0 ? (
        <EmptyState
          title={isBn ? 'কোনো প্রেসক্রিপশন পাওয়া যায়নি' : 'No Prescriptions Found'}
          description={
            searchQuery
              ? isBn
                ? `"${searchQuery}" এর সাথে মিলে এমন কোনো প্রেসক্রিপশন পাওয়া যায়নি।`
                : `No prescription matching "${searchQuery}". Try a different keyword.`
              : isBn
              ? 'এখনো কোনো প্রেসক্রিপশন রেকর্ড তৈরি করা হয়নি।'
              : 'No prescription records created yet.'
          }
          actionLabel={isBn ? 'কনসালটেশন ডেস্কে যান' : 'Go to Consultation Desk'}
          onAction={() => navigate('/consultation/desk')}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredPrescriptions.map((rx) => (
            <div
              key={rx.id}
              className="bg-white rounded-xl border border-slate-200 hover:border-emerald-300 shadow-xs hover:shadow-md transition-all duration-200 p-4 flex flex-col justify-between group"
            >
              <div>
                {/* Card Header: Rx Code & Date */}
                <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-[#0DA54F] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {rx.prescriptionCode}
                      </span>
                      {rx.isFinalized && (
                        <span className="flex items-center gap-1 text-[10px] text-slate-500 font-medium">
                          <ShieldCheck className="w-3 h-3 text-[#0DA54F]" />
                          <span>Finalized v{rx.version}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{formatDateDhaka(rx.createdAt)}</span>
                    </p>
                  </div>

                  <button
                    onClick={() => handleCopyRxSummary(rx)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                    title="Copy Rx Summary"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Patient Information */}
                <div className="py-3 border-b border-slate-100 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-sm">{rx.patientName}</span>
                    <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      {rx.patientId}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    {rx.patientAge && <span>{rx.patientAge} years</span>}
                    {rx.patientGender && <span>· {rx.patientGender}</span>}
                  </div>
                </div>

                {/* Diagnosis & Doctor */}
                <div className="py-3 space-y-2 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                      {isBn ? 'ক্লিনিক্যাল ডায়াগনোসিস' : 'Clinical Diagnosis'}
                    </span>
                    <p className="font-semibold text-slate-800 line-clamp-1 mt-0.5">{rx.diagnosis}</p>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                      <Stethoscope className="w-3 h-3" />
                    </div>
                    <div className="truncate">
                      <p className="font-medium text-slate-800 truncate text-[11px]">{rx.doctorName}</p>
                      <p className="text-[10px] text-slate-400 truncate">{rx.doctorCredentials}</p>
                    </div>
                  </div>

                  {/* Medicines Pill summary */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                      <span className="flex items-center gap-1 font-medium">
                        <Pill className="w-3 h-3 text-[#0DA54F]" />
                        <span>{rx.medicines?.length || 0} Medications / Regimens</span>
                      </span>
                      {rx.nextSessionDate && (
                        <span className="text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">
                          Review: {rx.nextSessionDate}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {rx.medicines?.slice(0, 2).map((med, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-50 rounded px-2 py-1 text-[11px] flex items-center justify-between text-slate-700"
                        >
                          <span className="font-medium truncate mr-2">{med.name}</span>
                          <span className="text-[10px] text-slate-500 shrink-0">{med.dosage}</span>
                        </div>
                      ))}
                      {(rx.medicines?.length || 0) > 2 && (
                        <p className="text-[10px] text-slate-400 text-right">
                          + {(rx.medicines?.length || 0) - 2} more items
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 mt-2">
                <button
                  onClick={() => setActiveModalRx(rx)}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-slate-600" />
                  <span>{isBn ? 'সম্পূর্ণ দেখুন' : 'View Full Rx'}</span>
                </button>

                <button
                  onClick={() => setActivePrescriptionPrintId(rx.id)}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-[#0DA54F] hover:bg-[#0b8841] text-white rounded-lg text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{isBn ? 'প্রিন্ট / PDF' : 'Print / PDF'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Full Digital Prescription Interactive Modal */}
      {activeModalRx && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-[840px] w-full border border-slate-200 shadow-2xl overflow-hidden my-6 max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#0DA54F] flex items-center justify-center text-white">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm tracking-tight">
                    {isBn ? 'ডিজিটাল প্রেসক্রিপশন প্রিভিউ' : 'SUO XI Prescription Preview'}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono tabular-nums">
                    {activeModalRx.prescriptionCode} · Version {activeModalRx.version}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const id = activeModalRx.id;
                    setActiveModalRx(null);
                    setActivePrescriptionPrintId(id);
                  }}
                  className="px-3.5 py-1.5 bg-[#0DA54F] hover:bg-[#0b8841] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{isBn ? 'প্রিন্ট / ডাউনলোড' : 'Print / Download'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModalRx(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Scrollable Body rendering unified SUOXI Rx sheet */}
            <div className="overflow-y-auto bg-slate-100 p-4">
              <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs">
                <PrescriptionSheetTemplate
                  variant="print"
                  data={{
                    prescriptionCode: activeModalRx.prescriptionCode,
                    patientCode: activeModalRx.patientCode || activeModalRx.patientId,
                    patientName: activeModalRx.patientName,
                    patientAge: activeModalRx.patientAge,
                    patientGender: activeModalRx.patientGender,
                    patientPhone: activeModalRx.patientPhone,
                    patientAddress: activeModalRx.patientAddress,
                    dateStr: activeModalRx.createdAt,
                    hydrationLevel: activeModalRx.skinAnalysis?.hydration || 'Normal-Hydrated',
                    pigmentationLevel: activeModalRx.skinAnalysis?.pigmentation || 'Assessed',
                    chiefComplaints: activeModalRx.chiefComplaints,
                    pastHistory: activeModalRx.pastHistory,
                    operationHistory: activeModalRx.operationHistory,
                    investigations: activeModalRx.investigations,
                    diagnosis: activeModalRx.diagnosis,
                    procedures: activeModalRx.recommendedProcedures || [],
                    medicines: activeModalRx.medicines || [],
                    adviceList: activeModalRx.adviceList || [],
                    planNotes: activeModalRx.planNotes,
                    nextSessionDate: activeModalRx.nextSessionDate,
                    doctorName: activeModalRx.doctorName,
                    doctorCredentials: activeModalRx.doctorCredentials,
                    includeLifestylePage: Boolean(activeModalRx.lifestyleGuidance),
                    waterLiters: activeModalRx.lifestyleGuidance?.waterIntakeLiters,
                    sunInstructions: activeModalRx.lifestyleGuidance?.sunProtectionInstructions,
                    sunInstructionsBn: activeModalRx.lifestyleGuidance?.sunProtectionInstructionsBn,
                    morningRoutine: activeModalRx.lifestyleGuidance?.skincareRoutineMorning,
                    eveningRoutine: activeModalRx.lifestyleGuidance?.skincareRoutineEvening,
                    recommendedFoods: activeModalRx.lifestyleGuidance?.recommendedFoods,
                    prohibitedFoods: activeModalRx.lifestyleGuidance?.prohibitedFoods,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
