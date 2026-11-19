import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Clock,
  User,
  Search,
  Filter,
  RefreshCw,
  Plus,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RotateCcw,
  UserCheck,
  UserPlus,
  Stethoscope,
  Phone,
  Eye,
  AlertTriangle,
  Building,
} from 'lucide-react';
import { appointmentsApi } from '../../api/appointments.js';
import { NewAppointmentDrawer } from './NewAppointmentDrawer.js';
import { RegisterPatientDrawer } from '../patients/RegisterPatientDrawer.js';
import { AppointmentDetailDrawer } from './AppointmentDetailDrawer.js';
import { CancelAppointmentModal } from './CancelAppointmentModal.js';
import { RescheduleAppointmentModal } from './RescheduleAppointmentModal.js';
import type { AppointmentDto, AppointmentStatus, PatientDto } from '@suoxi/shared-types';

export const AppointmentListView: React.FC = () => {
  const [appointments, setAppointments] = useState<AppointmentDto[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Tabs
  const [activeTab, setActiveTab] = useState<'today' | 'tomorrow' | 'upcoming' | 'past' | 'all'>('upcoming');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedSource, setSelectedSource] = useState('all');
  const [selectedDate, setSelectedDate] = useState('');

  // Modals & Drawers
  const [isNewDrawerOpen, setIsNewDrawerOpen] = useState(false);
  const [isRegisterPatientOpen, setIsRegisterPatientOpen] = useState(false);
  const [preselectedPatientForAppt, setPreselectedPatientForAppt] = useState<PatientDto | null>(null);
  const [detailAppointmentId, setDetailAppointmentId] = useState<string | null>(null);
  const [cancelAppointment, setCancelAppointment] = useState<AppointmentDto | null>(null);
  const [rescheduleAppointment, setRescheduleAppointment] = useState<AppointmentDto | null>(null);

  const fetchAppointments = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await appointmentsApi.list({
        tab: activeTab === 'all' ? undefined : activeTab,
        search: searchQuery.trim() || undefined,
        providerId: selectedDoctor !== 'all' ? selectedDoctor : undefined,
        status: selectedStatus !== 'all' ? selectedStatus : undefined,
        sourceId: selectedSource !== 'all' ? selectedSource : undefined,
        startDate: selectedDate || undefined,
        limit: 50,
      });
      const list = Array.isArray(res) ? res : ((res as any)?.data || []);
      setAppointments(list);
      setTotalCount(list.length);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch appointments');
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, searchQuery, selectedDoctor, selectedStatus, selectedSource, selectedDate]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const handleQuickStatus = async (id: string, status: AppointmentStatus, reason?: string) => {
    try {
      await appointmentsApi.changeStatus(id, status, reason);
      fetchAppointments();
    } catch (err: any) {
      alert(err.message || 'Status transition failed');
    }
  };

  const getStatusBadge = (status: AppointmentStatus) => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Confirmed
          </span>
        );
      case 'visited':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
            <UserCheck className="w-3.5 h-3.5 text-green-600" />
            Visited
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            <XCircle className="w-3.5 h-3.5 text-slate-500" />
            Cancelled
          </span>
        );
      case 'no_show':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
            <AlertCircle className="w-3.5 h-3.5 text-red-600" />
            No-Show
          </span>
        );
      case 'rescheduled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
            Rescheduled
          </span>
        );
      case 'booked':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            Booked
          </span>
        );
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                CRM · Appointments
                <span className="text-base font-normal text-slate-400">/ অ্যাপয়েন্টমেন্ট ও নতুন রোগী</span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                নতুন রোগী নিবন্ধন ও ৬০ সেকেন্ডের মধ্যে দ্রুত অ্যাপয়েন্টমেন্ট বুকিং (Manual Entry, Doctor Selection, Status Lifecycle)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsRegisterPatientOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 active:bg-emerald-200 transition-colors shadow-xs"
            title="নতুন রোগী যোগ ও প্রোফাইল তৈরি করুন"
          >
            <UserPlus className="w-4 h-4 text-emerald-700" />
            <span>+ New Patient</span>
            <span className="hidden sm:inline text-emerald-600 font-normal">(নতুন রোগী)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPreselectedPatientForAppt(null);
              setIsNewDrawerOpen(true);
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>New Appointment</span>
            <span className="hidden sm:inline font-normal opacity-90">(বুকিং)</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1">
        {[
          { key: 'today', label: 'Today', bn: 'আজ' },
          { key: 'tomorrow', label: 'Tomorrow', bn: 'আগামীকাল' },
          { key: 'upcoming', label: 'Upcoming', bn: 'আসন্ন' },
          { key: 'past', label: 'Past History', bn: 'অতীত' },
          { key: 'all', label: 'All', bn: 'সকল' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === tab.key
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            {tab.label} <span className="text-[11px] opacity-75 font-normal">({tab.bn})</span>
          </button>
        ))}
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {/* Search */}
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search code (APT-000412), patient, doctor, or service..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          {/* Doctor Filter */}
          <div>
            <select
              value={selectedDoctor}
              onChange={(e) => setSelectedDoctor(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
            >
              <option value="all">All Doctors</option>
              <option value="usr-101">Dr. Nusrat Jahan</option>
              <option value="usr-102">Dr. Farhana Khan</option>
              <option value="usr-103">Sabrina Mostafa</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="booked">Booked</option>
              <option value="confirmed">Confirmed</option>
              <option value="visited">Visited</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No-Show</option>
              <option value="rescheduled">Rescheduled</option>
            </select>
          </div>

          {/* Refresh & Reset */}
          <div className="flex items-center gap-2">
            <button
              onClick={fetchAppointments}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        {isLoading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-800">{error}</p>
            <button
              onClick={fetchAppointments}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700"
            >
              Try Again
            </button>
          </div>
        ) : appointments.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Calendar className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">No appointments found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No bookings match the selected tab and filters. Click "New Appointment" to schedule in under 60 seconds.
            </p>
            <button
              onClick={() => setIsNewDrawerOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="w-4 h-4" />
              Book Appointment
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs divide-y divide-slate-200">
              <thead className="bg-slate-50/80 text-slate-600 font-semibold tracking-wider uppercase text-[11px]">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Doctor</th>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Date & Time</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {appointments.map((apt) => (
                  <tr
                    key={apt.id}
                    className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                    onClick={() => setDetailAppointmentId(apt.id)}
                  >
                    {/* Code */}
                    <td className="px-4 py-3.5 font-mono font-bold text-slate-800">
                      {apt.appointment_code}
                    </td>

                    {/* Patient */}
                    <td className="px-4 py-3.5">
                      <div>
                        <span className="font-semibold text-slate-900 group-hover:text-emerald-700">
                          {apt.patient_name}
                        </span>
                        {apt.patient_name_bn && (
                          <span className="text-[11px] text-slate-400 ml-1.5 font-normal">
                            ({apt.patient_name_bn})
                          </span>
                        )}
                        <p className="text-[11px] text-slate-500 font-mono">
                          {apt.patient_code} · {apt.patient_mobile}
                        </p>
                      </div>
                    </td>

                    {/* Doctor */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <div>
                          <p className="font-medium text-slate-800">{apt.provider_name}</p>
                          <p className="text-[11px] text-slate-400">{apt.provider_role}</p>
                        </div>
                        {apt.set_by_clinician && (
                          <span
                            className="p-1 rounded-full bg-emerald-100 text-emerald-800 shrink-0"
                            title="Set by doctor (Clinical Protection)"
                          >
                            <Stethoscope className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Service */}
                    <td className="px-4 py-3.5">
                      <div>
                        <p className="font-semibold text-slate-800">{apt.service_name}</p>
                        <p className="text-[11px] text-slate-400">{apt.service_category || 'Treatment'}</p>
                      </div>
                    </td>

                    {/* Date & Time */}
                    <td className="px-4 py-3.5">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {apt.appointment_date}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono">
                          {apt.start_time} - {apt.end_time} ({apt.duration_minutes}m)
                        </p>
                        {apt.resource_name && (
                          <span className="text-[10px] text-slate-400 block font-medium">
                            {apt.resource_name}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Source */}
                    <td className="px-4 py-3.5">
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
                        {apt.source_name}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5">
                      {getStatusBadge(apt.status)}
                    </td>

                    {/* Actions */}
                    <td
                      className="px-4 py-3.5 text-right space-x-1 whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {apt.status === 'booked' && (
                        <button
                          type="button"
                          onClick={() => handleQuickStatus(apt.id, 'confirmed', 'Confirmed by reception')}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                        >
                          Confirm
                        </button>
                      )}
                      {(apt.status === 'booked' || apt.status === 'confirmed') && (
                        <button
                          type="button"
                          onClick={() => handleQuickStatus(apt.id, 'visited', 'Patient arrived and checked in')}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white bg-green-700 hover:bg-green-800 transition-colors shadow-xs"
                        >
                          Check-in
                        </button>
                      )}
                      {(apt.status === 'booked' || apt.status === 'confirmed') && (
                        <button
                          type="button"
                          onClick={() => setRescheduleAppointment(apt)}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
                        >
                          Reschedule
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDetailAppointmentId(apt.id)}
                        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                        title="View Full Details & History"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drawers & Modals */}
      <RegisterPatientDrawer
        isOpen={isRegisterPatientOpen}
        onClose={() => setIsRegisterPatientOpen(false)}
        onSuccess={(newPatient) => {
          setIsRegisterPatientOpen(false);
          setPreselectedPatientForAppt(newPatient as PatientDto);
          setIsNewDrawerOpen(true);
        }}
        onOpenExisting={(patientId) => {
          setIsRegisterPatientOpen(false);
        }}
      />

      <NewAppointmentDrawer
        isOpen={isNewDrawerOpen}
        onClose={() => {
          setIsNewDrawerOpen(false);
          setPreselectedPatientForAppt(null);
        }}
        onSuccess={() => {
          fetchAppointments();
        }}
        preselectedPatient={preselectedPatientForAppt}
      />

      <AppointmentDetailDrawer
        isOpen={!!detailAppointmentId}
        appointmentId={detailAppointmentId}
        onClose={() => setDetailAppointmentId(null)}
        onStatusChange={() => {
          fetchAppointments();
        }}
        onOpenReschedule={(apt) => {
          setDetailAppointmentId(null);
          setRescheduleAppointment(apt);
        }}
        onOpenCancel={(apt) => {
          setDetailAppointmentId(null);
          setCancelAppointment(apt);
        }}
      />

      <CancelAppointmentModal
        isOpen={!!cancelAppointment}
        appointment={cancelAppointment}
        onClose={() => setCancelAppointment(null)}
        onSuccess={() => {
          fetchAppointments();
        }}
      />

      <RescheduleAppointmentModal
        isOpen={!!rescheduleAppointment}
        appointment={rescheduleAppointment}
        onClose={() => setRescheduleAppointment(null)}
        onSuccess={() => {
          fetchAppointments();
        }}
      />
    </div>
  );
};
