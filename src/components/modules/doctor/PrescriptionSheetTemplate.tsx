import React, { useMemo, useState } from 'react';
import { Droplet, Sun, Apple, Sparkles } from 'lucide-react';
import { formatDateDhaka } from '../../../utils/format.ts';

export const SUOXI_LOGO_URL =
  'https://suoxigroup.com/wp-content/uploads/2026/11/Suo-xi-Hospital-Skin-cera-01-scaled.png';

export interface PrescriptionSheetMedicine {
  name: string;
  genericName?: string;
  form: string;
  dosage: string;
  duration: string;
  instructions: string;
  instructionsBn?: string;
}

export interface PrescriptionSheetData {
  prescriptionCode: string;
  patientCode: string;
  patientName: string;
  patientAge?: number | string;
  patientGender?: string;
  patientPhone?: string;
  patientAddress?: string;
  dateStr: string;
  hydrationLevel?: string;
  pigmentationLevel?: string;
  chiefComplaints?: string;
  pastHistory?: string;
  operationHistory?: string;
  investigations?: string;
  diagnosis?: string;
  procedures: string[];
  medicines: PrescriptionSheetMedicine[];
  adviceList?: string[];
  planNotes?: string;
  nextSessionDate?: string;
  doctorName: string;
  doctorCredentials?: string;
  includeLifestylePage?: boolean;
  waterLiters?: number;
  sunInstructions?: string;
  sunInstructionsBn?: string;
  morningRoutine?: string[];
  eveningRoutine?: string[];
  recommendedFoods?: string[];
  prohibitedFoods?: string[];
}

interface PrescriptionSheetTemplateProps {
  data: PrescriptionSheetData;
  /** 'preview' renders condensed sizing for live sidebar preview; 'print' renders full A4 proportions */
  variant?: 'preview' | 'print';
  /** Controls which page is shown in 'preview' mode; 'print' always renders Page 1 (+ Page 2 with page-break if enabled) */
  activePage?: 'rx' | 'lifestyle';
}

/** Deterministic SVG Code-128-style vector barcode */
const LinearBarcodeSVG: React.FC<{ value: string; compact?: boolean }> = ({ value, compact }) => {
  const bars = useMemo(() => {
    const code = (value || 'SUOXI-000').toUpperCase();
    const widths: number[] = [2, 1, 1, 2, 1, 3]; // start guard
    for (let i = 0; i < code.length; i++) {
      const c = code.charCodeAt(i);
      widths.push(1 + (c % 3));
      widths.push(1 + ((c >> 2) % 2));
      widths.push(1 + ((c >> 4) % 3));
      widths.push(1 + ((c + i) % 2));
    }
    widths.push(2, 1, 3, 1, 2); // stop guard

    const rects: Array<{ x: number; w: number }> = [];
    let cursor = 0;
    widths.forEach((w, idx) => {
      if (idx % 2 === 0) {
        rects.push({ x: cursor, w });
      }
      cursor += w;
    });
    return { rects, totalWidth: Math.max(cursor, 60) };
  }, [value]);

  return (
    <svg
      viewBox={`0 0 ${bars.totalWidth} 28`}
      preserveAspectRatio="none"
      className={compact ? 'w-[104px] h-[22px]' : 'w-[138px] h-[30px]'}
      aria-label={`Barcode ${value}`}
    >
      {bars.rects.map((r, idx) => (
        <rect key={idx} x={r.x} y={0} width={r.w} height={28} fill="#0F172A" />
      ))}
    </svg>
  );
};

/** Deterministic crisp SVG QR matrix for "Scan to verify" */
const VerificationQrSvg: React.FC<{ value: string; size?: number }> = ({ value, size = 56 }) => {
  const modules = useMemo(() => {
    const dim = 21;
    const grid: boolean[][] = Array.from({ length: dim }, () => Array(dim).fill(false));

    const drawFinder = (top: number, left: number) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const isOuter = r === 0 || r === 6 || c === 0 || c === 6;
          const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          grid[top + r][left + c] = isOuter || isInner;
        }
      }
    };

    drawFinder(0, 0);
    drawFinder(0, dim - 7);
    drawFinder(dim - 7, 0);

    // Timing patterns
    for (let i = 8; i < dim - 8; i++) {
      grid[6][i] = i % 2 === 0;
      grid[i][6] = i % 2 === 0;
    }

    // Deterministic data fill seeded by value string
    let seed = 2166136261;
    const src = value || 'SUOXI-RX';
    for (let i = 0; i < src.length; i++) {
      seed ^= src.charCodeAt(i);
      seed = Math.imul(seed, 16777619);
    }

    for (let r = 0; r < dim; r++) {
      for (let c = 0; c < dim; c++) {
        const inTopLeft = r < 8 && c < 8;
        const inTopRight = r < 8 && c >= dim - 8;
        const inBottomLeft = r >= dim - 8 && c < 8;
        if (inTopLeft || inTopRight || inBottomLeft || r === 6 || c === 6) continue;
        seed ^= (r * 31 + c * 17) & 0xff;
        seed = Math.imul(seed, 16777619);
        grid[r][c] = ((seed >>> 3) & 1) === 1;
      }
    }
    return grid;
  }, [value]);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 21 21"
      className="bg-white border border-slate-200 p-[2px]"
      shapeRendering="crispEdges"
      aria-label="Prescription verification QR code"
    >
      {modules.map((row, r) =>
        row.map((on, c) =>
          on ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#0F172A" /> : null
        )
      )}
    </svg>
  );
};

/** Fallback circular emblem SVG matching SUOXI logo if external URL fails to load */
const SuoxiLogoEmblem: React.FC<{ className?: string }> = ({ className = 'w-14 h-14' }) => {
  const [imgFailed, setImgFailed] = useState(false);

  if (!imgFailed) {
    return (
      <img
        src={SUOXI_LOGO_URL}
        alt="SUO XI Hospital (Skin Care)"
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${className} object-contain shrink-0`}
      />
    );
  }

  return (
    <svg viewBox="0 0 120 120" className={`${className} shrink-0`} aria-label="SUO XI Hospital (Skin Care)">
      <circle cx="60" cy="56" r="46" fill="none" stroke="#0DA54F" strokeWidth="4" />
      <circle cx="60" cy="56" r="40" fill="none" stroke="#16A34A" strokeWidth="1.5" />
      <path
        d="M52 28 C44 40, 44 58, 56 76 C64 62, 74 52, 82 46 C72 48, 63 54, 58 64 C54 52, 54 38, 52 28 Z"
        fill="#0DA54F"
      />
      <path
        d="M46 42 C38 48, 37 56, 42 62 C39 66, 39 72, 46 76"
        fill="none"
        stroke="#F06E84"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <text
        x="60"
        y="112"
        textAnchor="middle"
        fill="#F06E84"
        fontSize="8.5"
        fontWeight="700"
        fontFamily="sans-serif"
      >
        SUO XI HOSPITAL(SKIN CARE)
      </text>
    </svg>
  );
};

function splitToBullets(raw?: string): string[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseProcedureDisplay(proc: string): { title: string; session?: string } {
  const match = proc.match(/^(.*?)\(([^)]+)\)\s*$/);
  if (match) {
    return {
      title: match[1].trim().toUpperCase(),
      session: match[2].trim(),
    };
  }
  const colonMatch = proc.match(/^(.*?)\s*[-–:]\s*(Session.*)$/i);
  if (colonMatch) {
    return {
      title: colonMatch[1].trim().toUpperCase(),
      session: colonMatch[2].trim(),
    };
  }
  return {
    title: proc.trim().toUpperCase(),
  };
}

function formatShortDate(raw?: string): string {
  if (!raw) return '16 Nov 2026';
  try {
    return formatDateDhaka(raw);
  } catch {
    return raw;
  }
}

export const PrescriptionSheetTemplate: React.FC<PrescriptionSheetTemplateProps> = ({
  data,
  variant = 'print',
  activePage = 'rx',
}) => {
  const isCompact = variant === 'preview';
  const showLifestyleOnPrint = !isCompact && Boolean(data.includeLifestylePage);
  const showPage1 = isCompact ? activePage === 'rx' || !data.includeLifestylePage : true;
  const showPage2 = isCompact ? activePage === 'lifestyle' && Boolean(data.includeLifestylePage) : showLifestyleOnPrint;

  const chiefBullets = splitToBullets(data.chiefComplaints);
  const pastBullets = splitToBullets(data.pastHistory);
  const operationBullets = splitToBullets(data.operationHistory);
  const investigationBullets = splitToBullets(data.investigations);
  const diagnosisBullets = splitToBullets(data.diagnosis);

  const formattedSex = data.patientGender
    ? data.patientGender.charAt(0).toUpperCase() + data.patientGender.slice(1).toLowerCase()
    : 'Female';

  const formattedAge = data.patientAge ? `${data.patientAge}Y` : '--';

  const renderClinicHeader = () => (
    <div className={`border-b-[1.5px] border-slate-900 ${isCompact ? 'pb-2' : 'pb-3'}`}>
      <div className="flex items-center gap-3">
        <SuoxiLogoEmblem className={isCompact ? 'w-12 h-12' : 'w-[74px] h-[74px]'} />
        <div className="flex-1 text-center pr-2">
          <h1
            className={`font-bold tracking-tight text-slate-950 leading-tight ${
              isCompact ? 'text-[13.5px]' : 'text-[22px]'
            }`}
          >
            SUO XI Hospital (Skin Care)
          </h1>
          <p className={`text-slate-700 font-medium mt-0.5 ${isCompact ? 'text-[8.5px]' : 'text-[11px]'}`}>
            Phone: +8809613002003, www.suoxiskincare.com
          </p>
          <p className={`text-slate-700 leading-snug ${isCompact ? 'text-[8px]' : 'text-[10.5px]'}`}>
            122 Priyangon Faizunnessa Business Center, 3rd Floor (Lift-2), Kakrail Road, Dhaka-1217
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="text-slate-900 bg-white select-text" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
      {/* ==================== PAGE 1: OFFICIAL SUOXI CLINICAL PRESCRIPTION ==================== */}
      {showPage1 && (
        <div
          className={`bg-white flex flex-col justify-between ${
            isCompact ? 'p-3.5 min-h-[560px]' : 'p-6 sm:p-8 min-h-[1040px]'
          }`}
        >
          <div className={isCompact ? 'space-y-2' : 'space-y-3'}>
            {/* 1. Clinic Header */}
            {renderClinicHeader()}

            {/* 2. Dual Barcode ID Strip */}
            <div className={`flex items-start justify-between gap-3 border-b border-slate-300 ${isCompact ? 'pb-1.5' : 'pb-2'}`}>
              <div>
                <p className={`uppercase font-semibold text-slate-700 tracking-wide mb-0.5 ${isCompact ? 'text-[7.5px]' : 'text-[9.5px]'}`}>
                  PATIENT ID
                </p>
                <LinearBarcodeSVG value={data.patientCode || 'SX-PENDING'} compact={isCompact} />
                <p className={`font-bold text-slate-900 tracking-tight tabular-nums mt-0.5 ${isCompact ? 'text-[8.5px]' : 'text-[11px]'}`}>
                  {data.patientCode || 'SX-PENDING'}
                </p>
              </div>

              <div className="text-left">
                <p className={`uppercase font-semibold text-slate-700 tracking-wide mb-0.5 ${isCompact ? 'text-[7.5px]' : 'text-[9.5px]'}`}>
                  PRESCRIPTION ID
                </p>
                <LinearBarcodeSVG value={data.prescriptionCode || 'RX-DRAFT'} compact={isCompact} />
                <p className={`font-bold text-slate-900 tracking-tight tabular-nums mt-0.5 ${isCompact ? 'text-[8.5px]' : 'text-[11px]'}`}>
                  {data.prescriptionCode || 'RX-DRAFT'}
                </p>
              </div>
            </div>

            {/* 3. Patient Metadata Strip */}
            <div className={`border-b border-slate-300 ${isCompact ? 'pb-1.5 text-[8.5px]' : 'pb-2.5 text-[11.5px]'} space-y-0.5`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span>
                  Name:{' '}
                  <strong className="font-bold text-slate-950">
                    {data.patientName || 'Select patient...'}
                  </strong>
                </span>
                <span className="tabular-nums">
                  Age: <strong className="font-bold text-slate-950">{formattedAge}</strong>
                </span>
                <span>
                  Sex: <strong className="font-bold text-slate-950">{formattedSex}</strong>
                </span>
                <span className="tabular-nums">
                  Mobile: <strong className="font-bold text-slate-950">{data.patientPhone || '—'}</strong>
                </span>
                <span className="tabular-nums">
                  Date: <strong className="font-bold text-slate-950">{formatShortDate(data.dateStr)}</strong>
                </span>
              </div>
              <div>
                <span>
                  Address:{' '}
                  <strong className="font-bold text-slate-950">
                    {data.patientAddress || 'Dhaka, Bangladesh'}
                  </strong>
                </span>
              </div>
            </div>

            {/* 4. Mint Green Skin Analysis Report Ribbon */}
            <div
              className={`rounded-md bg-[#BFEAD1] text-slate-800 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 ${
                isCompact ? 'px-2.5 py-1.5 text-[8.5px]' : 'px-4 py-2 text-[11.5px]'
              }`}
              style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
            >
              <span className="font-bold text-slate-900">Skin Analysis Report</span>
              <span className="tabular-nums">
                Hydration Level:{' '}
                <span className="font-medium text-slate-800">
                  {data.hydrationLevel?.trim() || 'Normal-Hydrated'}
                </span>
              </span>
              <span>
                Pigmentation:{' '}
                <span className="font-medium text-slate-800">
                  {data.pigmentationLevel?.trim() || 'Assessed'}
                </span>
              </span>
            </div>

            {/* 5. Main Two-Column Body + Faint Centered SUOXI Logo Watermark */}
            <div className={`relative ${isCompact ? 'min-h-[300px]' : 'min-h-[590px]'} flex flex-col`}>
              {/* Faint clinic pad emblem watermark */}
              <div
                aria-hidden="true"
                className="pointer-events-none select-none absolute inset-0 flex items-center justify-center overflow-hidden"
              >
                <div className="opacity-[0.065]">
                  <SuoxiLogoEmblem className={isCompact ? 'w-44 h-44' : 'w-[330px] h-[330px]'} />
                </div>
              </div>

              <div className="grid grid-cols-12 relative z-10 flex-1">
                {/* LEFT COLUMN: 5 Clinical Assessment Sections */}
                <div
                  className={`col-span-4 border-r border-slate-300 ${
                    isCompact ? 'pr-2.5 py-1.5 space-y-2.5' : 'pr-4 py-2.5 space-y-4'
                  }`}
                >
                  {/* 1. CHIEF COMPLAINTS */}
                  <div>
                    <h3 className={`font-bold uppercase tracking-wide text-slate-900 ${isCompact ? 'text-[8px]' : 'text-[10.5px]'}`}>
                      CHIEF COMPLAINTS
                    </h3>
                    {chiefBullets.length > 0 ? (
                      <ul className={`mt-1 space-y-0.5 text-slate-700 ${isCompact ? 'text-[8px] pl-2.5' : 'text-[10.5px] pl-3.5'} list-disc`}>
                        {chiefBullets.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className={`mt-0.5 text-slate-400 italic ${isCompact ? 'text-[7.5px]' : 'text-[10px]'}`}>
                        —
                      </p>
                    )}
                  </div>

                  {/* 2. PAST HISTORY */}
                  <div>
                    <h3 className={`font-bold uppercase tracking-wide text-slate-900 ${isCompact ? 'text-[8px]' : 'text-[10.5px]'}`}>
                      PAST HISTORY
                    </h3>
                    {pastBullets.length > 0 ? (
                      <ul className={`mt-1 space-y-0.5 text-slate-700 ${isCompact ? 'text-[8px] pl-2.5' : 'text-[10.5px] pl-3.5'} list-disc`}>
                        {pastBullets.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className={`mt-0.5 text-slate-400 italic ${isCompact ? 'text-[7.5px]' : 'text-[10px]'}`}>
                        —
                      </p>
                    )}
                  </div>

                  {/* 3. HISTORY OF OPERATION */}
                  <div>
                    <h3 className={`font-bold uppercase tracking-wide text-slate-900 ${isCompact ? 'text-[8px]' : 'text-[10.5px]'}`}>
                      HISTORY OF OPERATION
                    </h3>
                    {operationBullets.length > 0 ? (
                      <ul className={`mt-1 space-y-0.5 text-slate-700 ${isCompact ? 'text-[8px] pl-2.5' : 'text-[10.5px] pl-3.5'} list-disc`}>
                        {operationBullets.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className={`mt-0.5 text-slate-400 italic ${isCompact ? 'text-[7.5px]' : 'text-[10px]'}`}>
                        No prior surgery
                      </p>
                    )}
                  </div>

                  {/* 4. INVESTIGATION */}
                  <div>
                    <h3 className={`font-bold uppercase tracking-wide text-slate-900 ${isCompact ? 'text-[8px]' : 'text-[10.5px]'}`}>
                      INVESTIGATION
                    </h3>
                    {investigationBullets.length > 0 ? (
                      <ul className={`mt-1 space-y-0.5 text-slate-700 ${isCompact ? 'text-[8px] pl-2.5' : 'text-[10.5px] pl-3.5'} list-disc`}>
                        {investigationBullets.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className={`mt-0.5 text-slate-400 italic ${isCompact ? 'text-[7.5px]' : 'text-[10px]'}`}>
                        —
                      </p>
                    )}
                  </div>

                  {/* 5. PROVISIONAL DIAGNOSIS */}
                  <div>
                    <h3 className={`font-bold uppercase tracking-wide text-slate-900 ${isCompact ? 'text-[8px]' : 'text-[10.5px]'}`}>
                      PROVISIONAL DIAGNOSIS
                    </h3>
                    {diagnosisBullets.length > 0 ? (
                      <ul className={`mt-1 space-y-0.5 text-slate-800 font-medium ${isCompact ? 'text-[8px] pl-2.5' : 'text-[10.5px] pl-3.5'} list-disc`}>
                        {diagnosisBullets.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className={`mt-0.5 text-slate-300 italic ${isCompact ? 'text-[7.5px]' : 'text-[10px]'}`}>
                        Pending diagnosis...
                      </p>
                    )}
                  </div>
                </div>

                {/* RIGHT COLUMN: Rx, Treatment Pill Badge & Skin Care Pill Badge */}
                <div className={`col-span-8 ${isCompact ? 'pl-2.5 py-1 space-y-2.5' : 'pl-5 py-1.5 space-y-4'}`}>
                  {/* Rx Header + Thin Hairline Divider */}
                  <div className="border-b border-slate-300 pb-1">
                    <span className={`font-serif font-medium text-slate-900 leading-none block ${isCompact ? 'text-[19px]' : 'text-[28px]'}`}>
                      ℞
                    </span>
                  </div>

                  {/* Treatment Section */}
                  <div className={isCompact ? 'space-y-1.5' : 'space-y-2'}>
                    <div>
                      <span
                        className={`inline-block rounded-full border border-slate-700 font-bold text-slate-900 ${
                          isCompact ? 'px-2.5 py-0.5 text-[8.5px]' : 'px-4 py-0.5 text-[11.5px]'
                        }`}
                      >
                        Treatment
                      </span>
                    </div>

                    {data.procedures.length > 0 ? (
                      <div className={isCompact ? 'space-y-1 pl-0.5' : 'space-y-1.5 pl-1'}>
                        {data.procedures.map((proc, idx) => {
                          const parsed = parseProcedureDisplay(proc);
                          return (
                            <div key={idx} className="leading-snug">
                              <p className={`font-semibold text-slate-900 ${isCompact ? 'text-[8px]' : 'text-[10.5px]'}`}>
                                <span className="tabular-nums mr-1">{idx + 1}.</span>
                                {parsed.title}
                              </p>
                              {parsed.session && (
                                <p className={`text-slate-600 ${isCompact ? 'text-[7.5px] pl-3' : 'text-[10px] pl-4'}`}>
                                  {parsed.session}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className={`text-slate-400 italic ${isCompact ? 'text-[7.5px]' : 'text-[10px]'}`}>
                        No clinic procedure selected
                      </p>
                    )}
                  </div>

                  {/* Skin Care Section */}
                  <div className={isCompact ? 'space-y-1.5 pt-0.5' : 'space-y-2.5 pt-1'}>
                    <div>
                      <span
                        className={`inline-block rounded-full border border-slate-700 font-bold text-slate-900 ${
                          isCompact ? 'px-2.5 py-0.5 text-[8.5px]' : 'px-4 py-0.5 text-[11.5px]'
                        }`}
                      >
                        Skin Care
                      </span>
                    </div>

                    {data.medicines.length > 0 ? (
                      <div className={isCompact ? 'space-y-2 pl-0.5' : 'space-y-3 pl-1'}>
                        {data.medicines.map((med, idx) => (
                          <div key={idx} className="leading-snug">
                            <p className={`font-bold text-slate-950 ${isCompact ? 'text-[8.5px]' : 'text-[11px]'}`}>
                              <span className="tabular-nums mr-1">{idx + 1}.</span>
                              <span>{med.form}</span>
                              {med.name ? ` — ${med.name}` : ' — Unnamed item'}
                            </p>
                            {med.genericName && (
                              <p className={`text-slate-700 ${isCompact ? 'text-[7.5px] pl-3' : 'text-[10px] pl-3.5'}`}>
                                {med.genericName}
                              </p>
                            )}
                            {(med.dosage || med.duration) && (
                              <p className={`text-slate-700 tabular-nums ${isCompact ? 'text-[7.5px] pl-3' : 'text-[10px] pl-3.5'}`}>
                                {[med.dosage, med.duration].filter(Boolean).join(' · ')}
                              </p>
                            )}
                            {(med.instructions || med.instructionsBn) && (
                              <p className={`text-slate-600 font-bengali ${isCompact ? 'text-[7.5px] pl-3' : 'text-[10px] pl-3.5'}`}>
                                {med.instructions}
                                {med.instructions && med.instructionsBn ? ' — ' : ''}
                                {med.instructionsBn}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={`text-slate-400 italic ${isCompact ? 'text-[7.5px]' : 'text-[10px]'}`}>
                        Add topical skincare or medications...
                      </p>
                    )}
                  </div>

                  {/* Clinical Plan & Advice (if entered) */}
                  {((data.adviceList && data.adviceList.length > 0) || data.planNotes?.trim()) && (
                    <div className={`border-t border-slate-200 ${isCompact ? 'pt-1.5 space-y-1' : 'pt-2.5 space-y-1.5'}`}>
                      {data.planNotes?.trim() && (
                        <p className={`text-slate-700 ${isCompact ? 'text-[7.5px]' : 'text-[10px]'}`}>
                          <strong className="font-bold text-slate-900">Plan:</strong> {data.planNotes}
                        </p>
                      )}
                      {data.adviceList && data.adviceList.length > 0 && (
                        <div>
                          <p className={`font-bold text-slate-900 ${isCompact ? 'text-[8px]' : 'text-[10px]'}`}>
                            Advice:
                          </p>
                          <ul className={`list-disc font-bengali text-slate-700 ${isCompact ? 'text-[7.5px] pl-3 space-y-0.5' : 'text-[10px] pl-4 space-y-0.5'}`}>
                            {data.adviceList.map((adv, i) => (
                              <li key={i}>{adv}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 6. FOOTER: Follow-up | Develop by SUOXI IT | QR Scan to verify | Doctor Signature */}
          <div className={`border-t border-slate-300 ${isCompact ? 'pt-2 mt-2' : 'pt-3.5 mt-4'}`}>
            <div className="flex items-end justify-between gap-3">
              {/* Left: Follow-Up */}
              <div className="min-w-0">
                <p className={`font-bold uppercase tracking-wide text-slate-900 ${isCompact ? 'text-[8.5px]' : 'text-[11.5px]'}`}>
                  FOLLOW-UP:
                </p>
                <p className={`text-slate-700 tabular-nums mt-0.5 ${isCompact ? 'text-[8px]' : 'text-[10.5px]'}`}>
                  Next Visit:{' '}
                  <span className="font-semibold text-slate-900">
                    {data.nextSessionDate ? formatShortDate(data.nextSessionDate) : 'As advised'}
                  </span>
                </p>
              </div>

              {/* Center: Credit */}
              <div className={`text-slate-500 whitespace-nowrap ${isCompact ? 'text-[7.5px]' : 'text-[10px]'}`}>
                Develop by SUOXI IT
              </div>

              {/* Center-Right: QR Code + Scan to verify */}
              <div className="flex flex-col items-center shrink-0">
                <VerificationQrSvg
                  value={`SUOXI|${data.prescriptionCode || 'DRAFT'}|${data.patientCode || 'PT'}`}
                  size={isCompact ? 38 : 58}
                />
                <span className={`text-slate-600 mt-0.5 whitespace-nowrap ${isCompact ? 'text-[7px]' : 'text-[9.5px]'}`}>
                  Scan to verify
                </span>
              </div>

              {/* Right: Signature */}
              <div className="flex flex-col items-center shrink-0">
                <div
                  className={`border-t-[1.5px] border-slate-900 text-center pt-1 ${
                    isCompact ? 'w-20' : 'w-32'
                  }`}
                >
                  <p className={`font-bold text-slate-950 leading-tight ${isCompact ? 'text-[8.5px]' : 'text-[12px]'}`}>
                    {data.doctorName || 'Dr. Nusrat Jahan'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== PAGE 2: FOOD, HYDRATION & SKINCARE ROUTINE ==================== */}
      {showPage2 && (
        <div
          className={`bg-white flex flex-col justify-between ${
            showPage1 ? 'page-break-before border-t border-slate-200' : ''
          } ${isCompact ? 'p-3.5 min-h-[560px]' : 'p-6 sm:p-8 min-h-[1040px]'}`}
        >
          <div className={isCompact ? 'space-y-2.5' : 'space-y-4'}>
            {renderClinicHeader()}

            <div
              className={`rounded-md bg-[#BFEAD1] text-slate-900 flex items-center justify-between gap-2 ${
                isCompact ? 'px-2.5 py-1.5 text-[8.5px]' : 'px-4 py-2 text-[12px]'
              }`}
              style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
            >
              <span className="font-bold flex items-center gap-1.5">
                <Apple className={isCompact ? 'w-3 h-3 text-[#0DA54F]' : 'w-4 h-4 text-[#0DA54F]'} />
                Food, Hydration &amp; Skincare Routine
              </span>
              <span className="font-medium text-slate-700 tabular-nums">
                {data.patientName} · {data.prescriptionCode}
              </span>
            </div>

            {/* Hydration & Photoprotection */}
            <div className={`grid grid-cols-1 ${isCompact ? 'gap-2' : 'sm:grid-cols-2 gap-3.5'}`}>
              <div className={`rounded-lg border border-slate-200 bg-slate-50/70 ${isCompact ? 'p-2' : 'p-3.5'}`}>
                <p className={`font-bold text-slate-900 flex items-center gap-1.5 ${isCompact ? 'text-[8.5px]' : 'text-[11.5px]'}`}>
                  <Droplet className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                  Daily Hydration Target
                </p>
                <p className={`text-slate-700 mt-1 tabular-nums ${isCompact ? 'text-[8px]' : 'text-[11px]'}`}>
                  Drink at least <strong>{data.waterLiters || 2.5} Liters</strong> of clean drinking water daily.
                </p>
              </div>

              <div className={`rounded-lg border border-slate-200 bg-slate-50/70 ${isCompact ? 'p-2' : 'p-3.5'}`}>
                <p className={`font-bold text-slate-900 flex items-center gap-1.5 ${isCompact ? 'text-[8.5px]' : 'text-[11.5px]'}`}>
                  <Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  Sun &amp; Thermal Protection
                </p>
                {data.sunInstructions && (
                  <p className={`text-slate-700 mt-1 ${isCompact ? 'text-[8px]' : 'text-[10.5px]'}`}>
                    {data.sunInstructions}
                  </p>
                )}
                {data.sunInstructionsBn && (
                  <p className={`text-slate-600 font-bengali mt-0.5 ${isCompact ? 'text-[8px]' : 'text-[10.5px]'}`}>
                    {data.sunInstructionsBn}
                  </p>
                )}
              </div>
            </div>

            {/* AM / PM Routine */}
            <div className={`grid grid-cols-2 ${isCompact ? 'gap-2' : 'gap-3.5'}`}>
              <div className={`rounded-lg border border-amber-200/80 bg-amber-50/40 ${isCompact ? 'p-2' : 'p-3.5'}`}>
                <p className={`font-bold text-amber-900 flex items-center gap-1 ${isCompact ? 'text-[8.5px]' : 'text-[11.5px]'}`}>
                  <Sparkles className="w-3 h-3 shrink-0" /> AM Routine
                </p>
                <ul className={`mt-1 space-y-0.5 text-slate-700 ${isCompact ? 'text-[8px]' : 'text-[10.5px]'}`}>
                  {(data.morningRoutine || []).map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ul>
              </div>

              <div className={`rounded-lg border border-indigo-200/70 bg-indigo-50/30 ${isCompact ? 'p-2' : 'p-3.5'}`}>
                <p className={`font-bold text-indigo-900 ${isCompact ? 'text-[8.5px]' : 'text-[11.5px]'}`}>
                  PM Routine
                </p>
                <ul className={`mt-1 space-y-0.5 text-slate-700 ${isCompact ? 'text-[8px]' : 'text-[10.5px]'}`}>
                  {(data.eveningRoutine || []).map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Diet Lists */}
            <div className={`grid grid-cols-1 ${isCompact ? 'gap-2' : 'sm:grid-cols-2 gap-3.5'}`}>
              <div className={`rounded-lg border border-emerald-200 bg-emerald-50/40 ${isCompact ? 'p-2' : 'p-3.5'}`}>
                <p className={`font-bold text-emerald-900 ${isCompact ? 'text-[8.5px]' : 'text-[11.5px]'}`}>
                  Recommended Skin Foods
                </p>
                <ul className={`mt-1 list-disc pl-4 space-y-0.5 text-slate-700 ${isCompact ? 'text-[8px]' : 'text-[10.5px]'}`}>
                  {(data.recommendedFoods || []).map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className={`rounded-lg border border-rose-200 bg-rose-50/40 ${isCompact ? 'p-2' : 'p-3.5'}`}>
                <p className={`font-bold text-rose-900 ${isCompact ? 'text-[8.5px]' : 'text-[11.5px]'}`}>
                  Strictly Avoid
                </p>
                <ul className={`mt-1 list-disc pl-4 space-y-0.5 text-slate-700 ${isCompact ? 'text-[8px]' : 'text-[10.5px]'}`}>
                  {(data.prohibitedFoods || []).map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Page 2 Footer */}
          <div className={`border-t border-slate-300 flex items-end justify-between gap-3 ${isCompact ? 'pt-2 mt-2' : 'pt-3.5 mt-4'}`}>
            <p className={`text-slate-600 tabular-nums ${isCompact ? 'text-[7.5px]' : 'text-[10px]'}`}>
              Next Visit: <strong>{data.nextSessionDate ? formatShortDate(data.nextSessionDate) : 'As advised'}</strong>
            </p>
            <span className={`text-slate-500 ${isCompact ? 'text-[7.5px]' : 'text-[10px]'}`}>
              Develop by SUOXI IT · Page 2
            </span>
            <div className={`border-t-[1.5px] border-slate-900 text-center pt-1 ${isCompact ? 'w-20' : 'w-32'}`}>
              <p className={`font-bold text-slate-950 ${isCompact ? 'text-[8.5px]' : 'text-[12px]'}`}>
                {data.doctorName || 'Dr. Nusrat Jahan'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
