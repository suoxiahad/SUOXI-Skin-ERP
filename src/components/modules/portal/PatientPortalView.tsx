import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Sparkles,
  FileText,
  CreditCard,
  Droplet,
  Sun,
  Apple,
  ShieldCheck,
  User,
  Phone,
  Printer,
  ChevronRight,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';
import { api } from '../../../api/client.ts';
import { formatBDT, formatDateDhaka, formatTime12h } from '../../../utils/format.ts';
import { Skeleton } from '../../common/Skeleton.tsx';

export const PatientPortalView: React.FC = () => {
  const { setActivePrescriptionPrintId, language, branches } = useApp();
  const [portalData, setPortalData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Default patient pt-1 (Taslima Akter)
  const patientId = 'pt-1';

  useEffect(() => {
    setIsLoading(true);
    api.patientPortal
      .getPortalData(patientId)
      .then((data) => {
        setPortalData(data);
      })
      .catch((err) => {
        console.error('Failed to load patient portal data:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  if (isLoading || !portalData) {
    return (
      <div className="max-w-md mx-auto space-y-4 p-4">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-60 rounded-2xl" />
      </div>
    );
  }

  const patient = portalData.patient;
  const nextApt = portalData.nextAppointment;
  const latestRx = portalData.latestPrescription;
  const packages = portalData.activePackages || [];
  const invoices = portalData.invoices || [];

  return (
    <div className="max-w-md mx-auto space-y-4 pb-12 animate-in fade-in duration-200">
      {/* Mobile-first Patient Header */}
      <div className="bg-gradient-to-br from-[#0DA54F] to-[#0a8740] rounded-2xl p-5 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 opacity-10">
          <Sparkles className="w-36 h-36" />
        </div>

        <div className="flex items-center gap-3 relative z-10">
          <div className="w-12 h-12 rounded-full bg-white/20 border border-white/30 flex items-center justify-center font-bold text-lg text-white">
            {patient.name.charAt(0)}
          </div>
          <div>
            <h1 className="font-bold text-base leading-tight">{patient.name}</h1>
            {patient.nameBn && <p className="text-xs font-bengali opacity-90">{patient.nameBn}</p>}
            <p className="text-[11px] font-mono opacity-80 mt-0.5">{patient.patientIdCode}</p>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-white/20 flex items-center justify-between text-xs">
          <span>
            {patient.branchName ||
              branches.find((b) => b.id === patient.branchId)?.name ||
              patient.branchId ||
              'Clinic Center'}
          </span>
          <span className="font-mono">{patient.phone}</span>
        </div>
      </div>

      {/* Primary Widget: Next Clinical Session (Doctor-Prescribed) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase font-bold text-[#0DA54F] tracking-wider flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            Your Next Scheduled Session
          </span>
          <span className="text-[10px] font-semibold text-slate-400">Doctor Prescribed</span>
        </div>

        {nextApt ? (
          <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-base font-bold text-emerald-950">
                  {formatDateDhaka(nextApt.appointmentDate)}
                </p>
                <p className="text-xs text-emerald-800 font-medium">
                  Time: {formatTime12h(nextApt.appointmentTime)} (Asia/Dhaka)
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-white text-emerald-800 text-[11px] font-bold border border-emerald-200">
                Confirmed
              </span>
            </div>

            <div className="text-xs text-emerald-900 border-t border-emerald-100 pt-2">
              <p className="font-semibold">{nextApt.serviceName}</p>
              <p className="text-[11px] text-emerald-700">Attending: {nextApt.doctorName}</p>
            </div>
          </div>
        ) : latestRx?.nextSessionDate ? (
          <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200 space-y-1">
            <p className="text-sm font-bold text-emerald-900">
              Next Prescribed Session: {formatDateDhaka(latestRx.nextSessionDate)}
            </p>
            <p className="text-xs text-emerald-700">
              Prescribed by Dr. {latestRx.doctorName}. Please call +88029671122 to lock your preferred time slot.
            </p>
          </div>
        ) : (
          <div className="p-3 bg-slate-50 rounded-xl text-center text-xs text-slate-500">
            No upcoming session scheduled.
          </div>
        )}
      </div>

      {/* Latest Prescription & Frozen Lifestyle Guidance */}
      {latestRx && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-[#0DA54F]" />
              <h2 className="font-bold text-slate-800 text-sm">Active Medical Prescription</h2>
            </div>
            <button
              onClick={() => setActivePrescriptionPrintId(latestRx.id)}
              className="text-xs font-semibold text-[#0DA54F] hover:underline flex items-center gap-1"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Save
            </button>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
            <div className="flex justify-between items-center text-slate-500 text-[11px]">
              <span>Rx #{latestRx.prescriptionCode}</span>
              <span>{formatDateDhaka(latestRx.createdAt)}</span>
            </div>
            <p className="font-bold text-slate-900">Diagnosis: {latestRx.diagnosis}</p>

            {/* Medicines List */}
            <div className="divide-y divide-slate-200 pt-1">
              {latestRx.medicines.map((med: any, i: number) => (
                <div key={i} className="py-2">
                  <div className="flex justify-between font-semibold text-slate-800">
                    <span>{med.name}</span>
                    <span className="text-[#0DA54F]">{med.dosage}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{med.instructions}</p>
                  {med.instructionsBn && (
                    <p className="text-[11px] text-slate-500 font-bengali">{med.instructionsBn}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Frozen Food & Lifestyle Snapshot */}
          {latestRx.lifestyleGuidance && (
            <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100 space-y-2 text-xs">
              <div className="flex items-center justify-between font-bold text-emerald-900 text-xs">
                <span className="flex items-center gap-1">
                  <Apple className="w-3.5 h-3.5 text-[#0DA54F]" />
                  Food & Lifestyle Rules (Frozen Snapshot)
                </span>
                <span className="text-[10px] text-emerald-700">v{latestRx.lifestyleGuidance.snapshotVersion}</span>
              </div>

              <div className="flex items-center gap-2 text-slate-700 bg-white p-2 rounded-lg border border-emerald-100">
                <Droplet className="w-4 h-4 text-blue-500 shrink-0" />
                <span>
                  Hydration Target: <strong>{latestRx.lifestyleGuidance.waterIntakeLiters} Liters</strong> / day
                </span>
              </div>

              <div className="flex items-start gap-2 text-slate-700 bg-white p-2 rounded-lg border border-emerald-100">
                <Sun className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-[11px]">
                  <p className="font-medium">{latestRx.lifestyleGuidance.sunProtectionInstructions}</p>
                  {latestRx.lifestyleGuidance.sunProtectionInstructionsBn && (
                    <p className="font-bengali text-slate-500 mt-0.5">
                      {latestRx.lifestyleGuidance.sunProtectionInstructionsBn}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active Treatment Package Card */}
      {packages.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#0DA54F]" />
              Active Treatment Packages
            </span>
            <span className="text-xs text-slate-400">Never deducted twice</span>
          </div>

          {packages.map((pkg: any) => (
            <div key={pkg.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between items-center font-bold text-slate-900">
                <span>{pkg.packageName}</span>
                <span className="text-[#0DA54F] font-mono">{pkg.remainingSessions} sessions left</span>
              </div>

              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-[#0DA54F] h-2 rounded-full"
                  style={{ width: `${(pkg.completedSessions / pkg.totalSessions) * 100}%` }}
                />
              </div>

              <div className="flex justify-between text-[11px] text-slate-500">
                <span>Completed: {pkg.completedSessions} / {pkg.totalSessions}</span>
                <span>Valid until: {formatDateDhaka(pkg.expiryDate)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Billing Summary */}
      {invoices.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-2 text-xs">
          <h3 className="font-bold text-slate-800 flex items-center gap-1.5">
            <CreditCard className="w-4 h-4 text-[#0DA54F]" />
            Billing & Invoices
          </h3>

          <div className="divide-y divide-slate-100">
            {invoices.map((inv: any) => (
              <div key={inv.id} className="py-2 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-800">{inv.invoiceNumber}</p>
                  <p className="text-[10px] text-slate-400">{formatDateDhaka(inv.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-900">{formatBDT(inv.totalAmountBDT)}</p>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      inv.status === 'paid'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-rose-50 text-rose-700'
                    }`}
                  >
                    {inv.status === 'paid' ? 'Paid' : `Due: ${formatBDT(inv.dueAmountBDT)}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
