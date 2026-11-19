import React, { useState, useEffect, useMemo } from 'react';
import {
  Stethoscope,
  Search,
  UserPlus,
  Mic,
  Sparkles,
  Wand2,
  ClipboardList,
  SlidersHorizontal,
  Maximize2,
  Minimize2,
  Eye,
  EyeOff,
  History,
  Camera,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Bookmark,
  ShieldCheck,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Printer,
  Send,
  X,
  ArrowUp,
  ArrowDown,
  Droplet,
  Sun,
  Check,
  CloudCheck,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';
import { api } from '../../../api/client.ts';
import type {
  Patient,
  Consultation,
  Prescription,
  Appointment,
  TreatmentPackage,
  MedicalAttachment,
  RxProtocol,
} from '../../../types/index.ts';
import { formatBDT, formatDateDhaka } from '../../../utils/format.ts';
import {
  DIAGNOSIS_PRESETS,
  COMPLAINT_CHIPS,
  PAST_HISTORY_CHIPS,
  OPERATION_HISTORY_CHIPS,
  INVESTIGATION_CHIPS,
  FITZPATRICK_TYPES,
  SKIN_TYPES,
  TARGET_ZONES,
  EXAM_FINDING_CHIPS,
  PROCEDURE_OPTIONS,
  MEDICINE_FORMS,
  DOSAGE_QUICK_CHIPS,
  DURATION_QUICK_CHIPS,
  QUICK_ADVICE_CHIPS,
  DEFAULT_MORNING_ROUTINE,
  DEFAULT_EVENING_ROUTINE,
  DEFAULT_RECOMMENDED_FOODS,
  DEFAULT_PROHIBITED_FOODS,
  RX_PROTOCOLS,
  getContextualSuggestionsForDiagnosis,
  type RxMedicineDraft,
  type RxProtocolPreset,
} from './consultationPresets.ts';
import { LiveRxPreview } from './LiveRxPreview.tsx';
import { PatientHistoryDrawer } from './PatientHistoryDrawer.tsx';
import { PENDING_PROTOCOL_STORAGE_KEY } from './RxProtocolsView.tsx';

const CUSTOM_PROTOCOLS_KEY = 'suoxi_custom_rx_protocols_v1';
const CUSTOM_ADVICE_KEY = 'suoxi_custom_advice_chips_v1';
const GUIDE_DISMISSED_KEY = 'suoxi_desk_guide_dismissed_v1';

interface VisibleSectionsState {
  skinDiagnostics: boolean;
  procedures: boolean;
  lifestylePage: boolean;
}

function addDaysToDhakaDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export const DoctorConsultationView: React.FC = () => {
  const {
    currentUser,
    branches,
    activeBranchId,
    setActiveBranchId,
    selectedPatientId,
    setSelectedPatientId,
    addToast,
    setActivePrescriptionPrintId,
    setIsPatientRegistrationOpen,
    navigate,
  } = useApp();

  // Directory & Patient State
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [activePatient, setActivePatient] = useState<Patient | null>(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [patientSearchError, setPatientSearchError] = useState('');

  // Patient Clinical History & Documents
  const [pastConsultations, setPastConsultations] = useState<Consultation[]>([]);
  const [pastPrescriptions, setPastPrescriptions] = useState<Prescription[]>([]);
  const [patientPackages, setPatientPackages] = useState<TreatmentPackage[]>([]);
  const [patientDocuments, setPatientDocuments] = useState<MedicalAttachment[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  // Visit & Branch Meta
  const [visitType, setVisitType] = useState<'New' | 'Follow-up' | 'Procedure Review'>('New');
  const [consultationFee, setConsultationFee] = useState<number>(1000);

  // Workspace UI Controls
  const [showOnboardingGuide, setShowOnboardingGuide] = useState<boolean>(() => {
    try {
      return localStorage.getItem(GUIDE_DISMISSED_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [showPreview, setShowPreview] = useState(true);
  const [focusLayout, setFocusLayout] = useState(false);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [isProtocolsMenuOpen, setIsProtocolsMenuOpen] = useState(false);
  const [isManageSectionsOpen, setIsManageSectionsOpen] = useState(false);
  const [visibleSections, setVisibleSections] = useState<VisibleSectionsState>({
    skinDiagnostics: true,
    procedures: true,
    lifestylePage: true,
  });

  // Staged AI Scribe / Voice Dictation Modal
  const [aiModalMode, setAiModalMode] = useState<'dictate' | 'scribe' | 'assist' | null>(null);
  const [dictationDraftText, setDictationDraftText] = useState('');

  // Custom Template Modal
  const [isSaveTemplateOpen, setIsSaveTemplateOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [serverProtocols, setServerProtocols] = useState<RxProtocol[]>([]);
  const [customProtocols, setCustomProtocols] = useState<RxProtocolPreset[]>(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_PROTOCOLS_KEY);
      return raw ? (JSON.parse(raw) as RxProtocolPreset[]) : [];
    } catch {
      return [];
    }
  });
  const [customAdviceChips, setCustomAdviceChips] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_ADVICE_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  // Clinical Column State (Left — 1: Chief Complaints -> 2: Past History -> 3: History Of Operation -> 4: Investigation -> 5: Provisional Diagnosis)
  const [chiefComplaints, setChiefComplaints] = useState('');
  const [pastHistoryFlags, setPastHistoryFlags] = useState<string[]>([]);
  const [pastHistoryNotes, setPastHistoryNotes] = useState('');
  const [operationHistoryNotes, setOperationHistoryNotes] = useState('');
  const [investigations, setInvestigations] = useState('');
  const [clinicalDiagnosis, setClinicalDiagnosis] = useState('');
  const [fitzpatrickType, setFitzpatrickType] = useState(FITZPATRICK_TYPES[3]);
  const [skinType, setSkinType] = useState<'oily' | 'dry' | 'combination' | 'sensitive' | 'normal'>('combination');
  const [targetZones, setTargetZones] = useState<string[]>([]);
  const [examFindings, setExamFindings] = useState<string[]>([]);
  const [examinationNotes, setExaminationNotes] = useState('');
  const [hydration, setHydration] = useState('');
  const [pigmentation, setPigmentation] = useState('');
  const [sebum, setSebum] = useState('');
  const [planNotes, setPlanNotes] = useState('');

  // Prescription & Procedures Column State (Center)
  const [recommendedProcedures, setRecommendedProcedures] = useState<string[]>([]);
  const [customProcedureInput, setCustomProcedureInput] = useState('');
  const [isPushingCashier, setIsPushingCashier] = useState(false);
  const [medicines, setMedicines] = useState<RxMedicineDraft[]>([]);
  const [expandedMedIndices, setExpandedMedIndices] = useState<Record<number, boolean>>({ 0: true });
  const [adviceList, setAdviceList] = useState<string[]>([]);
  const [adviceInput, setAdviceInput] = useState('');
  const [nextSessionDate, setNextSessionDate] = useState('');
  const [nextSessionNotes, setNextSessionNotes] = useState('');

  // Page 2: Skincare Routine & Food Guidance
  const [includeLifestylePage, setIncludeLifestylePage] = useState(true);
  const [isLifestyleExpanded, setIsLifestyleExpanded] = useState(false);
  const [waterLiters, setWaterLiters] = useState(2.5);
  const [sunInstructions, setSunInstructions] = useState(
    'Apply broad-spectrum SPF 50+ PA++++ 20 minutes before sun or heat exposure; reapply every 3 hours.'
  );
  const [sunInstructionsBn, setSunInstructionsBn] = useState(
    'রোদে বা চুলার পাশে যাওয়ার ২০ মিনিট আগে সানস্ক্রিন ব্যবহার করুন এবং প্রতি ৩ ঘণ্টায় রি-অ্যাপ্লাই করুন।'
  );
  const [morningRoutine, setMorningRoutine] = useState<string[]>(DEFAULT_MORNING_ROUTINE);
  const [eveningRoutine, setEveningRoutine] = useState<string[]>(DEFAULT_EVENING_ROUTINE);
  const [recommendedFoods, setRecommendedFoods] = useState<string[]>(DEFAULT_RECOMMENDED_FOODS);
  const [prohibitedFoods, setProhibitedFoods] = useState<string[]>(DEFAULT_PROHIBITED_FOODS);

  // Submission & Autosave
  const [lastAutosavedAt, setLastAutosavedAt] = useState<string>('');
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [createdPrescription, setCreatedPrescription] = useState<Prescription | null>(null);

  // Load initial patients & today's appointments
  useEffect(() => {
    Promise.all([
      api.patients.list(),
      api.appointments.list().catch(() => [] as Appointment[]),
    ])
      .then(([pts, apts]) => {
        setPatients(pts);
        setAppointments(apts);
        if (selectedPatientId) {
          const found = pts.find((p) => p.id === selectedPatientId);
          if (found) setActivePatient(found);
        }
      })
      .catch((err) => {
        console.error('Failed to load consultation directory:', err);
      });
  }, [selectedPatientId]);

  // Load live Rx Protocols from central library + handle "Load in Desk" handoff
  useEffect(() => {
    const fetchProtocols = () => {
      api.rxProtocols
        .list(true)
        .then((list) => {
          setServerProtocols(list);

          let pendingId: string | null = null;
          try {
            pendingId = sessionStorage.getItem(PENDING_PROTOCOL_STORAGE_KEY);
            if (pendingId) sessionStorage.removeItem(PENDING_PROTOCOL_STORAGE_KEY);
          } catch {
            // ignore
          }

          if (pendingId) {
            const matched = list.find((p) => p.id === pendingId);
            if (matched) {
              setClinicalDiagnosis(matched.diagnosis);
              setChiefComplaints(matched.chiefComplaints);
              setInvestigations(matched.investigations || '');
              setExaminationNotes(matched.examinationNotes);
              setSkinType(matched.skinType);
              setTargetZones(matched.targetZones);
              setRecommendedProcedures(matched.procedures);
              setMedicines(matched.medicines.map((m) => ({ ...m })));
              setAdviceList(matched.adviceList);
              setSunInstructions(matched.sunInstructions);
              setSunInstructionsBn(matched.sunInstructionsBn);
              setWaterLiters(matched.waterLiters);
              setMorningRoutine(matched.morningRoutine);
              setEveningRoutine(matched.eveningRoutine);
              setRecommendedFoods(matched.recommendedFoods);
              setProhibitedFoods(matched.prohibitedFoods);
              if (matched.followUpDays > 0) {
                setNextSessionDate(addDaysToDhakaDate(matched.followUpDays));
              }
              return;
            }
          }

          const baseline = list.find((p) => p.isDefaultBaseline);
          if (baseline && !clinicalDiagnosis && medicines.length === 0) {
            setWaterLiters(baseline.waterLiters || 2.5);
            if (baseline.sunInstructions) setSunInstructions(baseline.sunInstructions);
            if (baseline.sunInstructionsBn) setSunInstructionsBn(baseline.sunInstructionsBn);
            if (baseline.morningRoutine?.length) setMorningRoutine(baseline.morningRoutine);
            if (baseline.eveningRoutine?.length) setEveningRoutine(baseline.eveningRoutine);
            if (baseline.recommendedFoods?.length) setRecommendedFoods(baseline.recommendedFoods);
            if (baseline.prohibitedFoods?.length) setProhibitedFoods(baseline.prohibitedFoods);
          }
        })
        .catch(() => {});
    };

    fetchProtocols();
    window.addEventListener('rx-protocols-updated', fetchProtocols);
    return () => window.removeEventListener('rx-protocols-updated', fetchProtocols);
  }, []);

  // Listen for new patient registration completion
  useEffect(() => {
    const refreshPatients = () => {
      api.patients.list().then(setPatients).catch(() => {});
    };
    window.addEventListener('patients-updated', refreshPatients);
    return () => window.removeEventListener('patients-updated', refreshPatients);
  }, []);

  // Load selected patient's history, prescriptions, packages, and Before/After photos
  useEffect(() => {
    if (!activePatient) {
      setPastConsultations([]);
      setPastPrescriptions([]);
      setPatientPackages([]);
      setPatientDocuments([]);
      return;
    }

    setIsHistoryLoading(true);
    Promise.all([
      api.patients.getById(activePatient.id),
      api.medicalDocuments.list({ patientId: activePatient.id }).catch(() => [] as MedicalAttachment[]),
    ])
      .then(([detail, docs]) => {
        setPastConsultations(detail.consultations || []);
        setPastPrescriptions(detail.prescriptions || []);
        setPatientPackages(detail.packages || []);
        setPatientDocuments(docs || []);
        if (detail.patient?.skinType) {
          setSkinType(detail.patient.skinType);
        }
      })
      .catch((err) => {
        console.error('Failed to load patient EMR details:', err);
      })
      .finally(() => setIsHistoryLoading(false));

    // Restore autosaved local draft if available for this patient
    try {
      const savedDraft = localStorage.getItem(`suoxi_rx_draft_${activePatient.id}`);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed.chiefComplaints !== undefined) setChiefComplaints(parsed.chiefComplaints);
        if (Array.isArray(parsed.pastHistoryFlags)) setPastHistoryFlags(parsed.pastHistoryFlags);
        if (parsed.pastHistoryNotes !== undefined) setPastHistoryNotes(parsed.pastHistoryNotes);
        if (parsed.operationHistoryNotes !== undefined) setOperationHistoryNotes(parsed.operationHistoryNotes);
        if (parsed.investigations !== undefined) setInvestigations(parsed.investigations);
        if (parsed.clinicalDiagnosis !== undefined) setClinicalDiagnosis(parsed.clinicalDiagnosis);
        if (Array.isArray(parsed.medicines)) setMedicines(parsed.medicines);
        if (Array.isArray(parsed.adviceList)) setAdviceList(parsed.adviceList);
        if (Array.isArray(parsed.recommendedProcedures)) setRecommendedProcedures(parsed.recommendedProcedures);
        if (parsed.nextSessionDate !== undefined) setNextSessionDate(parsed.nextSessionDate);
        if (parsed.planNotes !== undefined) setPlanNotes(parsed.planNotes);
      }
    } catch {
      // Ignore draft parse errors
    }
  }, [activePatient]);

  // Autosave Draft when typing/clicking
  useEffect(() => {
    if (!activePatient) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          `suoxi_rx_draft_${activePatient.id}`,
          JSON.stringify({
            chiefComplaints,
            pastHistoryFlags,
            pastHistoryNotes,
            operationHistoryNotes,
            investigations,
            clinicalDiagnosis,
            medicines,
            adviceList,
            recommendedProcedures,
            nextSessionDate,
            planNotes,
          })
        );
        const now = new Date();
        setLastAutosavedAt(
          now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        );
      } catch {
        // Ignore storage errors
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [
    activePatient,
    chiefComplaints,
    pastHistoryFlags,
    pastHistoryNotes,
    operationHistoryNotes,
    investigations,
    clinicalDiagnosis,
    medicines,
    adviceList,
    recommendedProcedures,
    nextSessionDate,
    planNotes,
  ]);

  // Visit type -> automatic consultation fee update
  useEffect(() => {
    if (visitType === 'New') {
      setConsultationFee(currentUser?.consultationFeeBDT || 1000);
    } else if (visitType === 'Follow-up') {
      setConsultationFee(currentUser?.followUpFeeBDT || 500);
    } else {
      setConsultationFee(0);
    }
  }, [visitType, currentUser]);

  // Today's Queue list
  const queuePatientList = useMemo(() => {
    const map = new Map<string, { patient: Patient; appointment: Appointment }>();
    appointments.forEach((apt) => {
      const pt = patients.find((p) => p.id === apt.patientId || p.patientIdCode === apt.patientId);
      if (pt && !map.has(pt.id)) {
        map.set(pt.id, { patient: pt, appointment: apt });
      }
    });
    return Array.from(map.values());
  }, [appointments, patients]);

  const activeBranch = useMemo(
    () => branches.find((b) => b.id === activeBranchId) || branches[0],
    [branches, activeBranchId]
  );

  const contextualSuggestions = useMemo(
    () => getContextualSuggestionsForDiagnosis(clinicalDiagnosis),
    [clinicalDiagnosis]
  );

  // Combined examination & history summary string for API consultation record
  const composedExaminationNotes = useMemo(() => {
    const parts: string[] = [];
    const pastCombined = [...pastHistoryFlags, pastHistoryNotes.trim()].filter(Boolean).join('; ');
    if (pastCombined) parts.push(`Past History: ${pastCombined}`);
    if (operationHistoryNotes.trim()) parts.push(`H/O Operation: ${operationHistoryNotes.trim()}`);
    if (investigations.trim()) parts.push(`Investigation: ${investigations.trim()}`);
    parts.push(`${fitzpatrickType.split('(')[0].trim()} · ${skinType} skin`);
    if (targetZones.length > 0) parts.push(`Target zones: ${targetZones.join(', ')}`);
    if (examFindings.length > 0) parts.push(`Findings: ${examFindings.join(', ')}`);
    if (examinationNotes.trim()) parts.push(examinationNotes.trim());
    return parts.join(' | ');
  }, [
    pastHistoryFlags,
    pastHistoryNotes,
    operationHistoryNotes,
    investigations,
    fitzpatrickType,
    skinType,
    targetZones,
    examFindings,
    examinationNotes,
  ]);

  // Clinical Safety Alerts (Past History safety flags + Patient Allergies + Prescribed Items/Procedures)
  const safetyWarnings = useMemo(() => {
    const warnings: string[] = [];
    const pastBlob = `${pastHistoryFlags.join(' ')} ${pastHistoryNotes}`.toLowerCase();
    const hasPregnancy = pastHistoryFlags.includes('Pregnancy / Lactation') || /pregnan|lactat/i.test(pastBlob);
    const hasIsotretinoin = pastHistoryFlags.includes('Recent Isotretinoin (<6 mo)') || /isotretinoin/i.test(pastBlob);
    const hasKeloid = pastHistoryFlags.includes('Keloid Tendency') || /keloid/i.test(`${pastBlob} ${operationHistoryNotes}`.toLowerCase());
    const hasActiveHerpes = pastHistoryFlags.includes('Active Herpes / Infection') || /herpes|active infection/i.test(pastBlob);

    const medText = medicines.map((m) => `${m.name} ${m.genericName || ''}`.toLowerCase()).join(' ');
    const procText = recommendedProcedures.join(' ').toLowerCase();

    if (hasPregnancy && /(retin|adapalene|tretinoin|hydroquinone|isotretinoin)/i.test(medText)) {
      warnings.push('Pregnancy / Lactation flagged in Past History: verify retinoid or hydroquinone contraindication.');
    }
    if (hasIsotretinoin && /(laser|co2|peel|mnrf)/i.test(procText)) {
      warnings.push('Recent Isotretinoin (<6 mo) flagged in Past History: defer ablative laser or deep chemical peel.');
    }
    if (hasKeloid && /(co2|mnrf|fractional)/i.test(procText)) {
      warnings.push('Keloid tendency noted in history: adjust energy fluence or choose non-ablative alternatives.');
    }
    if (hasActiveHerpes && /(laser|peel|prp)/i.test(procText)) {
      warnings.push('Active viral/skin infection flagged: postpone energy-based procedures until resolved.');
    }
    if (activePatient?.allergies && activePatient.allergies.length > 0) {
      warnings.push(`Reported patient allergies: ${activePatient.allergies.join(', ')}`);
    }
    return warnings;
  }, [pastHistoryFlags, pastHistoryNotes, operationHistoryNotes, medicines, recommendedProcedures, activePatient]);

  // Search-and-Enter patient selection (no dropdown / no scroll)
  const handlePatientSearchEnter = () => {
    const q = patientSearch.trim().toLowerCase();
    if (!q) {
      setPatientSearchError('Type patient name, +880 phone, or SX ID, then press Enter.');
      return;
    }
    const cleanQ = q.replace(/[\s\-+]/g, '');
    const exact = patients.find(
      (p) =>
        p.phone.trim().toLowerCase() === q ||
        p.phone.replace(/[\s\-+]/g, '') === cleanQ ||
        p.patientIdCode.trim().toLowerCase() === q ||
        p.name.trim().toLowerCase() === q
    );

    const matched =
      exact ||
      patients.find(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.phone.toLowerCase().includes(q) ||
          p.patientIdCode.toLowerCase().includes(q)
      );

    if (matched) {
      setActivePatient(matched);
      setSelectedPatientId(matched.id);
      setPatientSearch('');
      setPatientSearchError('');
      setCreatedPrescription(null);
    } else {
      setPatientSearchError(`No registered patient found for "${patientSearch.trim()}".`);
    }
  };

  // Helper toggles
  const toggleArrayItem = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    value: string
  ) => {
    setter((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  const appendTextLine = (
    current: string,
    setter: React.Dispatch<React.SetStateAction<string>>,
    snippet: string
  ) => {
    const trimmed = current.trim();
    if (!trimmed) {
      setter(snippet);
    } else if (!trimmed.toLowerCase().includes(snippet.toLowerCase())) {
      setter(`${trimmed}, ${snippet}`);
    }
  };

  // Medicine actions
  const handleAddMedicine = (preset?: RxMedicineDraft) => {
    const newItem: RxMedicineDraft = preset
      ? { ...preset }
      : {
          name: '',
          genericName: '',
          form: 'Cream',
          dosage: 'PM (Night)',
          duration: '30 days',
          instructions: '',
          instructionsBn: '',
        };
    setMedicines((prev) => {
      const nextIdx = prev.length;
      setExpandedMedIndices((exp) => ({ ...exp, [nextIdx]: true }));
      return [...prev, newItem];
    });
  };

  const handleUpdateMedicine = (
    index: number,
    field: keyof RxMedicineDraft,
    value: string
  ) => {
    setMedicines((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item))
    );
  };

  const handleRemoveMedicine = (index: number) => {
    setMedicines((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Advice actions
  const handleAddAdvice = (saveToLibrary = false) => {
    const text = adviceInput.trim();
    if (!text) return;
    if (!adviceList.includes(text)) {
      setAdviceList((prev) => [...prev, text]);
    }
    if (saveToLibrary && !QUICK_ADVICE_CHIPS.includes(text) && !customAdviceChips.includes(text)) {
      const updated = [text, ...customAdviceChips];
      setCustomAdviceChips(updated);
      try {
        localStorage.setItem(CUSTOM_ADVICE_KEY, JSON.stringify(updated));
      } catch {
        // ignore
      }
      addToast({
        type: 'success',
        title: 'Advice Saved for Later',
        description: 'Added to your reusable quick advice library.',
      });
    }
    setAdviceInput('');
  };

  const handleSaveSingleAdviceChip = (text: string) => {
    if (QUICK_ADVICE_CHIPS.includes(text) || customAdviceChips.includes(text)) {
      addToast({ type: 'info', title: 'Already in Quick Advice Library' });
      return;
    }
    const updated = [text, ...customAdviceChips];
    setCustomAdviceChips(updated);
    try {
      localStorage.setItem(CUSTOM_ADVICE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
    addToast({ type: 'success', title: 'Saved to Quick Advice Library' });
  };

  const moveAdvice = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= adviceList.length) return;
    setAdviceList((prev) => {
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  // Apply Protocol Preset
  const handleApplyProtocol = (proto: RxProtocolPreset | RxProtocol) => {
    setClinicalDiagnosis(proto.diagnosis);
    setChiefComplaints(proto.chiefComplaints);
    setInvestigations(proto.investigations || '');
    setExaminationNotes(proto.examinationNotes);
    setSkinType(proto.skinType);
    setTargetZones(proto.targetZones);
    setRecommendedProcedures(proto.procedures);
    setMedicines(proto.medicines.map((m) => ({ ...m })));
    setAdviceList(proto.adviceList);
    setSunInstructions(proto.sunInstructions);
    setSunInstructionsBn(proto.sunInstructionsBn);
    setWaterLiters(proto.waterLiters);
    setMorningRoutine(proto.morningRoutine);
    setEveningRoutine(proto.eveningRoutine);
    setRecommendedFoods(proto.recommendedFoods);
    setProhibitedFoods(proto.prohibitedFoods);
    if (proto.followUpDays > 0) {
      setNextSessionDate(addDaysToDhakaDate(proto.followUpDays));
    }
    setExpandedMedIndices({ 0: true });
    setIsProtocolsMenuOpen(false);
    addToast({
      type: 'success',
      title: `Loaded: ${proto.name}`,
      description: `${proto.medicines.length} Rx items and ${proto.procedures.length} clinical procedures applied.`,
    });
  };

  // Copy past Rx from Quick History Drawer
  const handleCopyFromHistory = (rx: Prescription) => {
    setClinicalDiagnosis(rx.diagnosis);
    setMedicines(
      rx.medicines.map((m) => ({
        name: m.name,
        genericName: m.genericName,
        form: m.form,
        dosage: m.dosage,
        duration: m.duration,
        instructions: m.instructions,
        instructionsBn: m.instructionsBn,
      }))
    );
    if (rx.lifestyleGuidance) {
      setWaterLiters(rx.lifestyleGuidance.waterIntakeLiters || 2.5);
      if (rx.lifestyleGuidance.sunProtectionInstructions) {
        setSunInstructions(rx.lifestyleGuidance.sunProtectionInstructions);
      }
      if (rx.lifestyleGuidance.sunProtectionInstructionsBn) {
        setSunInstructionsBn(rx.lifestyleGuidance.sunProtectionInstructionsBn);
      }
    }
    addToast({
      type: 'success',
      title: `Copied ${rx.prescriptionCode}`,
      description: 'Previous diagnosis and medicines loaded into current desk.',
    });
  };

  // Save current workspace as reusable template (to central Rx Protocols API)
  const handleSaveCustomTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateName.trim()) return;
    const payload: Omit<RxProtocol, 'id' | 'updatedAt' | 'createdBy'> = {
      name: newTemplateName.trim(),
      subtitle: `${medicines.length} Rx · ${recommendedProcedures.length} procedures`,
      category: 'General Dermatology',
      isActive: true,
      isDefaultBaseline: false,
      diagnosis: clinicalDiagnosis || newTemplateName.trim(),
      chiefComplaints,
      investigations,
      examinationNotes,
      skinType,
      targetZones,
      procedures: recommendedProcedures,
      medicines,
      adviceList,
      sunInstructions,
      sunInstructionsBn,
      waterLiters,
      followUpDays: 14,
      morningRoutine,
      eveningRoutine,
      recommendedFoods,
      prohibitedFoods,
    };

    try {
      const saved = await api.rxProtocols.create(payload);
      setServerProtocols((prev) => [saved, ...prev]);
      window.dispatchEvent(new CustomEvent('rx-protocols-updated'));
      setIsSaveTemplateOpen(false);
      setNewTemplateName('');
      addToast({
        type: 'success',
        title: 'Saved to Rx Protocols',
        description: `"${saved.name}" is now available in Rx Protocols library & dropdown.`,
      });
    } catch {
      const fallbackProto: RxProtocolPreset = {
        id: `custom-${Date.now()}`,
        ...payload,
      };
      const updated = [fallbackProto, ...customProtocols];
      setCustomProtocols(updated);
      try {
        localStorage.setItem(CUSTOM_PROTOCOLS_KEY, JSON.stringify(updated));
      } catch {
        // ignore
      }
      setIsSaveTemplateOpen(false);
      setNewTemplateName('');
      addToast({
        type: 'success',
        title: 'Protocol Template Saved',
        description: `"${fallbackProto.name}" saved locally.`,
      });
    }
  };

  // Push Recommended Procedures to Cashier Billing Desk
  const handlePushToCashier = async () => {
    if (!activePatient) {
      addToast({ type: 'warning', title: 'Select a patient first' });
      return;
    }
    if (recommendedProcedures.length === 0) {
      addToast({
        type: 'warning',
        title: 'No Procedures Selected',
        description: 'Select at least one aesthetic procedure before pushing to Cashier.',
      });
      return;
    }

    setIsPushingCashier(true);
    try {
      const items = recommendedProcedures.map((procName) => {
        const matched = PROCEDURE_OPTIONS.find((p) => p.name === procName);
        return {
          description: procName,
          quantity: 1,
          unitPriceBDT: matched ? matched.priceBDT : 3500,
          discountBDT: 0,
        };
      });

      const inv = await api.invoices.create({
        patientId: activePatient.id,
        branchId: activeBranchId,
        items,
        vatPercent: 5,
      });

      addToast({
        type: 'success',
        title: `Dispatched to Cashier (${inv.invoiceNumber})`,
        description: `${recommendedProcedures.length} procedure(s) queued at ${activeBranch?.name || 'clinic'} billing counter.`,
      });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Cashier Dispatch Failed',
        description: (err as Error).message,
      });
    } finally {
      setIsPushingCashier(false);
    }
  };

  // Finalize Consultation & Prescription together
  const handleFinalize = async () => {
    if (!activePatient) {
      addToast({
        type: 'warning',
        title: 'No Patient Selected',
        description: 'Search by name, phone, or SX ID and press Enter to select a patient.',
      });
      return;
    }

    const cleanDiagnosis = clinicalDiagnosis.trim();
    const cleanComplaints = chiefComplaints.trim() || `${cleanDiagnosis || 'Aesthetic skin consultation'}`;
    const cleanExam = composedExaminationNotes.trim() || 'Aesthetic dermatology evaluation completed';

    if (cleanDiagnosis.length < 2) {
      addToast({
        type: 'warning',
        title: 'Provisional Diagnosis Required',
        description: 'Enter or select a Provisional Diagnosis before finalizing.',
      });
      return;
    }

    setIsFinalizing(true);
    try {
      const consultation = await api.consultations.create({
        patientId: activePatient.id,
        chiefComplaints: cleanComplaints,
        examinationNotes: cleanExam,
        clinicalDiagnosis: cleanDiagnosis,
        skinAnalysis: {
          hydration: hydration || 'Normal',
          pigmentation: pigmentation || 'Assessed',
          elasticity: 'Firm',
          sebum: sebum || skinType,
        },
        recommendedProcedures:
          recommendedProcedures.length > 0
            ? recommendedProcedures
            : ['General Aesthetic Consultation'],
        nextSessionDate: nextSessionDate || undefined,
        nextSessionNotes: nextSessionNotes || planNotes || undefined,
      });

      const composedPastHistory = [...pastHistoryFlags, pastHistoryNotes.trim()]
        .filter(Boolean)
        .join(', ');

      const rx = await api.prescriptions.create({
        patientId: activePatient.id,
        consultationId: consultation.id,
        diagnosis: cleanDiagnosis,
        chiefComplaints: cleanComplaints,
        pastHistory: composedPastHistory || undefined,
        operationHistory: operationHistoryNotes.trim() || undefined,
        investigations: investigations.trim() || undefined,
        recommendedProcedures: recommendedProcedures,
        adviceList: adviceList,
        planNotes: planNotes.trim() || undefined,
        skinAnalysis: {
          hydration: hydration.trim() || 'Normal-Hydrated',
          pigmentation: pigmentation.trim() || 'Assessed',
          elasticity: 'Firm',
          sebum: sebum || skinType,
          skinType,
        },
        language: 'both',
        nextSessionDate: nextSessionDate || undefined,
        medicines: medicines.filter((m) => m.name.trim().length > 0),
        lifestyleGuidance: {
          waterIntakeLiters: waterLiters,
          sunProtectionInstructions: sunInstructions,
          sunProtectionInstructionsBn: sunInstructionsBn,
          recommendedFoods,
          recommendedFoodsBn: [],
          prohibitedFoods,
          prohibitedFoodsBn: [],
          lifestylePrecautions:
            adviceList.length > 0
              ? adviceList
              : [
                  'Minimum 7–8 hours restful sleep every night',
                  'Avoid harsh rubbing or unprescribed topical steroids',
                ],
          lifestylePrecautionsBn: [],
          skincareRoutineMorning: morningRoutine,
          skincareRoutineEvening: eveningRoutine,
        },
      });

      setCreatedPrescription(rx);
      setPastPrescriptions((prev) => [rx, ...prev]);
      setPastConsultations((prev) => [consultation, ...prev]);
      setActivePrescriptionPrintId(rx.id);

      try {
        localStorage.removeItem(`suoxi_rx_draft_${activePatient.id}`);
      } catch {
        // ignore
      }

      addToast({
        type: 'success',
        title: `Finalized ${rx.prescriptionCode}`,
        description: nextSessionDate
          ? `Consultation & Rx locked. Next session scheduled for ${formatDateDhaka(nextSessionDate)}.`
          : 'Consultation & frozen Skincare/Food Rx snapshot saved.',
      });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Finalization Failed',
        description: (err as Error).message,
      });
    } finally {
      setIsFinalizing(false);
    }
  };

  // Insert dictated snippet into Clinical fields
  const handleApplyDictationSnippet = (target: 'complaints' | 'diagnosis' | 'plan') => {
    const txt = dictationDraftText.trim();
    if (!txt) return;
    if (target === 'complaints') {
      setChiefComplaints((prev) => (prev.trim() ? `${prev.trim()}\n${txt}` : txt));
    } else if (target === 'diagnosis') {
      setClinicalDiagnosis(txt);
    } else {
      setPlanNotes((prev) => (prev.trim() ? `${prev.trim()}\n${txt}` : txt));
    }
    setDictationDraftText('');
    setAiModalMode(null);
    addToast({ type: 'success', title: 'Clinical Note Inserted' });
  };

  const allProtocols: Array<RxProtocol | RxProtocolPreset> =
    serverProtocols.length > 0
      ? [...customProtocols, ...serverProtocols]
      : [...customProtocols, ...RX_PROTOCOLS];
  const allAdviceChips = [...customAdviceChips, ...QUICK_ADVICE_CHIPS];
  const photoCount = patientDocuments.filter(
    (d) => d.category === 'Before-After Photos' || d.type === 'clinical_photo'
  ).length;

  return (
    <div className="space-y-4 pb-24">
      {/* 1. TOP WORKSPACE HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Consultation &amp; Prescription Desk
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Unified aesthetic consultation, topical skincare &amp; Rx workspace · autosaves draft as you work
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {activePatient && (
            <button
              type="button"
              onClick={() => setIsHistoryDrawerOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-[#0DA54F]/50 hover:bg-emerald-50/40 text-slate-800 text-xs font-semibold flex items-center gap-2 transition-all shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
            >
              <History className="w-3.5 h-3.5 text-[#0DA54F]" />
              <span>History &amp; Before/After</span>
              <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                ({pastPrescriptions.length} · {photoCount} photos)
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setAiModalMode('dictate')}
            className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold flex items-center gap-2 transition-all active:scale-[0.98] shadow-xs cursor-pointer whitespace-nowrap shrink-0"
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Or dictate it (EN / BN)</span>
          </button>
        </div>
      </div>

      {/* 2. COLLAPSIBLE 3-STEP WORKFLOW BANNER */}
      {showOnboardingGuide && (
        <div className="rounded-2xl border border-emerald-200/80 bg-[#EEF8F3] px-5 py-4 relative animate-suoxi-enter">
          <button
            type="button"
            onClick={() => {
              setShowOnboardingGuide(false);
              try {
                localStorage.setItem(GUIDE_DISMISSED_KEY, '1');
              } catch {
                // ignore
              }
            }}
            className="absolute top-3 right-3 p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
            aria-label="Dismiss guide"
          >
            <X className="w-4 h-4" />
          </button>

          <p className="text-xs font-bold text-slate-900 mb-3">
            Aesthetic consultation flow — 3 steps
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl bg-white border border-emerald-100 px-3.5 py-2.5 flex items-center gap-3">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  activePatient
                    ? 'bg-[#0DA54F] text-white'
                    : 'bg-emerald-100 text-[#0DA54F]'
                }`}
              >
                {activePatient ? <Check className="w-3.5 h-3.5" /> : '1'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900">Select patient</p>
                <p className="text-[11px] text-slate-500 truncate">
                  Search name/phone &amp; press Enter
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-white border border-emerald-100 px-3.5 py-2.5 flex items-center gap-3">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  medicines.length > 0 || recommendedProcedures.length > 0
                    ? 'bg-[#0DA54F] text-white'
                    : 'bg-emerald-100 text-[#0DA54F]'
                }`}
              >
                {medicines.length > 0 || recommendedProcedures.length > 0 ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  '2'
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900">Assess skin &amp; add Rx</p>
                <p className="text-[11px] text-slate-500 truncate">
                  Fitzpatrick, zones, topicals &amp; procedures
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-white border border-emerald-100 px-3.5 py-2.5 flex items-center gap-3">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  createdPrescription
                    ? 'bg-[#0DA54F] text-white'
                    : 'bg-emerald-100 text-[#0DA54F]'
                }`}
              >
                {createdPrescription ? <Check className="w-3.5 h-3.5" /> : '3'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900">Finalize &amp; dispatch</p>
                <p className="text-[11px] text-slate-500 truncate">
                  Print A4 Rx + Food Guide or push to Cashier
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. TOP PATIENT & BRANCH / VISIT BAR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Patient Selection Card (Left 6 cols) */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Patient
            </span>
            {activePatient && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsHistoryDrawerOpen(true)}
                  className="text-xs font-semibold text-[#0DA54F] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Before/After &amp; Past Rx</span>
                </button>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => {
                    setActivePatient(null);
                    setSelectedPatientId(null);
                    setCreatedPrescription(null);
                  }}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Switch
                </button>
              </div>
            )}
          </div>

          {!activePatient ? (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={patientSearch}
                    onChange={(e) => {
                      setPatientSearch(e.target.value);
                      if (patientSearchError) setPatientSearchError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handlePatientSearchEnter();
                      }
                    }}
                    placeholder="Search by name, +880 phone, or SX ID... (Press Enter ↵)"
                    className="w-full pl-9 pr-20 py-2.5 text-xs rounded-xl border border-slate-300 bg-slate-50/50 focus:bg-white focus:border-[#0DA54F] focus:ring-2 focus:ring-[#0DA54F]/15 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={handlePatientSearchEnter}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-slate-200/80 hover:bg-[#0DA54F] hover:text-white text-[11px] font-semibold text-slate-700 transition-colors cursor-pointer"
                  >
                    Enter ↵
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsPatientRegistrationOpen(true)}
                  className="px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5 text-[#0DA54F]" />
                  <span>New patient</span>
                </button>
              </div>

              {patientSearchError && (
                <p className="text-xs text-rose-600 font-medium">{patientSearchError}</p>
              )}

              {/* Today's Queue Quick Select (No Dropdown) */}
              {queuePatientList.length > 0 && (
                <div className="pt-1 flex items-center gap-2 overflow-x-auto pb-0.5">
                  <span className="text-[11px] font-semibold text-slate-400 shrink-0">
                    Today’s queue:
                  </span>
                  {queuePatientList.slice(0, 4).map(({ patient, appointment }) => (
                    <button
                      key={patient.id}
                      type="button"
                      onClick={() => {
                        setActivePatient(patient);
                        setSelectedPatientId(patient.id);
                        setPatientSearchError('');
                      }}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:border-[#0DA54F] hover:bg-emerald-50/50 text-[11px] font-semibold text-slate-700 transition-all whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {patient.name} · <span className="text-slate-400 tabular-nums">{appointment.appointmentTime || 'Queue'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5 animate-suoxi-pop">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#0DA54F] border border-emerald-200/70 flex items-center justify-center font-bold text-sm shrink-0">
                  {activePatient.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-900 truncate">
                      {activePatient.name}
                    </span>
                    <span className="text-xs font-mono text-slate-500">
                      {activePatient.patientIdCode}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap tabular-nums">
                    <span>{activePatient.phone}</span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize">{activePatient.gender}</span>
                    {activePatient.age && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{activePatient.age} yrs</span>
                      </>
                    )}
                    {activePatient.bloodGroup && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{activePatient.bloodGroup}</span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              {activePatient.allergies && activePatient.allergies.length > 0 ? (
                <div className="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-1.5 shrink-0">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Allergy: {activePatient.allergies.join(', ')}</span>
                </div>
              ) : (
                <span className="text-xs text-[#0DA54F] font-medium shrink-0">
                  {isHistoryLoading ? 'Loading EMR...' : 'No reported drug allergies'}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Branch & Visit Card (Right 6 cols) */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Branch &amp; Visit
            </span>
            <span className="text-[11px] text-slate-500">
              Room {currentUser?.roomNumber || '302'} · Dr. {currentUser?.name || 'Consultant'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-5">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Clinic Branch
              </label>
              <select
                value={activeBranchId}
                onChange={(e) => setActiveBranchId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-[#0DA54F] outline-none"
              >
                {branches.length > 0 ? (
                  branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))
                ) : (
                  <option value="br-dhanmondi">Dhanmondi Branch</option>
                )}
              </select>
            </div>

            <div className="sm:col-span-4">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Visit type
              </label>
              <select
                value={visitType}
                onChange={(e) =>
                  setVisitType(e.target.value as 'New' | 'Follow-up' | 'Procedure Review')
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-[#0DA54F] outline-none"
              >
                <option value="New">New Consultation</option>
                <option value="Follow-up">Follow-up Visit</option>
                <option value="Procedure Review">Procedure Review</option>
              </select>
            </div>

            <div className="sm:col-span-3">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Visit Fee
              </label>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 tabular-nums">
                <span>{formatBDT(consultationFee)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. WORKSPACE ACTION TOOLBAR */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-0.5 relative">
        {/* Left Tools: Staged AI Scribe, AI Assist, Rx Protocols */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setAiModalMode('scribe')}
            className="px-3.5 py-2 rounded-xl bg-white border border-violet-200 hover:bg-violet-50/70 text-violet-700 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer whitespace-nowrap shrink-0"
          >
            <Mic className="w-3.5 h-3.5" />
            <span>AI scribe</span>
          </button>

          <button
            type="button"
            onClick={() => setAiModalMode('assist')}
            className="px-3.5 py-2 rounded-xl bg-white border border-violet-200 hover:bg-violet-50/70 text-violet-700 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer whitespace-nowrap shrink-0"
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>AI assist</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setIsProtocolsMenuOpen((v) => !v);
                setIsManageSectionsOpen(false);
              }}
              className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                isProtocolsMenuOpen
                  ? 'bg-[#0DA54F] text-white border-[#0DA54F]'
                  : 'bg-white border-slate-200 hover:border-[#0DA54F]/50 text-slate-800'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>Rx Protocols</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-70" />
            </button>

            {isProtocolsMenuOpen && (
              <div className="absolute left-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white border border-slate-200 shadow-xl z-30 p-2 space-y-1 animate-suoxi-pop">
                <div className="px-3 py-1.5 flex items-center justify-between border-b border-slate-100">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Aesthetic Protocols ({allProtocols.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsProtocolsMenuOpen(false)}
                    className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                  {allProtocols.map((proto) => (
                    <button
                      key={proto.id}
                      type="button"
                      onClick={() => handleApplyProtocol(proto)}
                      className="w-full text-left px-3 py-2.5 hover:bg-emerald-50/60 rounded-xl transition-colors cursor-pointer"
                    >
                      <p className="text-xs font-bold text-slate-900">{proto.name}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{proto.subtitle}</p>
                    </button>
                  ))}
                </div>
                <div className="pt-1.5 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setIsProtocolsMenuOpen(false);
                      navigate('/consultation/protocols');
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 hover:bg-emerald-50 text-[#0DA54F] text-xs font-bold text-center transition-colors cursor-pointer"
                  >
                    Manage all Rx Protocols →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Controls: Manage Sections, Focus Layout, Hide Preview */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setIsManageSectionsOpen((v) => !v);
                setIsProtocolsMenuOpen(false);
              }}
              className="px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Manage sections</span>
            </button>

            {isManageSectionsOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white border border-slate-200 shadow-xl z-30 p-3 space-y-2 text-xs animate-suoxi-pop">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 pb-1 border-b border-slate-100">
                  Visible Desk Sections
                </p>
                {(
                  [
                    ['skinDiagnostics', 'Skin Diagnostics & Zones'],
                    ['procedures', 'In-Clinic Procedures'],
                    ['lifestylePage', 'Page 2: Diet & Routine'],
                  ] as Array<[keyof VisibleSectionsState, string]>
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center justify-between py-1 cursor-pointer select-none"
                  >
                    <span className="text-slate-700 font-medium">{label}</span>
                    <input
                      type="checkbox"
                      checked={visibleSections[key]}
                      onChange={() =>
                        setVisibleSections((prev) => ({ ...prev, [key]: !prev[key] }))
                      }
                      className="accent-[#0DA54F] w-3.5 h-3.5"
                    />
                  </label>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setFocusLayout((v) => !v)}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              focusLayout
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
            }`}
          >
            {focusLayout ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span>{focusLayout ? 'Standard layout' : 'Focus layout'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{showPreview ? 'Hide preview' : 'Show preview'}</span>
          </button>
        </div>
      </div>

      {/* 5. MAIN 3-COLUMN WORKSPACE GRID */}
      <div
        className={`grid grid-cols-1 gap-4 items-start ${
          showPreview && !focusLayout
            ? 'xl:grid-cols-12'
            : 'lg:grid-cols-12'
        }`}
      >
        {/* ================= COLUMN 1: CLINICAL (SKINCARE & AESTHETIC) ================= */}
        <section
          className={`space-y-4 ${
            showPreview && !focusLayout
              ? 'xl:col-span-4'
              : 'lg:col-span-5'
          }`}
        >
          {/* Section Pill Header */}
          <div className="px-3.5 py-2.5 rounded-xl bg-white border border-slate-200/90 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-[#0DA54F]" />
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Clinical Assessment
              </h2>
            </div>
            <span className="text-[11px] text-slate-400">Dermatology &amp; Skin</span>
          </div>

          {/* 1A. Chief Complaints */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-900">
                1. Chief Complaints
              </label>
              <span className="text-[11px] text-slate-400">Presenting concern</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {COMPLAINT_CHIPS.map((chip) => {
                const active = chiefComplaints.toLowerCase().includes(chip.toLowerCase());
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => appendTextLine(chiefComplaints, setChiefComplaints, chip)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${
                      active
                        ? 'bg-emerald-50 text-[#0DA54F] border-emerald-300 font-semibold'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    + {chip}
                  </button>
                );
              })}
            </div>

            <textarea
              rows={2}
              value={chiefComplaints}
              onChange={(e) => setChiefComplaints(e.target.value)}
              placeholder="Describe skin concerns, onset, triggers, and duration..."
              className="w-full text-xs rounded-xl border border-slate-300 px-3 py-2 text-slate-800 focus:border-[#0DA54F] focus:ring-2 focus:ring-[#0DA54F]/15 outline-none transition-all"
            />
          </div>

          {/* 1B. Past History (includes laser/peel safety flags as compact chips) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-900">
                2. Past History
              </label>
              <span className="text-[11px] text-slate-400">Medical &amp; safety flags</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {PAST_HISTORY_CHIPS.map(({ label, critical }) => {
                const selected = pastHistoryFlags.includes(label);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleArrayItem(setPastHistoryFlags, label)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all active:scale-[0.98] cursor-pointer ${
                      selected
                        ? critical
                          ? 'bg-rose-50 text-rose-700 border-rose-300 font-semibold'
                          : 'bg-emerald-50 text-[#0DA54F] border-emerald-300 font-semibold'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <textarea
              rows={2}
              value={pastHistoryNotes}
              onChange={(e) => setPastHistoryNotes(e.target.value)}
              placeholder="Medical history, allergies, hormonal conditions, or past topical steroid use..."
              className="w-full text-xs rounded-xl border border-slate-300 px-3 py-2 text-slate-800 focus:border-[#0DA54F] focus:ring-2 focus:ring-[#0DA54F]/15 outline-none transition-all"
            />
          </div>

          {/* 1C. History Of Operation */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-900">
                3. History Of Operation
              </label>
              <span className="text-[11px] text-slate-400">Surgical &amp; aesthetic</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {OPERATION_HISTORY_CHIPS.map((chip) => {
                const active = operationHistoryNotes.toLowerCase().includes(chip.toLowerCase());
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => appendTextLine(operationHistoryNotes, setOperationHistoryNotes, chip)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${
                      active
                        ? 'bg-emerald-50 text-[#0DA54F] border-emerald-300 font-semibold'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    + {chip}
                  </button>
                );
              })}
            </div>

            <textarea
              rows={2}
              value={operationHistoryNotes}
              onChange={(e) => setOperationHistoryNotes(e.target.value)}
              placeholder="Previous surgeries, C-section, facial/aesthetic procedures, or post-op keloid..."
              className="w-full text-xs rounded-xl border border-slate-300 px-3 py-2 text-slate-800 focus:border-[#0DA54F] focus:ring-2 focus:ring-[#0DA54F]/15 outline-none transition-all"
            />
          </div>

          {/* 1D. Investigation */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-900">
                4. Investigation
              </label>
              <span className="text-[11px] text-slate-400">Lab &amp; skin screening</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {INVESTIGATION_CHIPS.map((test) => {
                const active = investigations.toLowerCase().includes(test.toLowerCase());
                return (
                  <button
                    key={test}
                    type="button"
                    onClick={() => appendTextLine(investigations, setInvestigations, test)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${
                      active
                        ? 'bg-emerald-50 text-[#0DA54F] border-emerald-300 font-semibold'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    + {test}
                  </button>
                );
              })}
            </div>

            <textarea
              rows={2}
              value={investigations}
              onChange={(e) => setInvestigations(e.target.value)}
              placeholder="Advise lab investigations (e.g. CBC, TSH, Serum Ferritin, Vitamin D3, PCOS panel)..."
              className="w-full text-xs rounded-xl border border-slate-300 px-3 py-2 text-slate-800 focus:border-[#0DA54F] focus:ring-2 focus:ring-[#0DA54F]/15 outline-none transition-all"
            />
          </div>

          {/* 1E. Provisional Diagnosis */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-900">
                5. Provisional Diagnosis <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] text-slate-400">Syncs Rx suggestions</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {DIAGNOSIS_PRESETS.map((diag) => {
                const active = clinicalDiagnosis === diag;
                return (
                  <button
                    key={diag}
                    type="button"
                    onClick={() => setClinicalDiagnosis(active ? '' : diag)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all active:scale-[0.98] cursor-pointer ${
                      active
                        ? 'bg-[#0DA54F] text-white border-[#0DA54F]'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-[#0DA54F]/40 hover:bg-emerald-50/40'
                    }`}
                  >
                    {diag}
                  </button>
                );
              })}
            </div>

            <textarea
              rows={2}
              value={clinicalDiagnosis}
              onChange={(e) => setClinicalDiagnosis(e.target.value)}
              placeholder="e.g. Epidermal Melasma, Grade II Acne Vulgaris, PIH..."
              className="w-full text-xs rounded-xl border border-slate-300 px-3 py-2 font-semibold text-slate-900 focus:border-[#0DA54F] focus:ring-2 focus:ring-[#0DA54F]/15 outline-none transition-all"
            />
          </div>

          {/* 1E. Skin Analysis & Target Aesthetic Zones */}
          {visibleSections.skinDiagnostics && (
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">
                  Skin Profile &amp; On Examination
                </span>
                <span className="text-[11px] text-[#0DA54F] font-semibold">
                  Aesthetic Mapping
                </span>
              </div>

              {/* Fitzpatrick & Skin Type */}
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Fitzpatrick Phototype
                  </label>
                  <select
                    value={fitzpatrickType}
                    onChange={(e) => setFitzpatrickType(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-[#0DA54F] outline-none"
                  >
                    {FITZPATRICK_TYPES.map((ft) => (
                      <option key={ft} value={ft}>
                        {ft}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Skin Type
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {SKIN_TYPES.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setSkinType(st.id)}
                        className={`px-3 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                          skinType === st.id
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Skin Diagnostics Vitals */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <label className="block text-[10.5px] font-semibold text-slate-500 mb-1">
                    Hydration
                  </label>
                  <input
                    type="text"
                    value={hydration}
                    onChange={(e) => setHydration(e.target.value)}
                    placeholder="e.g. 42%"
                    className="w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white tabular-nums focus:border-[#0DA54F] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-semibold text-slate-500 mb-1">
                    Pigmentation
                  </label>
                  <input
                    type="text"
                    value={pigmentation}
                    onChange={(e) => setPigmentation(e.target.value)}
                    placeholder="Epidermal"
                    className="w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white focus:border-[#0DA54F] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-semibold text-slate-500 mb-1">
                    Sebum
                  </label>
                  <input
                    type="text"
                    value={sebum}
                    onChange={(e) => setSebum(e.target.value)}
                    placeholder="Moderate"
                    className="w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white focus:border-[#0DA54F] outline-none"
                  />
                </div>
              </div>

              {/* Target Aesthetic Zones */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">
                  Target Treatment Zones
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {TARGET_ZONES.map((zone) => {
                    const selected = targetZones.includes(zone);
                    return (
                      <button
                        key={zone}
                        type="button"
                        onClick={() => toggleArrayItem(setTargetZones, zone)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${
                          selected
                            ? 'bg-emerald-50 text-[#0DA54F] border-emerald-300 font-semibold'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {zone}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Examination Findings Quick Chips + Notes */}
              <div className="space-y-2 pt-1 border-t border-slate-100">
                <label className="block text-[11px] font-semibold text-slate-600">
                  Dermoscopy / Clinical Findings
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {EXAM_FINDING_CHIPS.map((finding) => {
                    const active = examFindings.includes(finding);
                    return (
                      <button
                        key={finding}
                        type="button"
                        onClick={() => toggleArrayItem(setExamFindings, finding)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${
                          active
                            ? 'bg-emerald-50 text-[#0DA54F] border-emerald-300 font-semibold'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {finding}
                      </button>
                    );
                  })}
                </div>
                <textarea
                  rows={2}
                  value={examinationNotes}
                  onChange={(e) => setExaminationNotes(e.target.value)}
                  placeholder="Wood's lamp depth, erythema, scar grade, skin texture notes..."
                  className="w-full text-xs rounded-xl border border-slate-300 px-3 py-2 text-slate-800 focus:border-[#0DA54F] outline-none"
                />
              </div>
            </div>
          )}

          {/* 1F. Clinical Plan */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-2">
            <label className="block text-xs font-bold text-slate-900">
              Treatment Plan
            </label>
            <textarea
              rows={2}
              value={planNotes}
              onChange={(e) => setPlanNotes(e.target.value)}
              placeholder="e.g. 4-session laser toning at 2-week intervals + daily pigment care..."
              className="w-full text-xs rounded-xl border border-slate-300 px-3 py-2 text-slate-800 focus:border-[#0DA54F] outline-none"
            />
          </div>
        </section>

        {/* ================= COLUMN 2: PRESCRIPTION & PROCEDURES ================= */}
        <section
          className={`space-y-4 ${
            showPreview && !focusLayout
              ? 'xl:col-span-4'
              : 'lg:col-span-7'
          }`}
        >
          {/* Section Pill Header */}
          <div className="px-3.5 py-2.5 rounded-xl bg-white border border-slate-200/90 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#0DA54F]" />
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Prescription &amp; Procedures
              </h2>
            </div>
            <span className="text-[11px] text-slate-400 tabular-nums">
              {medicines.length} Rx · {recommendedProcedures.length} Proc
            </span>
          </div>

          {/* 2A. In-Clinic Aesthetic Procedures + Push to Cashier */}
          {visibleSections.procedures && (
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900">
                  In-Clinic Procedures
                </span>
                <button
                  type="button"
                  onClick={handlePushToCashier}
                  disabled={isPushingCashier || recommendedProcedures.length === 0}
                  className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 text-[#0DA54F] border border-emerald-200 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Send className="w-3 h-3" />
                  <span>{isPushingCashier ? 'Sending...' : 'Push to Cashier →'}</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {PROCEDURE_OPTIONS.map((proc) => {
                  const selected = recommendedProcedures.includes(proc.name);
                  return (
                    <button
                      key={proc.name}
                      type="button"
                      onClick={() => toggleArrayItem(setRecommendedProcedures, proc.name)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all active:scale-[0.98] cursor-pointer flex items-center gap-1.5 ${
                        selected
                          ? 'bg-[#0DA54F] text-white border-[#0DA54F] font-semibold'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {selected && <Check className="w-3 h-3" />}
                      <span>{proc.name}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customProcedureInput}
                  onChange={(e) => setCustomProcedureInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customProcedureInput.trim()) {
                      e.preventDefault();
                      toggleArrayItem(setRecommendedProcedures, customProcedureInput.trim());
                      setCustomProcedureInput('');
                    }
                  }}
                  placeholder="Add custom procedure (press Enter)..."
                  className="flex-1 text-xs rounded-xl border border-slate-300 px-3 py-1.5 bg-slate-50/40 focus:bg-white focus:border-[#0DA54F] outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!customProcedureInput.trim()) return;
                    toggleArrayItem(setRecommendedProcedures, customProcedureInput.trim());
                    setCustomProcedureInput('');
                  }}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {/* 2B. Rx Medications & Topical Skincare */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">
                ℞ Medications &amp; Topical Skincare
              </span>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {medicines.length} item{medicines.length === 1 ? '' : 's'}
              </span>
            </div>

            {/* Contextual Quick Suggestions */}
            <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200/70 space-y-2">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#0DA54F]">
                Usual Regimen for {clinicalDiagnosis ? clinicalDiagnosis.split('(')[0].trim() : 'Skin Care'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {contextualSuggestions.map((sug, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleAddMedicine(sug)}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 border border-emerald-200 text-[11px] font-medium text-slate-800 transition-colors cursor-pointer"
                  >
                    + {sug.name} <span className="text-[#0DA54F] font-semibold">{sug.form}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Editable Medicine / Skincare Cards */}
            <div className="space-y-2.5">
              {medicines.map((med, idx) => {
                const isExpanded = expandedMedIndices[idx] ?? true;
                return (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-200 bg-slate-50/40 overflow-hidden transition-all"
                  >
                    {/* Card Header */}
                    <div className="px-3 py-2.5 bg-white flex items-center justify-between gap-2 border-b border-slate-100">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedMedIndices((prev) => ({ ...prev, [idx]: !isExpanded }))
                        }
                        className="flex-1 text-left min-w-0 cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-400 tabular-nums">
                            {idx + 1}.
                          </span>
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {med.form} {med.name || 'New Medication / Skincare'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 pl-5 truncate mt-0.5 tabular-nums">
                          {[med.genericName, med.dosage, med.duration].filter(Boolean).join(' · ') ||
                            'Click to set dosage & instructions'}
                        </p>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedMedIndices((prev) => ({ ...prev, [idx]: !isExpanded }))
                          }
                          className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                          aria-label="Toggle medicine details"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveMedicine(idx)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                          aria-label="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded Inputs */}
                    {isExpanded && (
                      <div className="p-3 space-y-2.5 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                          <div className="sm:col-span-5">
                            <label className="block text-[10.5px] font-semibold text-slate-500 mb-0.5">
                              Product / Medicine Name
                            </label>
                            <input
                              type="text"
                              value={med.name}
                              onChange={(e) => handleUpdateMedicine(idx, 'name', e.target.value)}
                              placeholder="e.g. Azelaic Acid 20% Cream"
                              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-[#0DA54F] outline-none"
                            />
                          </div>

                          <div className="sm:col-span-4">
                            <label className="block text-[10.5px] font-semibold text-slate-500 mb-0.5">
                              Generic / Active
                            </label>
                            <input
                              type="text"
                              value={med.genericName || ''}
                              onChange={(e) =>
                                handleUpdateMedicine(idx, 'genericName', e.target.value)
                              }
                              placeholder="e.g. Azelaic Acid"
                              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-[#0DA54F] outline-none"
                            />
                          </div>

                          <div className="sm:col-span-3">
                            <label className="block text-[10.5px] font-semibold text-slate-500 mb-0.5">
                              Form
                            </label>
                            <select
                              value={med.form}
                              onChange={(e) =>
                                handleUpdateMedicine(
                                  idx,
                                  'form',
                                  e.target.value as RxMedicineDraft['form']
                                )
                              }
                              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 focus:border-[#0DA54F] outline-none"
                            >
                              {MEDICINE_FORMS.map((f) => (
                                <option key={f} value={f}>
                                  {f}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10.5px] font-semibold text-slate-500 mb-0.5">
                              Dosage / Routine Slot
                            </label>
                            <input
                              type="text"
                              value={med.dosage}
                              onChange={(e) => handleUpdateMedicine(idx, 'dosage', e.target.value)}
                              placeholder="e.g. PM (Night) or 1+0+1"
                              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium focus:border-[#0DA54F] outline-none"
                            />
                            <div className="flex flex-wrap gap-1 mt-1">
                              {DOSAGE_QUICK_CHIPS.map((d) => (
                                <button
                                  key={d}
                                  type="button"
                                  onClick={() => handleUpdateMedicine(idx, 'dosage', d)}
                                  className={`px-1.5 py-0.5 rounded text-[10px] border cursor-pointer ${
                                    med.dosage === d
                                      ? 'bg-[#0DA54F] text-white border-[#0DA54F]'
                                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                  }`}
                                >
                                  {d}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10.5px] font-semibold text-slate-500 mb-0.5">
                              Duration
                            </label>
                            <input
                              type="text"
                              value={med.duration}
                              onChange={(e) => handleUpdateMedicine(idx, 'duration', e.target.value)}
                              placeholder="e.g. 30 days"
                              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium focus:border-[#0DA54F] outline-none"
                            />
                            <div className="flex flex-wrap gap-1 mt-1">
                              {DURATION_QUICK_CHIPS.map((dur) => (
                                <button
                                  key={dur}
                                  type="button"
                                  onClick={() => handleUpdateMedicine(idx, 'duration', dur)}
                                  className={`px-1.5 py-0.5 rounded text-[10px] border cursor-pointer ${
                                    med.duration === dur
                                      ? 'bg-slate-800 text-white border-slate-800'
                                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                  }`}
                                >
                                  {dur}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10.5px] font-semibold text-slate-500 mb-0.5">
                              Instructions (English)
                            </label>
                            <input
                              type="text"
                              value={med.instructions}
                              onChange={(e) =>
                                handleUpdateMedicine(idx, 'instructions', e.target.value)
                              }
                              placeholder="e.g. Apply pea-sized amount after cleansing"
                              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:border-[#0DA54F] outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[10.5px] font-semibold text-slate-500 mb-0.5">
                              নির্দেশনা (Bengali)
                            </label>
                            <input
                              type="text"
                              value={med.instructionsBn || ''}
                              onChange={(e) =>
                                handleUpdateMedicine(idx, 'instructionsBn', e.target.value)
                              }
                              placeholder="যেমন: রাতে ঘুমানোর আগে পাতলা করে লাগাবেন"
                              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bengali focus:border-[#0DA54F] outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => handleAddMedicine()}
              className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-[#0DA54F]" />
              <span>Add medicine / skincare</span>
            </button>
          </div>

          {/* 2C. Advice (Bilingual Quick Chips + Bookmark Library) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-3">
            <span className="block text-xs font-bold text-slate-900">
              Advice (Bilingual EN / BN)
            </span>

            {adviceList.length > 0 && (
              <div className="space-y-1.5">
                {adviceList.map((adv, idx) => (
                  <div
                    key={idx}
                    className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="font-bengali text-slate-800 flex-1">
                      <span className="font-bold text-slate-400 mr-1.5 tabular-nums">
                        {idx + 1}.
                      </span>
                      {adv}
                    </span>
                    <div className="flex items-center gap-1 shrink-0 text-slate-400">
                      <button
                        type="button"
                        onClick={() => handleSaveSingleAdviceChip(adv)}
                        className="p-1 hover:text-[#0DA54F] cursor-pointer"
                        title="Save to quick advice library"
                      >
                        <Bookmark className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveAdvice(idx, -1)}
                        className="p-1 hover:text-slate-700 cursor-pointer"
                        title="Move up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveAdvice(idx, 1)}
                        className="p-1 hover:text-slate-700 cursor-pointer"
                        title="Move down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setAdviceList((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="p-1 hover:text-rose-600 cursor-pointer"
                        title="Remove advice"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <textarea
              rows={2}
              value={adviceInput}
              onChange={(e) => setAdviceInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAddAdvice(false);
                }
              }}
              placeholder="Type advice in English or বাংলা (press Enter to add)..."
              className="w-full text-xs rounded-xl border border-slate-300 px-3 py-2 font-bengali focus:border-[#0DA54F] outline-none"
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleAddAdvice(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
              <button
                type="button"
                onClick={() => handleAddAdvice(true)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1 cursor-pointer"
              >
                <Bookmark className="w-3.5 h-3.5 text-[#0DA54F]" />
                <span>Add and save for later</span>
              </button>
            </div>

            {/* Quick Advice Chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {allAdviceChips.map((chip, idx) => {
                const selected = adviceList.includes(chip);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleArrayItem(setAdviceList, chip)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bengali border text-left transition-all cursor-pointer ${
                      selected
                        ? 'bg-emerald-50 text-[#0DA54F] border-emerald-300 font-semibold'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    + {chip}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2D. Automated Contraindication & Allergy Check Banner */}
          {safetyWarnings.length === 0 ? (
            <div className="px-4 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 text-emerald-800 text-xs font-medium flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#0DA54F] shrink-0" />
              <span>No contraindication or allergy warnings for current selections.</span>
            </div>
          ) : (
            <div className="px-4 py-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs space-y-1">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Clinical Safety Notice</span>
              </div>
              <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                {safetyWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 2E. Page 2: Skincare Routine & Food Guidance (Collapsible) */}
          {visibleSections.lifestylePage && (
            <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between gap-2 bg-slate-50/60">
                <button
                  type="button"
                  onClick={() => setIsLifestyleExpanded((v) => !v)}
                  className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer"
                >
                  {isLifestyleExpanded ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                  <span>PAGE 2 · FOOD, HYDRATION &amp; AM/PM ROUTINE</span>
                </button>

                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeLifestylePage}
                    onChange={(e) => setIncludeLifestylePage(e.target.checked)}
                    className="accent-[#0DA54F] w-3.5 h-3.5"
                  />
                  <span>Include in Rx</span>
                </label>
              </div>

              {isLifestyleExpanded && (
                <div className="p-4 space-y-3 border-t border-slate-100 text-xs animate-suoxi-enter">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                    <div>
                      <label className="font-semibold text-slate-700 flex items-center gap-1 mb-1">
                        <Droplet className="w-3.5 h-3.5 text-sky-500" />
                        Water Target (L/day)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="1"
                        max="6"
                        value={waterLiters}
                        onChange={(e) => setWaterLiters(parseFloat(e.target.value) || 2.5)}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-bold tabular-nums"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="font-semibold text-slate-700 flex items-center gap-1 mb-1">
                        <Sun className="w-3.5 h-3.5 text-amber-500" />
                        Sun &amp; Heat Care (EN)
                      </label>
                      <input
                        type="text"
                        value={sunInstructions}
                        onChange={(e) => setSunInstructions(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Sun &amp; Heat Care (বাংলা নির্দেশনা)
                    </label>
                    <input
                      type="text"
                      value={sunInstructionsBn}
                      onChange={(e) => setSunInstructionsBn(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bengali"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block font-semibold text-amber-900 mb-1">
                        AM Routine (1 step per line)
                      </label>
                      <textarea
                        rows={3}
                        value={morningRoutine.join('\n')}
                        onChange={(e) =>
                          setMorningRoutine(
                            e.target.value
                              .split('\n')
                              .map((s) => s.trim())
                              .filter(Boolean)
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:border-[#0DA54F] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-indigo-900 mb-1">
                        PM Routine (1 step per line)
                      </label>
                      <textarea
                        rows={3}
                        value={eveningRoutine.join('\n')}
                        onChange={(e) =>
                          setEveningRoutine(
                            e.target.value
                              .split('\n')
                              .map((s) => s.trim())
                              .filter(Boolean)
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:border-[#0DA54F] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-emerald-900 mb-1">
                        Recommended Foods (1 per line)
                      </label>
                      <textarea
                        rows={3}
                        value={recommendedFoods.join('\n')}
                        onChange={(e) =>
                          setRecommendedFoods(
                            e.target.value
                              .split('\n')
                              .map((s) => s.trim())
                              .filter(Boolean)
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:border-[#0DA54F] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-rose-900 mb-1">
                        Strictly Avoid (1 per line)
                      </label>
                      <textarea
                        rows={3}
                        value={prohibitedFoods.join('\n')}
                        onChange={(e) =>
                          setProhibitedFoods(
                            e.target.value
                              .split('\n')
                              .map((s) => s.trim())
                              .filter(Boolean)
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:border-[#0DA54F] outline-none"
                      />
                    </div>
                  </div>

                  <div className="pt-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => navigate('/consultation/protocols')}
                      className="text-[11px] font-bold text-[#0DA54F] hover:underline cursor-pointer"
                    >
                      Configure clinic default routines in Rx Protocols →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2F. Follow-up & Next Clinical Session Date (Doctor-Only Hard Rule 2) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-[#0DA54F]" />
                <span className="text-xs font-bold text-slate-900">
                  Follow-up &amp; Next Session Date
                </span>
              </div>
              <span className="text-[11px] text-slate-400">Doctor-locked schedule</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {[
                { label: '+7d', days: 7 },
                { label: '+2w', days: 14 },
                { label: '+1m', days: 30 },
                { label: '+3m', days: 90 },
              ].map((preset) => {
                const targetDate = addDaysToDhakaDate(preset.days);
                const active = nextSessionDate === targetDate;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setNextSessionDate(targetDate)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer tabular-nums ${
                      active
                        ? 'bg-[#0DA54F] text-white border-[#0DA54F]'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}

              <input
                type="date"
                value={nextSessionDate}
                onChange={(e) => setNextSessionDate(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-[#0DA54F] outline-none tabular-nums"
              />
            </div>

            <input
              type="text"
              value={nextSessionNotes}
              onChange={(e) => setNextSessionNotes(e.target.value)}
              placeholder="e.g. Review after 2 weeks for Session 2 Laser Toning..."
              className="w-full text-xs rounded-xl border border-slate-300 px-3 py-2 text-slate-800 focus:border-[#0DA54F] outline-none"
            />
          </div>
        </section>

        {/* ================= COLUMN 3: STICKY LIVE PREVIEW ================= */}
        {showPreview && !focusLayout && (
          <aside className="xl:col-span-4 xl:sticky xl:top-4">
            <LiveRxPreview
              doctor={currentUser}
              branch={activeBranch}
              patient={activePatient}
              diagnosis={clinicalDiagnosis}
              chiefComplaints={chiefComplaints}
              pastHistory={[...pastHistoryFlags, pastHistoryNotes.trim()].filter(Boolean).join(', ')}
              operationHistory={operationHistoryNotes}
              investigations={investigations}
              hydration={hydration}
              pigmentation={pigmentation}
              fitzpatrickType={fitzpatrickType}
              skinType={skinType}
              targetZones={targetZones}
              examinationSummary={examinationNotes}
              recommendedProcedures={recommendedProcedures}
              medicines={medicines}
              adviceList={adviceList}
              planNotes={planNotes}
              nextSessionDate={nextSessionDate}
              includeLifestylePage={includeLifestylePage}
              waterLiters={waterLiters}
              sunInstructions={sunInstructions}
              sunInstructionsBn={sunInstructionsBn}
              morningRoutine={morningRoutine}
              eveningRoutine={eveningRoutine}
              recommendedFoods={recommendedFoods}
              prohibitedFoods={prohibitedFoods}
              finalizedPrescription={createdPrescription}
              onOpenPrint={() => {
                if (createdPrescription) {
                  setActivePrescriptionPrintId(createdPrescription.id);
                }
              }}
            />
          </aside>
        )}
      </div>

      {/* 6. STICKY BOTTOM ACTION BAR */}
      <div className="sticky bottom-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-white/95 backdrop-blur-md border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
            <CloudCheck className="w-4 h-4 text-[#0DA54F]" />
            <span>
              {lastAutosavedAt ? `Draft saved · ${lastAutosavedAt}` : 'Ready'}
            </span>
          </span>
          <span className="hidden sm:inline text-slate-300" aria-hidden="true">|</span>
          <span className="hidden sm:inline tabular-nums">
            {activeBranch?.name || 'Dhanmondi Branch'} · {visitType} · {formatBDT(consultationFee)}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setIsSaveTemplateOpen(true)}
            className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>Save as template</span>
          </button>

          {createdPrescription && (
            <button
              type="button"
              onClick={() => setActivePrescriptionPrintId(createdPrescription.id)}
              className="px-3.5 py-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-[#0DA54F] flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print A4 Rx</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleFinalize}
            disabled={isFinalizing}
            className="px-5 py-2 rounded-xl bg-[#0DA54F] hover:bg-[#0a8740] disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 transition-all active:scale-[0.98] shadow-xs cursor-pointer whitespace-nowrap shrink-0"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isFinalizing ? 'Finalizing...' : 'Finalize & save'}</span>
          </button>
        </div>
      </div>

      {/* 7. SLIDE-OVER QUICK HISTORY & BEFORE/AFTER PHOTOS DRAWER */}
      <PatientHistoryDrawer
        isOpen={isHistoryDrawerOpen}
        onClose={() => setIsHistoryDrawerOpen(false)}
        patient={activePatient}
        consultations={pastConsultations}
        prescriptions={pastPrescriptions}
        packages={patientPackages}
        documents={patientDocuments}
        onCopyPrescription={handleCopyFromHistory}
        onDocumentAdded={(doc) => setPatientDocuments((prev) => [doc, ...prev])}
        addToast={addToast}
      />

      {/* 8. SAVE PROTOCOL TEMPLATE MODAL */}
      {isSaveTemplateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[2px]">
          <form
            onSubmit={handleSaveCustomTemplate}
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-5 space-y-4 animate-suoxi-pop"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Save Current Rx as Protocol Template
              </h3>
              <button
                type="button"
                onClick={() => setIsSaveTemplateOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Protocol Name *
              </label>
              <input
                type="text"
                required
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="e.g. Rosacea Calm & Barrier Protocol"
                className="w-full text-xs rounded-xl border border-slate-300 px-3 py-2 focus:border-[#0DA54F] outline-none"
              />
            </div>
            <p className="text-[11px] text-slate-500">
              Saves current diagnosis, {medicines.length} medication/topical items,{' '}
              {recommendedProcedures.length} procedures, and advice list for 1-click reuse.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsSaveTemplateOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#0DA54F] hover:bg-[#0a8740] text-white text-xs font-semibold cursor-pointer"
              >
                Save Protocol
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 9. STAGED VOICE DICTATION / AI SCRIBE MODAL (Ready for Future Hookup) */}
      {aiModalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[2px]">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-violet-200 shadow-2xl overflow-hidden animate-suoxi-pop">
            <div className="px-5 py-4 bg-violet-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                {aiModalMode === 'assist' ? (
                  <Wand2 className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
                <h3 className="text-sm font-bold">
                  {aiModalMode === 'dictate'
                    ? 'Voice Dictation (EN / BN)'
                    : aiModalMode === 'scribe'
                    ? 'AI Consultation Scribe'
                    : 'AI Clinical Assist'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAiModalMode(null)}
                className="p-1 text-violet-100 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-violet-50 border border-violet-200 text-violet-900">
                <p className="font-semibold">Voice &amp; AI Automation Slot Ready</p>
                <p className="text-[11px] text-violet-700 mt-0.5">
                  Microphone streaming and AI transcription can be connected here later. Meanwhile, type or paste quick consultation notes below to insert them directly into your active form.
                </p>
              </div>

              <textarea
                rows={4}
                value={dictationDraftText}
                onChange={(e) => setDictationDraftText(e.target.value)}
                placeholder="Type or paste dictated consultation note..."
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-violet-500 outline-none"
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500">Insert into section:</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleApplyDictationSnippet('complaints')}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold text-slate-800 cursor-pointer"
                  >
                    + Complaints
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyDictationSnippet('diagnosis')}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold text-slate-800 cursor-pointer"
                  >
                    Set Provisional Diagnosis
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyDictationSnippet('plan')}
                    className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 font-semibold text-white cursor-pointer"
                  >
                    + Plan
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
