import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  Phone,
  CheckCircle,
  XCircle,
  Filter,
  Plus,
  RefreshCw,
  Search,
  AlertCircle,
  Building2,
  FileText,
  UserPlus,
  Users,
  CheckCircle2,
  CalendarCheck,
  Activity,
  Droplet,
  MapPin,
  Stethoscope,
  Radio,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';
import { api } from '../../../api/client.ts';
import type { Appointment, AppointmentStatus, Patient } from '../../../types/index.ts';
import { formatDateDhaka, formatTime12h, getStatusBadgeClass } from '../../../utils/format.ts';
import { TableSkeleton } from '../../common/Skeleton.tsx';
import { EmptyState } from '../../common/EmptyState.tsx';
import { ConfirmReasonModal } from '../../common/ConfirmReasonModal.tsx';

export const AppointmentList: React.FC = () => {
  const {
    branches,
    activeBranchId,
    addToast,
    setIsQuickBookOpen,
    setIsPatientRegistrationOpen,
    setCurrentView,
    setSelectedPatientId,
    userRole,
  } = useApp();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patientsMap, setPatientsMap] = useState<Record<string, Patient>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [dateFilter, setDateFilter] = useState<'today' | 'tomorrow' | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>(activeBranchId);
  const [searchQuery, setSearchQuery] = useState('');

  // Cancellation modal
  const [cancellingAptId, setCancellingAptId] = useState<string | null>(null);

  // Fetch patients map for instant patient detail resolution (Age, Gender, Address, Blood Group)
  const fetchPatients = async () => {
    try {
      const list = await api.patients.list();
      const map: Record<string, Patient> = {};
      list.forEach((p) => {
        map[p.id] = p;
      });
      setPatientsMap(map);
    } catch {
      // ignore
    }
  };

  const fetchAppointments = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setError('');
    try {
      let dateParam: string | undefined;
      if (dateFilter === 'today') dateParam = '2026-10-17';
      if (dateFilter === 'tomorrow') dateParam = '2026-10-18';

      const [data] = await Promise.all([
        api.appointments.list({
          branchId: branchFilter !== 'all' ? branchFilter : undefined,
          date: dateParam,
          status: statusFilter !== 'all' ? statusFilter : undefined,
        }),
        fetchPatients(),
      ]);
      setAppointments(data);
    } catch (err: unknown) {
      if (showLoading) {
        setError((err as Error).message || 'Failed to fetch appointments');
      }
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchAppointments(true);
  }, [dateFilter, statusFilter, branchFilter]);

  // Live Auto-Update Listener & Background Heartbeat
  useEffect(() => {
    const handleAppointmentEvent = (e: Event) => {
      const customEvt = e as CustomEvent<Appointment>;
      if (customEvt?.detail && customEvt.detail.id) {
        const newApt = customEvt.detail;

        // Instant visual update (0ms latency)
        setAppointments((prev) => {
          const exists = prev.some((a) => a.id === newApt.id);
          if (exists) {
            return prev.map((a) => (a.id === newApt.id ? { ...a, ...newApt } : a));
          }
          return [newApt, ...prev];
        });

        // Also update patientsMap optimistically if patient data provided
        if (newApt.patientId) {
          setPatientsMap((prev) => ({
            ...prev,
            [newApt.patientId]: {
              id: newApt.patientId,
              name: newApt.patientName || 'Registered Patient',
              phone: newApt.patientPhone || '',
              age: newApt.patientAge || 28,
              gender: newApt.patientGender || 'female',
              address: newApt.patientAddress || 'Dhanmondi, Dhaka',
              bloodGroup: newApt.patientBloodGroup || 'B+',
              patientIdCode: (newApt as any).patientCode || 'SX-2026',
            } as any,
          }));
        }
      }
      // Re-fetch in background to ensure server-side consistency
      fetchAppointments(false);
    };

    window.addEventListener('appointment-created', handleAppointmentEvent);
    window.addEventListener('appointments-updated', handleAppointmentEvent);
    window.addEventListener('focus', () => fetchAppointments(false));

    // Live polling every 5 seconds for multi-user / real-time updates
    const pollInterval = setInterval(() => {
      fetchAppointments(false);
    }, 5000);

    return () => {
      window.removeEventListener('appointment-created', handleAppointmentEvent);
      window.removeEventListener('appointments-updated', handleAppointmentEvent);
      window.removeEventListener('focus', () => fetchAppointments(false));
      clearInterval(pollInterval);
    };
  }, [dateFilter, statusFilter, branchFilter]);

  const handleStatusChange = async (aptId: string, newStatus: AppointmentStatus, reason?: string) => {
    try {
      const updated = await api.appointments.updateStatus(aptId, newStatus, reason);
      setAppointments((prev) => prev.map((a) => (a.id === aptId ? updated : a)));
      addToast({
        type: 'success',
        title: 'Status Updated',
        description: `Appointment marked as ${newStatus.toUpperCase()}`,
      });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Failed to update status',
        description: (err as Error).message,
      });
    }
  };

  const filteredAppointments = appointments.filter((apt) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase().trim();
    const pt = patientsMap[apt.patientId];
    const patientName = (apt.patientName || pt?.name || '').toLowerCase();
    const patientPhone = apt.patientPhone || pt?.phone || '';
    const disease = (apt.diseaseName || '').toLowerCase();
    const doctor = (apt.doctorName || '').toLowerCase();
    const bookingMethod = (apt.bookingMethod || '').toLowerCase();
    const notes = (apt.notes || '').toLowerCase();
    const address = (apt.patientAddress || pt?.address || '').toLowerCase();
    const bloodGroup = (apt.patientBloodGroup || pt?.bloodGroup || '').toLowerCase();

    return (
      patientName.includes(q) ||
      patientPhone.includes(q) ||
      disease.includes(q) ||
      doctor.includes(q) ||
      bookingMethod.includes(q) ||
      notes.includes(q) ||
      address.includes(q) ||
      bloodGroup.includes(q)
    );
  });

  // KPI Calculations
  const totalCount = appointments.length;
  const confirmedCount = appointments.filter((a) => a.status === 'confirmed').length;
  const visitedCount = appointments.filter((a) => a.status === 'visited').length;
  const bookedCount = appointments.filter((a) => a.status === 'booked').length;

  const getBookingMethodBadge = (method?: string) => {
    const m = method || 'Phone GP';
    if (m === 'WhatsApp') {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (m === 'Phone GP' || m === 'IP Call') {
      return 'bg-blue-50 text-blue-700 border-blue-200';
    }
    if (m === 'Walk-in') {
      return 'bg-purple-50 text-purple-700 border-purple-200';
    }
    if (m === 'Website') {
      return 'bg-cyan-50 text-cyan-700 border-cyan-200';
    }
    if (m === 'Facebook Messenger') {
      return 'bg-sky-50 text-sky-700 border-sky-200';
    }
    if (m === 'Instagram DM') {
      return 'bg-pink-50 text-pink-700 border-pink-200';
    }
    return 'bg-amber-50 text-amber-700 border-amber-200';
  };

  return (
    <div className="space-y-4 w-full">
      {/* Top Banner & KPI Cards */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            CRM · Appointments
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Patient registration and appointment scheduling (Asia/Dhaka)
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsPatientRegistrationOpen(true)}
            className="group relative inline-flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-emerald-800 bg-gradient-to-r from-emerald-50 via-teal-50/60 to-emerald-50 hover:from-emerald-100/90 hover:to-teal-100/90 border border-emerald-300/80 hover:border-emerald-400 rounded-xl transition-all duration-200 shadow-xs hover:shadow-sm hover:-translate-y-0.5 active:translate-y-0 active:scale-95 cursor-pointer"
            title="Register a new patient"
          >
            <div className="w-5 h-5 rounded-lg bg-emerald-200/60 group-hover:bg-emerald-200 text-emerald-800 flex items-center justify-center transition-colors">
              <UserPlus className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />
            </div>
            <span>Patient Registration</span>
          </button>

          <button
            type="button"
            onClick={() => setIsQuickBookOpen(true)}
            className="group relative inline-flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-[#0DA54F] via-emerald-600 to-[#0a8740] hover:from-[#0c9547] hover:to-[#087337] rounded-xl transition-all duration-200 shadow-md shadow-emerald-600/25 hover:shadow-lg hover:shadow-emerald-600/35 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 cursor-pointer"
            title="Book an appointment for patient"
          >
            <div className="w-5 h-5 rounded-lg bg-white/20 text-white flex items-center justify-center transition-transform duration-200 group-hover:rotate-12">
              <CalendarIcon className="w-3.5 h-3.5" />
            </div>
            <span>Book Appointment</span>
          </button>
        </div>
      </div>

      {/* KPI Cards (Premium Modern Dashboard Style with Icons & Micro-interactions) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Filtered */}
        <div className="relative overflow-hidden bg-white/95 rounded-2xl border border-slate-200/90 p-4 shadow-xs hover:shadow-md hover:-translate-y-1 transition-all duration-300 group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-slate-100/60 to-slate-200/10 rounded-full blur-xl -mr-6 -mt-6 pointer-events-none group-hover:scale-125 transition-transform duration-500" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 tracking-wider uppercase">Total Filtered</span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center group-hover:bg-slate-200/80 group-hover:scale-110 transition-all duration-300 shadow-2xs">
              <Users className="w-4 h-4 text-slate-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-800 mt-1.5 tabular-nums font-mono tracking-tight">{totalCount}</p>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
            <span>All registered sessions</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-300 group-hover:h-1 transition-all duration-300" />
        </div>

        {/* Pending Bookings */}
        <div className="relative overflow-hidden bg-gradient-to-br from-white via-amber-50/25 to-white rounded-2xl border border-amber-200/80 p-4 shadow-xs hover:shadow-md hover:border-amber-300 hover:-translate-y-1 transition-all duration-300 group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-amber-200/25 to-amber-100/10 rounded-full blur-xl -mr-6 -mt-6 pointer-events-none group-hover:scale-125 transition-transform duration-500" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-amber-700 tracking-wider uppercase">Pending Bookings</span>
            <div className="w-8 h-8 rounded-xl bg-amber-100/90 text-amber-700 flex items-center justify-center group-hover:bg-amber-200 group-hover:scale-110 transition-all duration-300 shadow-2xs">
              <Clock className="w-4 h-4 text-amber-700" />
            </div>
          </div>
          <p className="text-2xl font-bold text-amber-800 mt-1.5 tabular-nums font-mono tracking-tight">{bookedCount}</p>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-amber-600/90 font-medium">
            <span>Awaiting call confirmation</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400 group-hover:h-1 transition-all duration-300" />
        </div>

        {/* Confirmed */}
        <div className="relative overflow-hidden bg-gradient-to-br from-white via-sky-50/25 to-white rounded-2xl border border-sky-200/80 p-4 shadow-xs hover:shadow-md hover:border-sky-300 hover:-translate-y-1 transition-all duration-300 group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-sky-200/25 to-sky-100/10 rounded-full blur-xl -mr-6 -mt-6 pointer-events-none group-hover:scale-125 transition-transform duration-500" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-sky-700 tracking-wider uppercase">Confirmed</span>
            <div className="w-8 h-8 rounded-xl bg-sky-100/90 text-sky-700 flex items-center justify-center group-hover:bg-sky-200 group-hover:scale-110 transition-all duration-300 shadow-2xs">
              <CalendarCheck className="w-4 h-4 text-sky-700" />
            </div>
          </div>
          <p className="text-2xl font-bold text-sky-800 mt-1.5 tabular-nums font-mono tracking-tight">{confirmedCount}</p>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-sky-600/90 font-medium">
            <span>Ready for consultation</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-400 group-hover:h-1 transition-all duration-300" />
        </div>

        {/* Visited / Completed */}
        <div className="relative overflow-hidden bg-gradient-to-br from-white via-emerald-50/30 to-white rounded-2xl border border-emerald-200/80 p-4 shadow-xs hover:shadow-md hover:border-emerald-300 hover:-translate-y-1 transition-all duration-300 group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-emerald-200/25 to-emerald-100/10 rounded-full blur-xl -mr-6 -mt-6 pointer-events-none group-hover:scale-125 transition-transform duration-500" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-emerald-700 tracking-wider uppercase">Visited / Completed</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-100/90 text-emerald-700 flex items-center justify-center group-hover:bg-emerald-200 group-hover:scale-110 transition-all duration-300 shadow-2xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-800 mt-1.5 tabular-nums font-mono tracking-tight">{visitedCount}</p>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-600/90 font-medium">
            <span>Consultation complete</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 group-hover:h-1 transition-all duration-300" />
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Date Segmented Control */}
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs">
            <button
              onClick={() => setDateFilter('today')}
              className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                dateFilter === 'today'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Today (17 Oct)
            </button>
            <button
              onClick={() => setDateFilter('tomorrow')}
              className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                dateFilter === 'tomorrow'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tomorrow (18 Oct)
            </button>
            <button
              onClick={() => setDateFilter('all')}
              className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                dateFilter === 'all'
                  ? 'bg-[#0DA54F] text-white font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Dates
            </button>
          </div>

          {/* Status Filter Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-700 font-medium focus:outline-none focus:border-[#0DA54F]"
          >
            <option value="all">All Statuses</option>
            <option value="booked">Booked (Pending)</option>
            <option value="confirmed">Confirmed</option>
            <option value="visited">Visited / Consulted</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {/* Branch Filter Dropdown */}
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="text-xs rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-700 font-medium focus:outline-none focus:border-[#0DA54F]"
          >
            <option value="all">All Branches</option>
            {branches.map((b, bIdx) => (
              <option key={`branch-opt-${b.id || bIdx}`} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Search Input, Live Indicator & Refresh Button */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search patient, phone, disease, doctor..."
              className="pl-8 pr-3 py-1 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#0DA54F] w-48 sm:w-64"
            />
          </div>

          <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs select-none">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Live Sync</span>
          </span>

          <button
            onClick={() => fetchAppointments(true)}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 cursor-pointer"
            title="Refresh appointments"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#0DA54F]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Table: Exact columns requested */}
      {/* SL. NO., Patient Name, Phone Number, Age & Gender, Address, Disease, Date & Time, Blood Group, Doctor, Booking Method, Branch, Note */}
      {isLoading ? (
        <TableSkeleton rows={5} cols={12} />
      ) : filteredAppointments.length === 0 ? (
        <EmptyState
          title="No appointments found"
          description="There are no appointments matching your active date or branch filter. Click Book Appointment to add one."
          actionLabel="Book Appointment"
          onAction={() => setIsQuickBookOpen(true)}
        />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs w-full">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200 sticky top-0 z-10 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3 text-center w-12">SL. NO.</th>
                  <th className="py-3 px-3.5">Patient Name</th>
                  <th className="py-3 px-3.5">Phone Number</th>
                  <th className="py-3 px-3.5">Age & Gender</th>
                  <th className="py-3 px-3.5">Address</th>
                  <th className="py-3 px-3.5">Disease</th>
                  <th className="py-3 px-3.5">Date & Time</th>
                  <th className="py-3 px-3 text-center">Blood Group</th>
                  <th className="py-3 px-3.5">Doctor</th>
                  <th className="py-3 px-3.5">Booking Method</th>
                  <th className="py-3 px-3.5">Branch</th>
                  <th className="py-3 px-3.5">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAppointments.map((apt, index) => {
                  const badgeStyle = getStatusBadgeClass(apt.status);
                  const pt = patientsMap[apt.patientId];

                  // Resolve patient attributes
                  const patientName = apt.patientName || pt?.name || (apt as any).patient_name || 'Patient';
                  const patientPhone = apt.patientPhone || pt?.phone || (apt as any).patient_mobile || '—';
                  const age = apt.patientAge || pt?.age || 28;
                  const gender = apt.patientGender || pt?.gender || 'female';
                  const address = apt.patientAddress || pt?.address || pt?.city || 'Dhanmondi, Dhaka';
                  const bloodGroup = apt.patientBloodGroup || pt?.bloodGroup || 'B+';

                  // Resolve appointment attributes
                  let disease = apt.diseaseName || '';
                  if (!disease && apt.serviceName && apt.serviceName.includes(':')) {
                    disease = apt.serviceName.split(':')[1]?.trim();
                  }
                  if (!disease) disease = apt.serviceName || 'Acne Vulgaris';

                  const doctorName = apt.doctorName || (apt as any).provider_name || 'Dr. Nusrat Jahan';
                  const bookingMethod = apt.bookingMethod || (apt as any).call_reference || 'Phone GP';
                  const branchDisplay = apt.branchName || (apt.branchId === 'br-uttara' ? 'Uttara Branch' : 'Dhanmondi Main Center');
                  const aptTime = apt.appointmentTime || (apt as any).start_time || '';
                  const aptDate = apt.appointmentDate || (apt as any).appointment_date || '';
                  const note = apt.notes || '—';

                  return (
                    <tr
                      key={`apt-row-${apt.id || ''}-${index}`}
                      className="h-12 hover:bg-slate-50/80 transition-colors"
                    >
                      {/* 1. SL. NO. */}
                      <td className="py-2.5 px-3 text-center font-mono text-slate-500 font-semibold text-[11px]">
                        {(index + 1).toString().padStart(2, '0')}
                      </td>

                      {/* 2. Patient Name */}
                      <td className="py-2.5 px-3.5">
                        <button
                          onClick={() => {
                            setSelectedPatientId(apt.patientId || (apt as any).patient_id);
                            setCurrentView('patients');
                          }}
                          className="font-bold text-slate-900 hover:text-[#0DA54F] transition-colors text-left cursor-pointer"
                          title="View patient profile"
                        >
                          {patientName}
                        </button>
                      </td>

                      {/* 3. Phone Number */}
                      <td className="py-2.5 px-3.5 font-mono font-medium text-slate-700">
                        {patientPhone}
                      </td>

                      {/* 4. Age & Gender */}
                      <td className="py-2.5 px-3.5 text-slate-700 capitalize">
                        {age} yrs, {gender}
                      </td>

                      {/* 5. Address */}
                      <td className="py-2.5 px-3.5 text-slate-600 max-w-[180px] truncate" title={address}>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{address}</span>
                        </span>
                      </td>

                      {/* 6. Disease */}
                      <td className="py-2.5 px-3.5">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200/80">
                          {disease}
                        </span>
                      </td>

                      {/* 7. Date & Time */}
                      <td className="py-2.5 px-3.5">
                        <div className="font-semibold text-slate-900 tabular-nums">
                          {formatDateDhaka(aptDate)}, {formatTime12h(aptTime)}
                        </div>
                      </td>

                      {/* 8. Blood Group */}
                      <td className="py-2.5 px-3 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          {bloodGroup}
                        </span>
                      </td>

                      {/* 9. Doctor */}
                      <td className="py-2.5 px-3.5 font-medium text-slate-800">
                        <span className="inline-flex items-center gap-1">
                          <Stethoscope className="w-3.5 h-3.5 text-[#0DA54F] shrink-0" />
                          <span>{doctorName}</span>
                        </span>
                      </td>

                      {/* 10. Booking Method */}
                      <td className="py-2.5 px-3.5">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${getBookingMethodBadge(
                            bookingMethod
                          )}`}
                        >
                          {bookingMethod}
                        </span>
                      </td>

                      {/* 11. Branch */}
                      <td className="py-2.5 px-3.5 text-slate-600">
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{branchDisplay}</span>
                        </span>
                      </td>

                      {/* 12. Note */}
                      <td className="py-2.5 px-3.5 text-slate-500 max-w-[200px] truncate" title={note}>
                        {note}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cancellation Reason Modal (Rule 6/7) */}
      <ConfirmReasonModal
        isOpen={!!cancellingAptId}
        title="Cancel Appointment"
        description="Cancelling an appointment updates the patient schedule and logs an audit event. Please provide a reason."
        confirmLabel="Cancel Appointment"
        onClose={() => setCancellingAptId(null)}
        onConfirm={(reason) => {
          if (cancellingAptId) {
            handleStatusChange(cancellingAptId, 'cancelled', reason);
            setCancellingAptId(null);
          }
        }}
      />
    </div>
  );
};
