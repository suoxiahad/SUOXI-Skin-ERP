import React, { useEffect, useRef, useState } from 'react';
import { X, Printer, Download } from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';
import { api } from '../../../api/client.ts';
import type { Prescription } from '../../../types/index.ts';
import { PrescriptionSheetTemplate, type PrescriptionSheetData } from './PrescriptionSheetTemplate.tsx';

export const PrescriptionPrintView: React.FC = () => {
  const { activePrescriptionPrintId, setActivePrescriptionPrintId, addToast } = useApp();
  const [prescription, setPrescription] = useState<Prescription | null>(null);
  const sheetContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activePrescriptionPrintId) {
      setPrescription(null);
      return;
    }
    api.prescriptions.list().then((list) => {
      const found = list.find((p) => p.id === activePrescriptionPrintId);
      if (found) setPrescription(found);
    });
  }, [activePrescriptionPrintId]);

  if (!activePrescriptionPrintId || !prescription) return null;

  const lifestyle = prescription.lifestyleGuidance;

  const sheetData: PrescriptionSheetData = {
    prescriptionCode: prescription.prescriptionCode,
    patientCode: prescription.patientCode || prescription.patientId,
    patientName: prescription.patientName,
    patientAge: prescription.patientAge,
    patientGender: prescription.patientGender,
    patientPhone: prescription.patientPhone,
    patientAddress: prescription.patientAddress,
    dateStr: prescription.createdAt,
    hydrationLevel: prescription.skinAnalysis?.hydration || 'Normal-Hydrated',
    pigmentationLevel: prescription.skinAnalysis?.pigmentation || 'Assessed',
    chiefComplaints: prescription.chiefComplaints,
    pastHistory: prescription.pastHistory,
    operationHistory: prescription.operationHistory,
    investigations: prescription.investigations,
    diagnosis: prescription.diagnosis,
    procedures: prescription.recommendedProcedures || [],
    medicines: prescription.medicines || [],
    adviceList: prescription.adviceList || [],
    planNotes: prescription.planNotes,
    nextSessionDate: prescription.nextSessionDate,
    doctorName: prescription.doctorName,
    doctorCredentials: prescription.doctorCredentials,
    includeLifestylePage: Boolean(lifestyle),
    waterLiters: lifestyle?.waterIntakeLiters,
    sunInstructions: lifestyle?.sunProtectionInstructions,
    sunInstructionsBn: lifestyle?.sunProtectionInstructionsBn,
    morningRoutine: lifestyle?.skincareRoutineMorning,
    eveningRoutine: lifestyle?.skincareRoutineEvening,
    recommendedFoods: lifestyle?.recommendedFoods,
    prohibitedFoods: lifestyle?.prohibitedFoods,
  };

  const handleDownloadHtml = () => {
    if (!sheetContainerRef.current) return;
    const styleLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((el) => el.outerHTML)
      .join('\n');

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>SUOXI Prescription - ${prescription.prescriptionCode}</title>
  ${styleLinks}
  <style>
    @page { size: A4 portrait; margin: 8mm; }
    body { background: #ffffff !important; margin: 0; padding: 16px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .rx-doc-wrap { max-width: 820px; margin: 0 auto; background: #ffffff; }
    @media print { body { padding: 0; } .rx-doc-wrap { max-width: 100%; } .page-break-before { page-break-before: always; break-before: page; } }
  </style>
</head>
<body>
  <div class="rx-doc-wrap">
    ${sheetContainerRef.current.innerHTML}
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SUOXI-${prescription.prescriptionCode}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    addToast({
      type: 'success',
      title: `Downloaded ${prescription.prescriptionCode}`,
      description: 'Standalone printable prescription sheet saved to your device.',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto print-modal-root">
      <div className="relative w-full max-w-[840px] bg-white rounded-xl shadow-2xl border border-slate-300 overflow-hidden my-6 print-page">
        {/* Print / Download / Close Toolbar (hidden during actual printing) */}
        <div className="no-print flex flex-wrap items-center justify-between gap-2 px-5 py-3 bg-slate-100 border-b border-slate-200 sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <span className="font-bold text-xs text-slate-800">
              SUO XI Clinical Prescription (A4)
            </span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white text-slate-600 border border-slate-200 tabular-nums">
              {prescription.prescriptionCode} · v{prescription.version}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadHtml}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Download</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0DA54F] hover:bg-[#0a8740] rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF (A4)</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePrescriptionPrintId(null)}
              className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-200 cursor-pointer"
              aria-label="Close print preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Exact A4 Printable Sheet */}
        <div ref={sheetContainerRef} className="bg-white">
          <PrescriptionSheetTemplate data={sheetData} variant="print" />
        </div>
      </div>
    </div>
  );
};
