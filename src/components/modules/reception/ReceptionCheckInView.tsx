import React, { useState, useEffect } from 'react';
import {
  Search,
  UserPlus,
  Sparkles,
  Phone,
  ArrowRight,
  UserCheck,
  DoorOpen,
  Volume2,
  AlertCircle,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';
import { api } from '../../../api/client.ts';
import type { Patient } from '../../../types/index.ts';
import { canManageBilling } from '../../../utils/rbac.ts';

interface QueueToken {
  id: string;
  tokenNumber: string; // e.g. T-101
  patientId: string;
  patientName: string;
  patientPhone: string;
  doctorName: string;
  roomName: string;
  serviceCategory: string;
  status: 'Waiting in Lounge' | 'In Consultation' | 'At Billing Desk' | 'Completed';
  checkInTime: string;
  fitzpatrickScale?: string;
  allergies?: string[];
}

type CheckInTab = 'phone' | 'walkin';

export const ReceptionCheckInView: React.FC = () => {
  const { addToast, navigate, currentUser } = useApp();
  const allowBillingPos = canManageBilling(currentUser);

  const [activeTab, setActiveTab] = useState<CheckInTab>('phone');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchPhone, setSearchPhone] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [matchedPatients, setMatchedPatients] = useState<Patient[]>([]);
  const [matchedPatient, setMatchedPatient] = useState<Patient | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // New Patient Walk-In Intake Form State
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAge, setNewAge] = useState<number | ''>('');
  const [newGender, setNewGender] = useState<'female' | 'male' | 'other' | ''>('');
  const [newAddress, setNewAddress] = useState('');
  const [newBloodGroup, setNewBloodGroup] = useState('');
  const [newSkinType, setNewSkinType] = useState('Type IV (South Asian Moderate Brown)');
  const [newSkinConcern, setNewSkinConcern] = useState('Acne Outbreaks & Hyperpigmentation');
  const [newAllergies, setNewAllergies] = useState('None');
  const [assignedDoctor, setAssignedDoctor] = useState('Dr. Nusrat Jahan');
  const [assignedRoom, setAssignedRoom] = useState('Room 302 (Dermatology Suite)');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Live Reception Queue
  const [queue, setQueue] = useState<QueueToken[]>([
    {
      id: 'q-1',
      tokenNumber: 'T-101',
      patientId: 'pt-1',
      patientName: 'Taslima Akter',
      patientPhone: '+8801712345678',
      doctorName: 'Dr. Nusrat Jahan',
      roomName: 'Room 302 (Dermatology Suite)',
      serviceCategory: 'Skin Care & Laser',
      status: 'In Consultation',
      checkInTime: '10:15 AM',
      fitzpatrickScale: 'Type IV',
      allergies: ['Penicillin'],
    },
    {
      id: 'q-2',
      tokenNumber: 'T-102',
      patientId: 'pt-2',
      patientName: 'Md. Farhan Chowdhury',
      patientPhone: '+8801819876543',
      doctorName: 'Dr. Nusrat Jahan',
      roomName: 'Laser Suite 1',
      serviceCategory: 'Fractional CO2 Laser',
      status: 'Waiting in Lounge',
      checkInTime: '10:45 AM',
      fitzpatrickScale: 'Type III',
    },
    {
      id: 'q-3',
      tokenNumber: 'T-103',
      patientId: 'pt-3',
      patientName: 'Sadia Rahman',
      patientPhone: '+8801911223399',
      doctorName: 'Dr. Tanvir Ahmed',
      roomName: 'Room 305 (Cosmetic Suite)',
      serviceCategory: 'Rosacea Laser Toning',
      status: 'Waiting in Lounge',
      checkInTime: '11:00 AM',
      fitzpatrickScale: 'Type IV',
      allergies: ['Fragrance'],
    },
  ]);

  // Load patient directory for fast lookup
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    api.patients
      .list()
      .then((data) => {
        if (isMounted) setPatients(data || []);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Search by phone or SX-ID
  const handlePhoneSearch = async () => {
    const q = searchPhone.trim();
    if (!q) return;

    setHasSearched(true);
    setIsLoading(true);
    try {
      const remoteMatches = await api.patients.list(q).catch(() => []);
      const normalizedQ = q.toLowerCase().replace(/[\s-]/g, '');

      const pool = remoteMatches.length > 0 ? remoteMatches : patients;
      const matches = pool.filter((p) => {
        const phoneNorm = (p.phone || '').toLowerCase().replace(/[\s-]/g, '');
        const codeNorm = (p.patientIdCode || '').toLowerCase();
        const nameNorm = (p.name || '').toLowerCase();
        return (
          phoneNorm.includes(normalizedQ) ||
          codeNorm.includes(normalizedQ) ||
          nameNorm.includes(q.toLowerCase())
        );
      });

      setMatchedPatients(matches);
      if (matches.length > 0) {
        setMatchedPatient(matches[0]);
        addToast({
          type: 'success',
          title: 'Existing Patient Found',
          description: `${matches[0].name} (${matches[0].patientIdCode || matches[0].id}) ready for check-in.`,
        });
      } else {
        setMatchedPatient(null);
        setNewPhone(q);
        addToast({
          type: 'info',
          title: 'No Matching Record Found',
          description: 'Switch to the Walk-In tab to register this patient.',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchToWalkInWithPhone = () => {
    const q = searchPhone.trim();
    if (q && !newPhone.trim()) {
      setNewPhone(q);
    }
    setActiveTab('walkin');
  };

  // Check-in existing patient
  const handleCheckInExisting = () => {
    if (!matchedPatient) return;
    const nextTokenNum = `T-${100 + queue.length + 1}`;
    const newQueueItem: QueueToken = {
      id: `q-${Date.now()}`,
      tokenNumber: nextTokenNum,
      patientId: matchedPatient.id,
      patientName: matchedPatient.name,
      patientPhone: matchedPatient.phone,
      doctorName: assignedDoctor,
      roomName: assignedRoom,
      serviceCategory: 'Aesthetic Consultation',
      status: 'Waiting in Lounge',
      checkInTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      fitzpatrickScale: 'Type IV',
      allergies: matchedPatient.allergies,
    };

    setQueue((prev) => [newQueueItem, ...prev]);
    addToast({
      type: 'success',
      title: 'Patient Checked-In to Lounge',
      description: `Token ${nextTokenNum} assigned to ${matchedPatient.name}. Waiting for ${assignedDoctor}.`,
    });
    setMatchedPatient(null);
    setMatchedPatients([]);
    setHasSearched(false);
    setSearchPhone('');
  };

  // Register & Check-in new walk-in patient
  const handleRegisterNewPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) {
      addToast({ type: 'warning', title: 'Name and Phone required', description: 'Please complete required fields.' });
      return;
    }

    try {
      setIsSubmitting(true);
      const created = await api.patients.create({
        name: newName.trim(),
        phone: newPhone.trim(),
        gender: newGender ? newGender : undefined,
        age: typeof newAge === 'number' ? newAge : (Number(newAge) || undefined),
        bloodGroup: newBloodGroup || undefined,
        address: newAddress,
        skinType: 'combination',
        allergies: newAllergies !== 'None' ? [newAllergies] : [],
        medicalHistory: `First-time aesthetic intake: ${newSkinConcern}. Phototype: ${newSkinType}.`,
      });

      const nextTokenNum = `T-${100 + queue.length + 1}`;
      const newQueueItem: QueueToken = {
        id: `q-${Date.now()}`,
        tokenNumber: nextTokenNum,
        patientId: created.id,
        patientName: created.name,
        patientPhone: created.phone,
        doctorName: assignedDoctor,
        roomName: assignedRoom,
        serviceCategory: 'First-time Aesthetic Consultation',
        status: 'Waiting in Lounge',
        checkInTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        fitzpatrickScale: newSkinType,
        allergies: created.allergies,
      };

      setQueue((prev) => [newQueueItem, ...prev]);
      setPatients((prev) => [created, ...prev]);

      addToast({
        type: 'success',
        title: 'New Patient Registered & Checked In',
        description: `Patient ID ${created.patientIdCode} generated. Assigned Token ${nextTokenNum}.`,
      });

      // Reset form
      setNewName('');
      setNewPhone('');
      setNewAge('');
      setNewGender('');
      setNewAddress('');
      setNewBloodGroup('');
      setSearchPhone('');
      setMatchedPatient(null);
      setMatchedPatients([]);
      setHasSearched(false);
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Registration Failed',
        description: err instanceof Error ? err.message : 'Server error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Queue status update
  const handleUpdateQueueStatus = (id: string, newStatus: QueueToken['status']) => {
    setQueue((prev) =>
      prev.map((q) => (q.id === id ? { ...q, status: newStatus } : q))
    );
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-sky-400 flex items-center justify-center text-white shadow-xs shrink-0">
            <UserCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Reception Front Desk &amp; Patient Check-In
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Search returning patients by phone or register first-time walk-in arrivals into the live lounge queue.
            </p>
          </div>
        </div>

        {allowBillingPos && (
          <button
            type="button"
            onClick={() => navigate('/billing/counter')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer whitespace-nowrap shrink-0"
          >
            <DoorOpen className="w-4 h-4 text-[#0DA54F]" />
            <span>Send to Billing POS</span>
          </button>
        )}
      </div>

      {/* Main Layout: Left 2-Tab Desk (6 cols), Right Live Queue (6 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: 2-Tab Reception Desk */}
        <div className="lg:col-span-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            {/* Segmented 2-Tab Navigation Bar */}
            <div className="p-3 border-b border-slate-200 bg-slate-50/70">
              <div
                role="tablist"
                aria-label="Reception Check-In Mode"
                className="grid grid-cols-2 gap-1.5 p-1 bg-slate-200/70 rounded-xl"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'phone'}
                  onClick={() => setActiveTab('phone')}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === 'phone'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Search className="w-3.5 h-3.5 text-[#0DA54F]" />
                  <span>Patient Phone</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'walkin'}
                  onClick={() => setActiveTab('walkin')}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === 'walkin'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5 text-[#0DA54F]" />
                  <span>Walk-In</span>
                </button>
              </div>
            </div>

            {/* Tab 1: Patient Phone Search & Check-In */}
            {activeTab === 'phone' ? (
              <div role="tabpanel" className="p-5 space-y-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Patient Phone &amp; SX-ID Lookup
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Search an existing patient by mobile number or patient code to issue a lounge token.
                  </p>
                </div>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchPhone}
                      onChange={(e) => setSearchPhone(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && void handlePhoneSearch()}
                      placeholder="Enter phone number (+8801...) or SX ID code..."
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={isLoading || !searchPhone.trim()}
                    onClick={() => void handlePhoneSearch()}
                    className="px-4 py-2.5 bg-[#0DA54F] hover:bg-[#0b8841] disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {isLoading ? 'Searching...' : 'Search'}
                  </button>
                </div>

                {/* Multiple match selector if more than one patient shares query */}
                {matchedPatients.length > 1 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold text-slate-500">
                      {matchedPatients.length} matching records found — select patient:
                    </p>
                    <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto">
                      {matchedPatients.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setMatchedPatient(p)}
                          className={`w-full text-left px-3 py-2 rounded-lg border text-xs flex items-center justify-between transition-colors cursor-pointer ${
                            matchedPatient?.id === p.id
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-semibold'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <span>{p.name}</span>
                          <span className="font-mono text-[11px] text-slate-500">
                            {p.patientIdCode} · {p.phone}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Matched Patient Banner + Doctor/Room Assignment */}
                {matchedPatient ? (
                  <div className="p-4 bg-emerald-50/70 rounded-xl border border-emerald-200 space-y-3 animate-in fade-in">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-bold text-sm text-emerald-950">{matchedPatient.name}</h4>
                        <p className="text-xs text-emerald-800 mt-0.5 font-mono">
                          {matchedPatient.patientIdCode} · {matchedPatient.phone}
                        </p>
                        <p className="text-[11px] text-emerald-700 capitalize mt-0.5">
                          {matchedPatient.gender || 'Unspecified'}
                          {matchedPatient.age ? ` · ${matchedPatient.age} yrs` : ''}
                          {matchedPatient.bloodGroup ? ` · ${matchedPatient.bloodGroup}` : ''}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white text-emerald-700 border border-emerald-200 shrink-0">
                        Existing Client
                      </span>
                    </div>

                    {/* Doctor & Room Allocation for Returning Check-In */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-emerald-200/70 text-xs">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Assigned Doctor</label>
                        <select
                          value={assignedDoctor}
                          onChange={(e) => setAssignedDoctor(e.target.value)}
                          className="w-full p-2 bg-white border border-emerald-200 rounded-lg text-slate-800"
                        >
                          <option value="Dr. Nusrat Jahan">Dr. Nusrat Jahan (Dermatologist)</option>
                          <option value="Dr. Tanvir Ahmed">Dr. Tanvir Ahmed (Laser Specialist)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Assigned Room</label>
                        <select
                          value={assignedRoom}
                          onChange={(e) => setAssignedRoom(e.target.value)}
                          className="w-full p-2 bg-white border border-emerald-200 rounded-lg text-slate-800"
                        >
                          <option value="Room 302 (Dermatology Suite)">Room 302 (Dermatology)</option>
                          <option value="Room 305 (Cosmetic Suite)">Room 305 (Cosmetic Suite)</option>
                          <option value="Laser Suite 1">Laser Suite 1 (CO2 &amp; Nd:YAG)</option>
                        </select>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleCheckInExisting}
                      className="w-full py-2.5 px-4 bg-[#0DA54F] hover:bg-[#0a8740] text-white font-bold text-xs rounded-lg shadow-2xs cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                    >
                      <UserCheck className="w-4 h-4" />
                      <span>Check-In to Lounge</span>
                    </button>
                  </div>
                ) : hasSearched ? (
                  <div className="p-4 bg-amber-50/70 rounded-xl border border-amber-200 space-y-3 animate-in fade-in">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold text-amber-950">
                          No existing patient found for "{searchPhone.trim()}"
                        </p>
                        <p className="text-[11px] text-amber-800 mt-0.5">
                          Register this visitor as a first-time patient under the Walk-In tab.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleSwitchToWalkInWithPhone}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span>Register in Walk-In Tab</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="p-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-center space-y-2">
                    <Phone className="w-5 h-5 text-slate-400 mx-auto" />
                    <p className="text-xs font-medium text-slate-600">
                      Enter a phone number or SX patient ID above to verify patient history and assign a room token.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('walkin')}
                      className="text-xs font-semibold text-[#0DA54F] hover:underline cursor-pointer"
                    >
                      First-time visitor? Switch to Walk-In Intake &rarr;
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Tab 2: First-Time Aesthetic Intake (Walk-In) */
              <div role="tabpanel" className="p-5 space-y-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    First-Time Aesthetic Intake (Walk-In)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Register a new walk-in patient, record skin triage, and immediately issue a lounge queue token.
                  </p>
                </div>

                <form onSubmit={handleRegisterNewPatient} className="space-y-3.5 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Full Name *</label>
                      <input
                        type="text"
                        required
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="e.g. Farzana Chowdhury"
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-[#0DA54F]"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Mobile Phone *</label>
                      <input
                        type="text"
                        required
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="+88017XXXXXXXX"
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:outline-none focus:border-[#0DA54F]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Age</label>
                      <input
                        type="number"
                        min="1"
                        max="120"
                        value={newAge}
                        onChange={(e) => setNewAge(e.target.value ? parseInt(e.target.value, 10) : '')}
                        placeholder="e.g. 28"
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:outline-none focus:border-[#0DA54F]"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Gender</label>
                      <select
                        value={newGender}
                        onChange={(e) => setNewGender(e.target.value as 'female' | 'male' | 'other' | '')}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-[#0DA54F]"
                      >
                        <option value="">Select Gender</option>
                        <option value="female">Female</option>
                        <option value="male">Male</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Blood Group</label>
                      <select
                        value={newBloodGroup}
                        onChange={(e) => setNewBloodGroup(e.target.value)}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:outline-none focus:border-[#0DA54F]"
                      >
                        <option value="">Select Blood Group</option>
                        <option value="A+">A+</option>
                        <option value="B+">B+</option>
                        <option value="O+">O+</option>
                        <option value="AB+">AB+</option>
                        <option value="A-">A-</option>
                        <option value="B-">B-</option>
                        <option value="O-">O-</option>
                        <option value="AB-">AB-</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Address</label>
                    <input
                      type="text"
                      value={newAddress}
                      onChange={(e) => setNewAddress(e.target.value)}
                      placeholder="e.g. House 14, Road 3, Shantinagar, Dhaka"
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-[#0DA54F]"
                    />
                  </div>

                  {/* Aesthetic Specific Triage */}
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2.5">
                    <h5 className="font-bold text-[11px] text-slate-800 uppercase tracking-wider flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-[#0DA54F]" />
                      <span>Clinical Aesthetic Triage</span>
                    </h5>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block font-medium text-slate-600 mb-1">Fitzpatrick Skin Phototype</label>
                        <select
                          value={newSkinType}
                          onChange={(e) => setNewSkinType(e.target.value)}
                          className="w-full p-1.5 bg-white border border-slate-200 rounded text-[11px]"
                        >
                          <option value="Type III (Fair-Medium)">Type III (Fair-Medium)</option>
                          <option value="Type IV (South Asian Moderate Brown)">Type IV (South Asian Standard)</option>
                          <option value="Type V (Deep Brown)">Type V (Deep Brown)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-medium text-slate-600 mb-1">Primary Skin Concern</label>
                        <input
                          type="text"
                          value={newSkinConcern}
                          onChange={(e) => setNewSkinConcern(e.target.value)}
                          placeholder="e.g. Melasma, Acne Scars, Dullness"
                          className="w-full p-1.5 bg-white border border-slate-200 rounded text-[11px]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block font-medium text-slate-600 mb-1">Allergies / Contraindications</label>
                      <input
                        type="text"
                        value={newAllergies}
                        onChange={(e) => setNewAllergies(e.target.value)}
                        placeholder="e.g. Penicillin, Fragrance, Aspirin, or None"
                        className="w-full p-1.5 bg-white border border-slate-200 rounded text-[11px]"
                      />
                    </div>
                  </div>

                  {/* Doctor & Room Allocation */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Assigned Doctor</label>
                      <select
                        value={assignedDoctor}
                        onChange={(e) => setAssignedDoctor(e.target.value)}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                      >
                        <option value="Dr. Nusrat Jahan">Dr. Nusrat Jahan (Dermatologist)</option>
                        <option value="Dr. Tanvir Ahmed">Dr. Tanvir Ahmed (Laser Specialist)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Assigned Room</label>
                      <select
                        value={assignedRoom}
                        onChange={(e) => setAssignedRoom(e.target.value)}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                      >
                        <option value="Room 302 (Dermatology Suite)">Room 302 (Dermatology)</option>
                        <option value="Room 305 (Cosmetic Suite)">Room 305 (Cosmetic Suite)</option>
                        <option value="Laser Suite 1">Laser Suite 1 (CO2 &amp; Nd:YAG)</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2.5 bg-[#0DA54F] hover:bg-[#0b8841] disabled:opacity-60 text-white font-bold rounded-lg shadow-xs flex items-center justify-center gap-1.5 cursor-pointer mt-2 whitespace-nowrap shrink-0"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>{isSubmitting ? 'Registering...' : 'Register Patient & Assign Token'}</span>
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Reception Lounge Queue Board (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-[#0DA54F]" />
                  <span>Live Reception Lounge Queue Board</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time status of patients waiting in lounge or inside consultation rooms.
                </p>
              </div>

              <span className="px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-emerald-50 text-[#0DA54F] border border-emerald-200 whitespace-nowrap shrink-0">
                {queue.filter((q) => q.status === 'Waiting in Lounge').length} in Lounge
              </span>
            </div>

            {/* Queue items */}
            <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
              {queue.map((item) => (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl border transition-all ${
                    item.status === 'In Consultation'
                      ? 'bg-emerald-50/60 border-emerald-300 shadow-2xs'
                      : item.status === 'At Billing Desk'
                      ? 'bg-blue-50/60 border-blue-300'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-sm font-bold bg-slate-900 text-white px-2.5 py-1 rounded-lg">
                        {item.tokenNumber}
                      </span>
                      <div>
                        <h4 className="font-bold text-sm text-slate-900">{item.patientName}</h4>
                        <p className="text-[11px] text-slate-500">
                          {item.patientPhone} · Checked in at {item.checkInTime}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        item.status === 'In Consultation'
                          ? 'bg-emerald-100 text-emerald-800'
                          : item.status === 'At Billing Desk'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Assigned Provider</span>
                      <span className="font-semibold text-slate-800">{item.doctorName}</span>
                      <span className="text-[11px] text-slate-500 block">{item.roomName}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {item.status === 'Waiting in Lounge' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateQueueStatus(item.id, 'In Consultation')}
                          className="px-2.5 py-1.5 bg-[#0DA54F] hover:bg-[#0b8841] text-white rounded-lg text-xs font-semibold cursor-pointer shadow-2xs whitespace-nowrap shrink-0"
                        >
                          Call to Doctor Room &rarr;
                        </button>
                      )}
                      {item.status === 'In Consultation' && allowBillingPos && (
                        <button
                          type="button"
                          onClick={() => handleUpdateQueueStatus(item.id, 'At Billing Desk')}
                          className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-2xs whitespace-nowrap shrink-0"
                        >
                          Send to Billing POS &rarr;
                        </button>
                      )}
                      {item.status === 'At Billing Desk' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateQueueStatus(item.id, 'Completed')}
                          className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                        >
                          Mark Completed &#10003;
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
