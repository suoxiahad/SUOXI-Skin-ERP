import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Search,
  UserPlus,
  CheckCircle,
  AlertTriangle,
  Clock,
  Sparkles,
  Stethoscope,
  Phone,
  ShieldCheck,
  Calendar,
  Layers,
  ArrowRight,
  UserCheck,
  DoorOpen,
  Volume2,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';
import { api } from '../../../api/client.ts';
import type { Patient } from '../../../types/index.ts';
import { formatDateDhaka } from '../../../utils/format.ts';

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

export const ReceptionCheckInView: React.FC = () => {
  const { language, addToast, navigate } = useApp();
  const isBn = language === 'bn';

  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchPhone, setSearchPhone] = useState('');
  const [matchedPatient, setMatchedPatient] = useState<Patient | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // New Patient Walk-in Intake Form State
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAge, setNewAge] = useState<number | ''>('');
  const [newGender, setNewGender] = useState<'female' | 'male' | 'other' | ''>('');
  const [newAddress, setNewAddress] = useState('Dhanmondi, Dhaka');
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

  // Load patient list
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

  // Search by phone
  const handlePhoneSearch = () => {
    const q = searchPhone.trim();
    if (!q) return;
    const found = patients.find(
      (p) => p.phone.includes(q) || (p.patientIdCode && p.patientIdCode.includes(q))
    );
    if (found) {
      setMatchedPatient(found);
      addToast({
        type: 'success',
        title: 'Existing Patient Found',
        description: `${found.name} (${found.patientIdCode || found.id}) ready for check-in.`,
      });
    } else {
      setMatchedPatient(null);
      setNewPhone(q);
      addToast({
        type: 'info',
        title: 'New First-Time Patient',
        description: 'No previous record for this phone. Please fill in the first-time intake form.',
      });
    }
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
    setSearchPhone('');
  };

  // Register & Check-in new patient
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
        title: 'New Patient Registered & Checked In!',
        description: `Patient ID ${created.patientIdCode} generated. Assigned Token ${nextTokenNum}.`,
      });

      // Reset form
      setNewName('');
      setNewPhone('');
      setNewAge('');
      setNewGender('');
      setNewBloodGroup('');
      setSearchPhone('');
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Registration Failed',
        description: err.message || 'Server error',
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
              Reception Front Desk & Patient Check-In
            </h1>
          </div>
        </div>

        <button
          onClick={() => navigate('/billing/counter')}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer shrink-0"
        >
          <DoorOpen className="w-4 h-4 text-[#0DA54F]" />
          <span>Send to Billing POS</span>
        </button>
      </div>

      {/* Main Layout: Left Intake & Check-in, Right Live Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Phone Search & Intake Form (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          {/* Quick Phone Search Card */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Search className="w-4 h-4 text-[#0DA54F]" />
              <span>Step 1: Patient Phone / SX-ID Lookup</span>
            </span>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchPhone}
                  onChange={(e) => setSearchPhone(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePhoneSearch()}
                  placeholder="Enter phone number (+8801...) or SX ID code..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                />
              </div>
              <button
                onClick={handlePhoneSearch}
                className="px-4 py-2 bg-[#0DA54F] hover:bg-[#0b8841] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                Lookup
              </button>
            </div>

            {/* Matched Patient Banner */}
            {matchedPatient && (
              <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200 space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-emerald-950">{matchedPatient.name}</h4>
                    <p className="text-[11px] text-emerald-800">
                      ID: {matchedPatient.patientIdCode} · {matchedPatient.phone} · {matchedPatient.gender}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white text-emerald-700 border border-emerald-200">
                    Existing Client
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-emerald-200/80">
                  <div className="text-[11px] text-slate-600">
                    Assigned: <strong>{assignedDoctor}</strong> ({assignedRoom})
                  </div>
                  <button
                    onClick={handleCheckInExisting}
                    className="px-3.5 py-1.5 bg-[#0DA54F] hover:bg-[#0a8740] text-white font-bold text-xs rounded-lg shadow-2xs cursor-pointer flex items-center gap-1.5"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Check-In to Lounge</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* First-Time Patient Intake Form */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-[#0DA54F]" />
                <span>Step 2: First-Time Aesthetic Intake (Walk-In)</span>
              </span>
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
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
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
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono"
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
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Gender</label>
                  <select
                    value={newGender}
                    onChange={(e) => setNewGender(e.target.value as any)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
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
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono"
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
                    <option value="Laser Suite 1">Laser Suite 1 (CO2 & Nd:YAG)</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 bg-[#0DA54F] hover:bg-[#0b8841] text-white font-bold rounded-lg shadow-xs flex items-center justify-center gap-1.5 cursor-pointer mt-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>{isSubmitting ? 'Registering...' : 'Register Patient & Assign Token'}</span>
              </button>
            </form>
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

              <span className="px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-emerald-50 text-[#0DA54F] border border-emerald-200">
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
                          onClick={() => handleUpdateQueueStatus(item.id, 'In Consultation')}
                          className="px-2.5 py-1.5 bg-[#0DA54F] hover:bg-[#0b8841] text-white rounded-lg text-xs font-semibold cursor-pointer shadow-2xs"
                        >
                          Call to Doctor Room →
                        </button>
                      )}
                      {item.status === 'In Consultation' && (
                        <button
                          onClick={() => handleUpdateQueueStatus(item.id, 'At Billing Desk')}
                          className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-2xs"
                        >
                          Send to Billing POS →
                        </button>
                      )}
                      {item.status === 'At Billing Desk' && (
                        <button
                          onClick={() => handleUpdateQueueStatus(item.id, 'Completed')}
                          className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
                        >
                          Mark Completed ✓
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
