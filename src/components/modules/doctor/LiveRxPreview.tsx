import React, { useState } from 'react';
import { Printer } from 'lucide-react';
import type { Patient, User, Branch, Prescription } from '../../../types/index.ts';
import type { RxMedicineDraft } from './consultationPresets.ts';
import { PrescriptionSheetTemplate } from './PrescriptionSheetTemplate.tsx';

interface LiveRxPreviewProps {
  doctor: User | null;
  branch: Branch | undefined;
  patient: Patient | null;
  diagnosis: string;
  chiefComplaints: string;
  pastHistory?: string;
  operationHistory?: string;
  investigations: string;
  hydration?: string;
  pigmentation?: string;
  fitzpatrickType: string;
  skinType: string;
  targetZones: string[];
  examinationSummary: string;
  recommendedProcedures: string[];
  medicines: RxMedicineDraft[];
  adviceList: string[];
  planNotes: string;
  nextSessionDate: string;
  includeLifestylePage: boolean;
  waterLiters: number;
  sunInstructions: string;
  sunInstructionsBn: string;
  morningRoutine: string[];
  eveningRoutine: string[];
  recommendedFoods: string[];
  prohibitedFoods: string[];
  finalizedPrescription: Prescription | null;
  onOpenPrint: () => void;
}

export const LiveRxPreview: React.FC<LiveRxPreviewProps> = ({
  doctor,
  patient,
  diagnosis,
  chiefComplaints,
  pastHistory,
  operationHistory,
  investigations,
  hydration,
  pigmentation,
  skinType,
  recommendedProcedures,
  medicines,
  adviceList,
  planNotes,
  nextSessionDate,
  includeLifestylePage,
  waterLiters,
  sunInstructions,
  sunInstructionsBn,
  morningRoutine,
  eveningRoutine,
  recommendedFoods,
  prohibitedFoods,
  finalizedPrescription,
  onOpenPrint,
}) => {
  const [previewPage, setPreviewPage] = useState<'rx' | 'lifestyle'>('rx');
  const todayStr = new Date().toISOString().split('T')[0];

  const sheetData = {
    prescriptionCode: finalizedPrescription?.prescriptionCode || 'RX-DRAFT',
    patientCode: patient?.patientIdCode || 'SX-PENDING',
    patientName: patient?.name || '',
    patientAge: patient?.age,
    patientGender: patient?.gender,
    patientPhone: patient?.phone,
    patientAddress: patient?.address || patient?.city,
    dateStr: finalizedPrescription?.createdAt || todayStr,
    hydrationLevel: hydration?.trim() || 'Normal-Hydrated',
    pigmentationLevel: pigmentation?.trim() || `${skinType ? skinType.charAt(0).toUpperCase() + skinType.slice(1) : 'Assessed'}`,
    chiefComplaints,
    pastHistory,
    operationHistory,
    investigations,
    diagnosis,
    procedures: recommendedProcedures,
    medicines,
    adviceList,
    planNotes,
    nextSessionDate,
    doctorName: doctor?.name || 'Dr. Nusrat Jahan',
    doctorCredentials: doctor?.bmdcRegNo ? `BMDC-${doctor.bmdcRegNo}` : undefined,
    includeLifestylePage,
    waterLiters,
    sunInstructions,
    sunInstructionsBn,
    morningRoutine,
    eveningRoutine,
    recommendedFoods,
    prohibitedFoods,
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col">
      {/* Preview Panel Header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-slate-800 whitespace-nowrap">Live preview</span>
          {finalizedPrescription && (
            <span className="text-[11px] font-mono text-[#0DA54F] font-semibold truncate tabular-nums">
              {finalizedPrescription.prescriptionCode}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {includeLifestylePage && (
            <div className="flex items-center bg-slate-200/70 p-0.5 rounded-lg text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setPreviewPage('rx')}
                className={`px-2 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  previewPage === 'rx' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Page 1 · Rx
              </button>
              <button
                type="button"
                onClick={() => setPreviewPage('lifestyle')}
                className={`px-2 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  previewPage === 'lifestyle'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Page 2 · Care
              </button>
            </div>
          )}

          {finalizedPrescription && (
            <button
              type="button"
              onClick={onOpenPrint}
              className="px-2.5 py-1.5 rounded-lg bg-[#0DA54F] hover:bg-[#0a8740] text-white text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
              title="Open A4 Print & Download Sheet"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
          )}
        </div>
      </div>

      {/* Paper Canvas matching official SUOXI Clinical Prescription Sheet */}
      <div className="p-3 bg-slate-100/80">
        <div className="rounded-lg border border-slate-200 shadow-xs overflow-hidden bg-white">
          <PrescriptionSheetTemplate
            data={sheetData}
            variant="preview"
            activePage={previewPage}
          />
        </div>
      </div>
    </div>
  );
};
