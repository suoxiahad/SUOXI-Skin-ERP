import React, { useEffect, useState } from 'react';
import {
  FileText,
  Download,
  Calendar,
  User,
  Pill,
  Apple,
  AlertCircle,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';
import type { PortalPrescriptionDto } from '@suoxi/shared-types';
import { portalApi } from '../api/portalClient.js';
import { usePortalAuth } from '../context/PortalAuthContext.js';

export const PortalPrescriptionsView: React.FC = () => {
  const { language } = usePortalAuth();
  const [prescriptions, setPrescriptions] = useState<PortalPrescriptionDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setIsLoading(true);
        const list = await portalApi.getPrescriptions();
        if (mounted) setPrescriptions(list);
      } catch (err: any) {
        if (mounted) setError(err.message || 'Failed to load prescriptions');
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleDownloadPdf = (rxId: string, rxNumber: string) => {
    const url = portalApi.getPrescriptionPdfUrl(rxId);
    const link = document.createElement('a');
    link.href = url;
    link.download = `prescription-${rxNumber}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4 pb-6">
      {/* View Header */}
      <div>
        <h2 className="text-lg font-bold text-slate-800">
          {language === 'bn' ? 'প্রেসক্রিপশন ও ওষুধের তালিকা' : 'Clinical Prescriptions'}
        </h2>
        <p className="text-xs text-slate-500">
          {language === 'bn'
            ? 'চূড়ান্ত অনুমোদিত প্রেসক্রিপশন, নির্দেশনাবলী এবং জীবনযাত্রার পরামর্শ'
            : 'Finalized medical prescriptions, medication guidelines & lifestyle care'}
        </p>
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-3">
          <div className="h-44 bg-white rounded-2xl animate-pulse border border-slate-100" />
          <div className="h-44 bg-white rounded-2xl animate-pulse border border-slate-100" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && prescriptions.length === 0 && (
        <div className="p-8 text-center bg-white rounded-2xl border border-slate-100 shadow-2xs space-y-2">
          <FileText className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="font-semibold text-xs text-slate-700">
            {language === 'bn' ? 'কোনো প্রকাশিত প্রেসক্রিপশন নেই' : 'No prescriptions found'}
          </p>
          <p className="text-[11px] text-slate-400">
            {language === 'bn'
              ? 'ডাক্তারের পরামর্শ ও সেশন সম্পন্ন হওয়ার পর চূড়ান্ত প্রেসক্রিপশন এখানে দেখা যাবে।'
              : 'Finalized clinical prescriptions will appear here once published by your doctor.'}
          </p>
        </div>
      )}

      {/* Prescriptions List */}
      {!isLoading &&
        !error &&
        prescriptions.map((rx) => (
          <div
            key={rx.id}
            className="p-5 rounded-2xl bg-white border border-slate-100 shadow-2xs space-y-4"
          >
            {/* Header info */}
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-mono font-bold text-emerald-800 tracking-wider bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                  {rx.prescriptionNumber}
                </span>
                <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-500">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>{rx.date}</span>
                </div>
              </div>

              {/* Download PDF Button (44px min touch target) */}
              <button
                type="button"
                onClick={() => handleDownloadPdf(rx.id, rx.prescriptionNumber)}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{language === 'bn' ? 'পিডিএফ ডাউনলোড' : 'PDF'}</span>
              </button>
            </div>

            {/* Doctor info & Diagnosis */}
            <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-1 text-slate-700">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                <User className="w-3.5 h-3.5 text-slate-500" />
                <span>{rx.doctorName}</span>
                {rx.doctorDesignation && (
                  <span className="text-[11px] text-slate-500 font-normal">
                    • {rx.doctorDesignation}
                  </span>
                )}
              </div>
              {rx.diagnosisSummary && (
                <p className="text-[11px] text-slate-600">
                  <span className="font-semibold">{language === 'bn' ? 'রোগ নির্ণয়: ' : 'Diagnosis: '}</span>
                  {rx.diagnosisSummary}
                </p>
              )}
            </div>

            {/* Medications List */}
            {rx.medications.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <Pill className="w-3.5 h-3.5 text-emerald-700" />
                  <span>{language === 'bn' ? 'ঔষধ নির্দেশিকা' : 'Prescribed Medications'}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {rx.medications.map((med, idx) => (
                    <div key={idx} className="py-2.5 text-xs space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">{med.name}</span>
                        <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                          {med.dosage}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600">{med.instructions}</p>
                      {med.duration && (
                        <p className="text-[10px] text-slate-400">
                          {language === 'bn' ? 'মেয়াদ: ' : 'Duration: '}
                          {med.duration}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* General Advice */}
            {rx.advice && (
              <div className="p-3 bg-amber-50/60 border border-amber-100 rounded-xl text-xs text-amber-950 space-y-1">
                <span className="font-bold text-amber-900 block">
                  {language === 'bn' ? 'বিশেষ পরামর্শ:' : 'Clinical Advice:'}
                </span>
                <p className="text-[11px] leading-relaxed text-amber-900/90">{rx.advice}</p>
              </div>
            )}

            {/* Attached Food & Lifestyle Guide */}
            {rx.lifestyleGuidance && (
              <div className="p-4 rounded-xl bg-teal-50/70 border border-teal-100 text-xs text-teal-950 space-y-3">
                <div className="flex items-center gap-1.5 font-bold text-teal-900">
                  <Apple className="w-4 h-4 text-emerald-700" />
                  <span>
                    {language === 'bn'
                      ? `খাদ্য ও জীবনযাত্রা নির্দেশিকা: ${rx.lifestyleGuidance.title}`
                      : `Food & Lifestyle Guide: ${rx.lifestyleGuidance.title}`}
                  </span>
                </div>

                {rx.lifestyleGuidance.foodsToEat && rx.lifestyleGuidance.foodsToEat.length > 0 && (
                  <div>
                    <span className="text-[11px] font-bold text-emerald-800 block mb-1">
                      {language === 'bn' ? 'যেসব খাবার খাওয়া উপকারী:' : 'Beneficial Foods to Eat:'}
                    </span>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px] text-teal-950">
                      {rx.lifestyleGuidance.foodsToEat.map((food, fIdx) => (
                        <li key={fIdx}>{food}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {rx.lifestyleGuidance.foodsToAvoid && rx.lifestyleGuidance.foodsToAvoid.length > 0 && (
                  <div>
                    <span className="text-[11px] font-bold text-rose-800 block mb-1">
                      {language === 'bn' ? 'যেসব খাবার পরিহার করবেন:' : 'Foods to Avoid:'}
                    </span>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px] text-teal-950">
                      {rx.lifestyleGuidance.foodsToAvoid.map((food, fIdx) => (
                        <li key={fIdx}>{food}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
    </div>
  );
};
