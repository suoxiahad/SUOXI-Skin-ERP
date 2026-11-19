import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Building2,
  AlertCircle,
  CheckCircle,
  XCircle,
  RotateCcw,
  AlertTriangle,
  Stethoscope,
  DoorClosed,
  Plus,
  RefreshCw,
  Layers,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { calendarApi } from '../../api/calendar.js';
import { appointmentsApi } from '../../api/appointments.js';
import { NewAppointmentDrawer } from '../appointments/NewAppointmentDrawer.js';
import { AppointmentDetailDrawer } from '../appointments/AppointmentDetailDrawer.js';
import { RescheduleAppointmentModal } from '../appointments/RescheduleAppointmentModal.js';
import { CancelAppointmentModal } from '../appointments/CancelAppointmentModal.js';
import { useI18n } from '../../i18n/I18nContext.js';
import { useAuth } from '../../context/AuthContext.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import {
  CalendarAppointmentItemDto,
  CalendarScheduleItemDto,
  CalendarTimeOffItemDto,
  AppointmentStatus,
  AppointmentDetailDto,
  AppointmentDto,
  ResourceDto,
} from '@suoxi/shared-types';

type CalendarViewMode = 'day' | 'week' | 'month';

interface DoctorConfig {
  id: string;
  name: string;
  nameBn: string;
  title: string;
  titleBn: string;
}

const DOCTORS: DoctorConfig[] = [
  { id: 'usr-101', name: 'Dr. Nusrat Jahan', nameBn: 'ডাঃ নুসরত জাহান', title: 'Consultant Dermatologist', titleBn: 'কনসালট্যান্ট ডার্মাটোলজিস্ট' },
  { id: 'usr-102', name: 'Dr. Farhana Khan', nameBn: 'ডাঃ ফারহানা খান', title: 'Laser Specialist', titleBn: 'লেজার স্পেশালিস্ট' },
  { id: 'usr-103', name: 'Sabrina Mostafa', nameBn: 'সাবরিনা মোস্তফা', title: 'Aesthetic Therapist', titleBn: 'এস্থেটিক থেরাপিস্ট' },
];

// Clinic operating slots: 09:00 to 19:30 in 30-minute intervals (Asia/Dhaka)
const TIME_SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30', '19:00', '19:30',
];

function formatDateDhaka(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateDhaka(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function getDayOfWeek(dateStr: string): number {
  return parseDateDhaka(dateStr).getUTCDay();
}

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + (m || 0);
}

function formatTime12h(time24: string): string {
  if (!time24) return '';
  const [hStr, mStr] = time24.split(':');
  const h = parseInt(hStr, 10);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${mStr || '00'} ${suffix}`;
}

export const CalendarView: React.FC = () => {
  const { lang, t } = useI18n();
  const isBn = lang === 'bn';
  const { user } = useAuth();
  const { has } = usePermissions();

  // Calendar navigation state
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>('day');
  const [selectedDoctor, setSelectedDoctor] = useState<string>('all');
  const [selectedResource, setSelectedResource] = useState<string>('all');

  // Server state
  const [appointments, setAppointments] = useState<CalendarAppointmentItemDto[]>([]);
  const [schedules, setSchedules] = useState<CalendarScheduleItemDto[]>([]);
  const [timeOffs, setTimeOffs] = useState<CalendarTimeOffItemDto[]>([]);
  const [resources, setResources] = useState<ResourceDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Settings
  const [dragRescheduleEnabled, setDragRescheduleEnabled] = useState(true);

  // Drag & drop reschedule state
  const [draggingAppointment, setDraggingAppointment] = useState<CalendarAppointmentItemDto | null>(null);
  const [dragTargetSlot, setDragTargetSlot] = useState<{ date: string; time: string; doctorId: string } | null>(null);
  const [isConfirmingDragReschedule, setIsConfirmingDragReschedule] = useState(false);
  const [dragReason, setDragReason] = useState('');
  const [dragRescheduleError, setDragRescheduleError] = useState<string | null>(null);
  const [isSubmittingDrag, setIsSubmittingDrag] = useState(false);

  // Modal / Drawer state
  const [isNewAppointmentOpen, setIsNewAppointmentOpen] = useState(false);
  const [newAppointmentPrefill, setNewAppointmentPrefill] = useState<{
    doctorId?: string;
    date?: string;
    time?: string;
  }>({});

  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const [rescheduleModalApt, setRescheduleModalApt] = useState<AppointmentDetailDto | null>(null);
  const [cancelModalApt, setCancelModalApt] = useState<AppointmentDetailDto | null>(null);

  // Toast / Banner state
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToastMessage({ type, message });
    setTimeout(() => setToastMessage(null), 5000);
  };

  // Compute date range based on viewMode
  const { fromDateStr, toDateStr } = useMemo(() => {
    const base = new Date(currentDate);

    if (viewMode === 'day') {
      const dStr = formatDateDhaka(base);
      return { fromDateStr: dStr, toDateStr: dStr };
    }

    if (viewMode === 'week') {
      // Monday to Sunday
      const day = base.getDay();
      const diffToMonday = (day + 6) % 7;
      const monday = new Date(base);
      monday.setDate(base.getDate() - diffToMonday);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      return {
        fromDateStr: formatDateDhaka(monday),
        toDateStr: formatDateDhaka(sunday),
      };
    }

    // Month view: full 6 weeks (up to 42 days window)
    const firstDay = new Date(base.getFullYear(), base.getMonth(), 1);
    const dayOfWeek = (firstDay.getDay() + 6) % 7; // Monday = 0
    const startCalendar = new Date(firstDay);
    startCalendar.setDate(firstDay.getDate() - dayOfWeek);

    const endCalendar = new Date(startCalendar);
    endCalendar.setDate(startCalendar.getDate() + 35); // 5 weeks standard

    return {
      fromDateStr: formatDateDhaka(startCalendar),
      toDateStr: formatDateDhaka(endCalendar),
    };
  }, [currentDate, viewMode]);

  // Load resources once
  useEffect(() => {
    appointmentsApi
      .getResources('br-dhanmondi')
      .then((res) => {
        setResources(res || []);
      })
      .catch(() => {});
  }, []);

  // Fetch calendar data
  const fetchCalendarData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await calendarApi.get({
        from: fromDateStr,
        to: toDateStr,
        providerId: selectedDoctor !== 'all' ? selectedDoctor : undefined,
        resourceId: selectedResource !== 'all' ? selectedResource : undefined,
        branchId: 'br-dhanmondi',
      });

      setAppointments(res.appointments || []);
      setSchedules(res.schedules || []);
      setTimeOffs(res.timeOffs || []);
      if (res.settings) {
        setDragRescheduleEnabled(res.settings.drag_reschedule_enabled);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load calendar schedule');
    } finally {
      setIsLoading(false);
    }
  }, [fromDateStr, toDateStr, selectedDoctor, selectedResource]);

  useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData]);

  // Navigation handlers
  const handlePrev = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewMode === 'day') next.setDate(next.getDate() - 1);
      else if (viewMode === 'week') next.setDate(next.getDate() - 7);
      else if (viewMode === 'month') next.setMonth(next.getMonth() - 1);
      return next;
    });
  };

  const handleNext = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewMode === 'day') next.setDate(next.getDate() + 1);
      else if (viewMode === 'week') next.setDate(next.getDate() + 7);
      else if (viewMode === 'month') next.setMonth(next.getMonth() + 1);
      return next;
    });
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Slot click -> Open prefilled booking drawer
  const handleEmptySlotClick = (dateStr: string, timeStr: string, doctorId?: string) => {
    setNewAppointmentPrefill({
      doctorId: doctorId || (selectedDoctor !== 'all' ? selectedDoctor : 'usr-101'),
      date: dateStr,
      time: timeStr,
    });
    setIsNewAppointmentOpen(true);
  };

  // Card click -> Open detail drawer
  const handleCardClick = (apt: CalendarAppointmentItemDto) => {
    setSelectedAppointmentId(apt.id);
    setIsDetailOpen(true);
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, apt: CalendarAppointmentItemDto) => {
    if (!dragRescheduleEnabled) return;
    setDraggingAppointment(apt);
    e.dataTransfer.setData('text/plain', apt.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!dragRescheduleEnabled || !draggingAppointment) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetDate: string, targetTime: string, doctorId: string) => {
    e.preventDefault();
    if (!dragRescheduleEnabled || !draggingAppointment) return;

    // Check if dropping onto the identical time
    if (
      draggingAppointment.appointment_date === targetDate &&
      draggingAppointment.start_time === targetTime &&
      draggingAppointment.provider_id === doctorId
    ) {
      setDraggingAppointment(null);
      return;
    }

    setDragTargetSlot({ date: targetDate, time: targetTime, doctorId });
    setDragReason('');
    setDragRescheduleError(null);
    setIsConfirmingDragReschedule(true);
  };

  const handleConfirmDragReschedule = async () => {
    if (!draggingAppointment || !dragTargetSlot) return;
    if (!dragReason.trim()) {
      setDragRescheduleError(
        isBn ? 'পুনঃনির্ধারণের কারণ উল্লেখ করা আবশ্যক।' : 'A mandatory rescheduling reason is required.'
      );
      return;
    }

    try {
      setIsSubmittingDrag(true);
      setDragRescheduleError(null);

      // Call the standard atomic reschedule endpoint
      await appointmentsApi.reschedule(draggingAppointment.id, {
        appointment_date: dragTargetSlot.date,
        start_time: dragTargetSlot.time,
        provider_id: dragTargetSlot.doctorId,
        duration_minutes: draggingAppointment.duration_minutes,
        resource_id: draggingAppointment.resource_id,
        reason: dragReason.trim(),
      });

      showToast(
        'success',
        isBn
          ? `অ্যাপয়েন্টমেন্ট সফলভাবে ${dragTargetSlot.time}-এ পুনঃনির্ধারণ করা হয়েছে!`
          : `Appointment rescheduled to ${dragTargetSlot.time} successfully!`
      );

      setIsConfirmingDragReschedule(false);
      setDraggingAppointment(null);
      setDragTargetSlot(null);
      fetchCalendarData();
    } catch (err: any) {
      // Show exact server conflict error
      setDragRescheduleError(err.message || 'Reschedule conflict encountered');
    } finally {
      setIsSubmittingDrag(false);
    }
  };

  // Helper to check if a provider is on duty at a given day & time
  const isProviderWorking = (providerId: string, dateStr: string, timeStr: string): boolean => {
    const dayOfWeek = getDayOfWeek(dateStr);
    const timeMins = timeToMinutes(timeStr);

    const matchingSchedule = schedules.find(
      (s) => s.provider_id === providerId && s.day_of_week === dayOfWeek
    );
    if (!matchingSchedule) return false;

    const startMins = timeToMinutes(matchingSchedule.start_time);
    const endMins = timeToMinutes(matchingSchedule.end_time);
    return timeMins >= startMins && timeMins < endMins;
  };

  // Helper to check if a provider is on time-off during a date & time
  const getProviderTimeOff = (providerId: string, dateStr: string, timeStr: string): CalendarTimeOffItemDto | undefined => {
    return timeOffs.find((to) => {
      if (to.provider_id !== providerId) return false;
      const startDate = to.start_datetime.substring(0, 10);
      const endDate = to.end_datetime.substring(0, 10);
      if (dateStr < startDate || dateStr > endDate) return false;

      const startTime = to.start_datetime.substring(11, 16) || '00:00';
      const endTime = to.end_datetime.substring(11, 16) || '23:59';
      return timeStr >= startTime && timeStr < endTime;
    });
  };

  // Status badge styling adhering strictly to K2 (Icon + Text Label, Never color alone)
  const getStatusBadge = (status: AppointmentStatus) => {
    switch (status) {
      case 'confirmed':
        return {
          border: 'border-l-emerald-600',
          badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          dot: 'bg-emerald-600',
          label: isBn ? 'নিশ্চিত' : 'Confirmed',
          icon: <CheckCircle className="w-3 h-3 text-emerald-600 shrink-0" />,
        };
      case 'visited':
        return {
          border: 'border-l-teal-600',
          badgeBg: 'bg-teal-50 text-teal-800 border-teal-200',
          dot: 'bg-teal-600',
          label: isBn ? 'উপস্থিত' : 'Visited',
          icon: <CheckCircle className="w-3 h-3 text-teal-600 shrink-0" />,
        };
      case 'no_show':
        return {
          border: 'border-l-rose-600',
          badgeBg: 'bg-rose-50 text-rose-800 border-rose-200',
          dot: 'bg-rose-600',
          label: isBn ? 'অনুপস্থিত' : 'No-show',
          icon: <XCircle className="w-3 h-3 text-rose-600 shrink-0" />,
        };
      case 'cancelled':
        return {
          border: 'border-l-slate-400',
          badgeBg: 'bg-slate-100 text-slate-700 border-slate-300',
          dot: 'bg-slate-400',
          label: isBn ? 'বাতিল' : 'Cancelled',
          icon: <XCircle className="w-3 h-3 text-slate-500 shrink-0" />,
        };
      case 'rescheduled':
        return {
          border: 'border-l-amber-500',
          badgeBg: 'bg-amber-50 text-amber-800 border-amber-200',
          dot: 'bg-amber-500',
          label: isBn ? 'পুনঃনির্ধারিত' : 'Rescheduled',
          icon: <RotateCcw className="w-3 h-3 text-amber-600 shrink-0" />,
        };
      case 'booked':
      default:
        return {
          border: 'border-l-blue-500',
          badgeBg: 'bg-blue-50 text-blue-800 border-blue-200',
          dot: 'bg-blue-500',
          label: isBn ? 'বুকড' : 'Booked',
          icon: <Clock className="w-3 h-3 text-blue-600 shrink-0" />,
        };
    }
  };

  // Header Title
  const headerDateLabel = useMemo(() => {
    if (viewMode === 'day') {
      return currentDate.toLocaleDateString(isBn ? 'bn-BD' : 'en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }
    if (viewMode === 'week') {
      const fromD = parseDateDhaka(fromDateStr);
      const toD = parseDateDhaka(toDateStr);
      return `${fromD.toLocaleDateString(isBn ? 'bn-BD' : 'en-US', { month: 'short', day: 'numeric' })} – ${toD.toLocaleDateString(isBn ? 'bn-BD' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    return currentDate.toLocaleDateString(isBn ? 'bn-BD' : 'en-US', {
      month: 'long',
      year: 'numeric',
    });
  }, [currentDate, viewMode, fromDateStr, toDateStr, isBn]);

  const activeDoctors = useMemo(() => {
    if (selectedDoctor !== 'all') {
      return DOCTORS.filter((d) => d.id === selectedDoctor);
    }
    return DOCTORS;
  }, [selectedDoctor]);

  // Week days array
  const weekDays = useMemo(() => {
    if (viewMode !== 'week') return [];
    const days: { dateStr: string; label: string; dayNum: number }[] = [];
    const base = parseDateDhaka(fromDateStr);
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const dateStr = formatDateDhaka(d);
      days.push({
        dateStr,
        label: d.toLocaleDateString(isBn ? 'bn-BD' : 'en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }),
        dayNum: d.getDate(),
      });
    }
    return days;
  }, [viewMode, fromDateStr, isBn]);

  // Month grid matrix
  const monthCells = useMemo(() => {
    if (viewMode !== 'month') return [];
    const cells: { dateStr: string; dayNum: number; isCurrentMonth: boolean; appointments: CalendarAppointmentItemDto[] }[] = [];
    const start = parseDateDhaka(fromDateStr);
    const end = parseDateDhaka(toDateStr);
    const currentMonth = currentDate.getMonth();

    const curr = new Date(start);
    while (curr <= end) {
      const dStr = formatDateDhaka(curr);
      const cellApts = appointments.filter((a) => a.appointment_date === dStr);
      cells.push({
        dateStr: dStr,
        dayNum: curr.getDate(),
        isCurrentMonth: curr.getMonth() === currentMonth,
        appointments: cellApts,
      });
      curr.setDate(curr.getDate() + 1);
    }
    return cells;
  }, [viewMode, fromDateStr, toDateStr, currentDate, appointments]);

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`px-4 py-3 rounded-xl border flex items-center justify-between text-sm shadow-md animate-fade-in ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMessage.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{toastMessage.message}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-xs font-semibold hover:opacity-75 ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Left: Title & Date Switcher */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-[#0DA54F] flex items-center justify-center shadow-xs">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {isBn ? 'ক্যালেন্ডার' : 'Calendar'}
              </h1>
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <span>{headerDateLabel}</span>
                <span className="text-slate-300">•</span>
                <span className="text-emerald-700 font-medium">Asia/Dhaka</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 ml-0 sm:ml-4">
            <button
              onClick={handlePrev}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-colors"
              title="Previous"
              aria-label="Previous period"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleToday}
              className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-white rounded-lg transition-colors"
            >
              {isBn ? 'আজ' : 'Today'}
            </button>
            <button
              onClick={handleNext}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-colors"
              title="Next"
              aria-label="Next period"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right: View Switcher & Filters */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* View Switcher: Day, Week, Month */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            {(['day', 'week', 'month'] as CalendarViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition-all ${
                  viewMode === mode
                    ? 'bg-white text-[#0DA54F] shadow-xs border border-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {mode === 'day' ? (isBn ? 'দিন' : 'Day') : mode === 'week' ? (isBn ? 'সপ্তাহ' : 'Week') : (isBn ? 'মাস' : 'Month')}
              </button>
            ))}
          </div>

          {/* Doctor Filter */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700">
            <Stethoscope className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={selectedDoctor}
              onChange={(e) => setSelectedDoctor(e.target.value)}
              className="bg-transparent focus:outline-hidden text-xs font-medium text-slate-800 pr-1 cursor-pointer"
              aria-label="Filter by doctor"
            >
              <option value="all">{isBn ? 'সকল ডাক্তার' : 'All Doctors'}</option>
              {DOCTORS.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {isBn ? doc.nameBn : doc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Room / Device Filter */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700">
            <DoorClosed className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={selectedResource}
              onChange={(e) => setSelectedResource(e.target.value)}
              className="bg-transparent focus:outline-hidden text-xs font-medium text-slate-800 pr-1 cursor-pointer"
              aria-label="Filter by room or device"
            >
              <option value="all">{isBn ? 'সকল রুম ও ডিভাইস' : 'All Rooms & Devices'}</option>
              {resources.map((res) => (
                <option key={res.id} value={res.id}>
                  {res.name} ({res.resource_type === 'device' ? 'Device' : 'Room'})
                </option>
              ))}
            </select>
          </div>

          {/* Quick Book Appointment */}
          <button
            onClick={() => {
              setNewAppointmentPrefill({
                doctorId: selectedDoctor !== 'all' ? selectedDoctor : 'usr-101',
                date: formatDateDhaka(currentDate),
                time: '11:00',
              });
              setIsNewAppointmentOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0DA54F] hover:bg-[#09833e] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isBn ? 'নতুন বুকিং' : 'New Appointment'}</span>
          </button>
        </div>
      </div>

      {/* Main Calendar Grid (Solid surfaces K2 rule) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Error State */}
        {error && (
          <div className="p-6 text-center">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-800 mb-1">{error}</p>
            <button
              onClick={fetchCalendarData}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0DA54F] bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors mt-2"
            >
              <RefreshCw className="w-3 h-3" />
              <span>{isBn ? 'পুনরায় চেষ্টা করুন' : 'Retry'}</span>
            </button>
          </div>
        )}

        {/* Loading Indicator */}
        {isLoading && !error && (
          <div className="p-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-[#0DA54F]" />
            <span>{isBn ? 'ক্যালেন্ডার শিডিউল লোড হচ্ছে...' : 'Loading calendar schedule...'}</span>
          </div>
        )}

        {/* =========================================================================
            VIEW 1: DAY VIEW (One column per doctor, 30m slots, shaded hours, hatched time-off)
           ========================================================================= */}
        {!isLoading && !error && viewMode === 'day' && (
          <div className="overflow-x-auto">
            <div className="min-w-[700px]">
              {/* Doctor Columns Header */}
              <div className="grid grid-cols-[80px_repeat(auto-fit,minmax(200px,1fr))] border-b border-slate-200 bg-slate-50/80 sticky top-0 z-10">
                <div className="p-3 text-xs font-bold text-slate-500 border-r border-slate-200 text-center">
                  {isBn ? 'সময়' : 'Time'}
                </div>
                {activeDoctors.map((doc) => (
                  <div key={doc.id} className="p-3 border-r border-slate-200 last:border-r-0">
                    <div className="font-bold text-xs text-slate-900 truncate">
                      {isBn ? doc.nameBn : doc.name}
                    </div>
                    <div className="text-[11px] text-[#0DA54F] truncate font-medium">
                      {isBn ? doc.titleBn : doc.title}
                    </div>
                  </div>
                ))}
              </div>

              {/* Time Slots Matrix */}
              <div className="divide-y divide-slate-100">
                {TIME_SLOTS.map((timeSlot) => {
                  const dateStr = formatDateDhaka(currentDate);

                  return (
                    <div
                      key={timeSlot}
                      className="grid grid-cols-[80px_repeat(auto-fit,minmax(200px,1fr))] min-h-[56px]"
                    >
                      {/* Time Column Label */}
                      <div className="p-2 text-xs font-semibold text-slate-500 border-r border-slate-200 text-center bg-slate-50/50 tabular-nums flex items-center justify-center">
                        {formatTime12h(timeSlot)}
                      </div>

                      {/* Doctor Columns */}
                      {activeDoctors.map((doc) => {
                        const isWorking = isProviderWorking(doc.id, dateStr, timeSlot);
                        const timeOff = getProviderTimeOff(doc.id, dateStr, timeSlot);

                        // Find appointments occupying this slot
                        const slotApts = appointments.filter(
                          (a) =>
                            a.provider_id === doc.id &&
                            a.appointment_date === dateStr &&
                            a.start_time <= timeSlot &&
                            a.end_time > timeSlot
                        );

                        // Time-off: Hatched background block
                        if (timeOff) {
                          return (
                            <div
                              key={doc.id}
                              className="border-r border-slate-200 last:border-r-0 p-1.5 relative bg-[repeating-linear-gradient(45deg,#fef2f2,#fef2f2_10px,#fee2e2_10px,#fee2e2_20px)] border-t border-b border-rose-200 flex items-center justify-center"
                              title={`Time-off: ${timeOff.reason || 'Doctor Leave / Break'}`}
                            >
                              <div className="bg-white/90 px-2 py-0.5 rounded-md text-[10px] font-bold text-rose-700 shadow-2xs border border-rose-300 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 text-rose-600" />
                                <span>{timeOff.reason || (isBn ? 'ছুটি / অনুপস্থিত' : 'Time Off')}</span>
                              </div>
                            </div>
                          );
                        }

                        // Outside working hours shading
                        const cellBg = isWorking ? 'bg-white' : 'bg-slate-100/60';

                        return (
                          <div
                            key={doc.id}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, dateStr, timeSlot, doc.id)}
                            className={`border-r border-slate-200 last:border-r-0 p-1.5 relative transition-colors group ${cellBg}`}
                          >
                            {/* Render Appointments */}
                            {slotApts.length > 0 ? (
                              <div className="space-y-1">
                                {slotApts.map((apt) => {
                                  const badge = getStatusBadge(apt.status);
                                  return (
                                    <div
                                      key={apt.id}
                                      draggable={dragRescheduleEnabled}
                                      onDragStart={(e) => handleDragStart(e, apt)}
                                      onClick={() => handleCardClick(apt)}
                                      className={`p-2 rounded-xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-all cursor-pointer border-l-4 ${badge.border} text-left select-none`}
                                    >
                                      <div className="flex items-center justify-between gap-1 mb-1">
                                        <span className="font-semibold text-xs text-slate-900 truncate">
                                          {apt.patient_name}
                                        </span>
                                        <span
                                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${badge.badgeBg}`}
                                        >
                                          {badge.icon}
                                          <span className="capitalize">{badge.label}</span>
                                        </span>
                                      </div>

                                      <div className="text-[11px] font-medium text-slate-600 truncate">
                                        {apt.service_name}
                                      </div>

                                      <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-between">
                                        <span className="tabular-nums">
                                          {formatTime12h(apt.start_time)} – {formatTime12h(apt.end_time)}
                                        </span>
                                        {apt.resource_name && (
                                          <span className="text-[#0DA54F] font-medium truncate max-w-[90px]">
                                            {apt.resource_name}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              // Empty clickable slot
                              <button
                                onClick={() => handleEmptySlotClick(dateStr, timeSlot, doc.id)}
                                className="w-full h-full min-h-[40px] rounded-lg opacity-0 group-hover:opacity-100 hover:bg-emerald-50/80 border border-dashed border-emerald-300 flex items-center justify-center text-[11px] text-[#0DA54F] font-semibold transition-opacity focus:opacity-100 focus:outline-hidden"
                                aria-label={`Book slot at ${timeSlot} for ${doc.name}`}
                              >
                                <Plus className="w-3.5 h-3.5 mr-1" />
                                <span>{isBn ? 'বুক করুন' : 'Book'}</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            VIEW 2: WEEK VIEW (7 columns for selected doctor or all)
           ========================================================================= */}
        {!isLoading && !error && viewMode === 'week' && (
          <div className="overflow-x-auto">
            <div className="min-w-[850px]">
              {/* Day Columns Header */}
              <div className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-slate-200 bg-slate-50/80 sticky top-0 z-10">
                <div className="p-3 text-xs font-bold text-slate-500 border-r border-slate-200 text-center">
                  {isBn ? 'সময়' : 'Time'}
                </div>
                {weekDays.map((w) => {
                  const isCurrent = w.dateStr === formatDateDhaka(new Date());
                  return (
                    <div
                      key={w.dateStr}
                      className={`p-3 text-center border-r border-slate-200 last:border-r-0 ${
                        isCurrent ? 'bg-emerald-50/50' : ''
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-800">{w.label}</div>
                      {isCurrent && (
                        <span className="inline-block mt-0.5 px-2 py-0.2 rounded-full text-[10px] font-bold bg-[#0DA54F] text-white">
                          {isBn ? 'আজ' : 'Today'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Time Slots Matrix */}
              <div className="divide-y divide-slate-100">
                {TIME_SLOTS.map((timeSlot) => (
                  <div
                    key={timeSlot}
                    className="grid grid-cols-[80px_repeat(7,1fr)] min-h-[56px]"
                  >
                    {/* Time Column Label */}
                    <div className="p-2 text-xs font-semibold text-slate-500 border-r border-slate-200 text-center bg-slate-50/50 tabular-nums flex items-center justify-center">
                      {formatTime12h(timeSlot)}
                    </div>

                    {/* Day Columns */}
                    {weekDays.map((w) => {
                      const docId = selectedDoctor !== 'all' ? selectedDoctor : 'usr-101';
                      const isWorking = isProviderWorking(docId, w.dateStr, timeSlot);
                      const timeOff = getProviderTimeOff(docId, w.dateStr, timeSlot);

                      const slotApts = appointments.filter(
                        (a) =>
                          (selectedDoctor === 'all' || a.provider_id === selectedDoctor) &&
                          a.appointment_date === w.dateStr &&
                          a.start_time <= timeSlot &&
                          a.end_time > timeSlot
                      );

                      if (timeOff) {
                        return (
                          <div
                            key={w.dateStr}
                            className="border-r border-slate-200 last:border-r-0 p-1.5 relative bg-[repeating-linear-gradient(45deg,#fef2f2,#fef2f2_10px,#fee2e2_10px,#fee2e2_20px)] border-t border-b border-rose-200 flex items-center justify-center"
                            title={`Time-off: ${timeOff.reason || 'Leave'}`}
                          >
                            <span className="bg-white/90 px-1.5 py-0.5 rounded text-[10px] font-bold text-rose-700 shadow-2xs border border-rose-300">
                              {timeOff.reason || (isBn ? 'ছুটি' : 'Leave')}
                            </span>
                          </div>
                        );
                      }

                      const cellBg = isWorking ? 'bg-white' : 'bg-slate-100/60';

                      return (
                        <div
                          key={w.dateStr}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, w.dateStr, timeSlot, docId)}
                          className={`border-r border-slate-200 last:border-r-0 p-1.5 relative transition-colors group ${cellBg}`}
                        >
                          {slotApts.length > 0 ? (
                            <div className="space-y-1">
                              {slotApts.map((apt) => {
                                const badge = getStatusBadge(apt.status);
                                return (
                                  <div
                                    key={apt.id}
                                    draggable={dragRescheduleEnabled}
                                    onDragStart={(e) => handleDragStart(e, apt)}
                                    onClick={() => handleCardClick(apt)}
                                    className={`p-2 rounded-xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-all cursor-pointer border-l-4 ${badge.border} text-left select-none`}
                                  >
                                    <div className="flex items-center justify-between gap-1 mb-1">
                                      <span className="font-semibold text-xs text-slate-900 truncate">
                                        {apt.patient_name}
                                      </span>
                                      <span
                                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${badge.badgeBg}`}
                                      >
                                        {badge.icon}
                                        <span className="capitalize">{badge.label}</span>
                                      </span>
                                    </div>
                                    <div className="text-[11px] font-medium text-slate-600 truncate">
                                      {apt.service_name}
                                    </div>
                                    <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-between">
                                      <span className="tabular-nums">
                                        {formatTime12h(apt.start_time)}
                                      </span>
                                      {apt.provider_name && (
                                        <span className="text-[#0DA54F] font-medium truncate max-w-[80px]">
                                          {apt.provider_name.split(' ')[1] || apt.provider_name}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <button
                              onClick={() => handleEmptySlotClick(w.dateStr, timeSlot, docId)}
                              className="w-full h-full min-h-[40px] rounded-lg opacity-0 group-hover:opacity-100 hover:bg-emerald-50/80 border border-dashed border-emerald-300 flex items-center justify-center text-[11px] text-[#0DA54F] font-semibold transition-opacity focus:opacity-100 focus:outline-hidden"
                              aria-label={`Book slot at ${timeSlot} on ${w.dateStr}`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            VIEW 3: MONTH VIEW (Day cells with counts and up to 3 compact chips)
           ========================================================================= */}
        {!isLoading && !error && viewMode === 'month' && (
          <div>
            {/* Days of week header */}
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80 text-center">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
                <div key={d} className="p-2.5 text-xs font-bold text-slate-600 border-r border-slate-200 last:border-r-0">
                  {isBn
                    ? ['সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি', 'রবি'][i]
                    : d}
                </div>
              ))}
            </div>

            {/* Month Day Cells */}
            <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
              {monthCells.map((cell) => {
                const isToday = cell.dateStr === formatDateDhaka(new Date());

                return (
                  <div
                    key={cell.dateStr}
                    onClick={() => {
                      setCurrentDate(parseDateDhaka(cell.dateStr));
                      setViewMode('day');
                    }}
                    className={`min-h-[110px] p-2 transition-colors cursor-pointer group hover:bg-slate-50/80 ${
                      cell.isCurrentMonth ? 'bg-white' : 'bg-slate-50/40 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold tabular-nums ${
                          isToday
                            ? 'bg-[#0DA54F] text-white shadow-xs'
                            : cell.isCurrentMonth
                            ? 'text-slate-800'
                            : 'text-slate-400'
                        }`}
                      >
                        {cell.dayNum}
                      </span>

                      {cell.appointments.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {cell.appointments.length}
                        </span>
                      )}
                    </div>

                    {/* Up to 3 compact chips */}
                    <div className="space-y-1">
                      {cell.appointments.slice(0, 3).map((apt) => {
                        const badge = getStatusBadge(apt.status);
                        return (
                          <div
                            key={apt.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCardClick(apt);
                            }}
                            className={`px-1.5 py-1 rounded-md bg-white border border-slate-200 shadow-2xs hover:shadow-xs border-l-2 ${badge.border} text-[10px] truncate`}
                            title={`${apt.start_time} - ${apt.patient_name} (${apt.service_name})`}
                          >
                            <span className="font-semibold text-slate-900 mr-1 tabular-nums">
                              {apt.start_time}
                            </span>
                            <span className="text-slate-700 truncate">
                              {apt.patient_name}
                            </span>
                          </div>
                        );
                      })}

                      {cell.appointments.length > 3 && (
                        <div className="text-[10px] font-semibold text-[#0DA54F] pt-0.5 pl-1">
                          +{cell.appointments.length - 3} {isBn ? 'অন্যান্য' : 'more'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          CONFIRM DRAG-TO-RESCHEDULE MODAL (Mandatory Reason Dialog)
         ========================================================================= */}
      {isConfirmingDragReschedule && draggingAppointment && dragTargetSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 bg-amber-50/70 border-b border-amber-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-amber-100 text-amber-800">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    {isBn ? 'অ্যাপয়েন্টমেন্ট পুনঃনির্ধারণ নিশ্চিতকরণ' : 'Confirm Reschedule via Calendar'}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    {draggingAppointment.appointment_code}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsConfirmingDragReschedule(false);
                  setDraggingAppointment(null);
                  setDragTargetSlot(null);
                }}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              {/* Conflict / Server Error Alert */}
              {dragRescheduleError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">{isBn ? 'দ্বন্দ্ব বা ত্রুটি:' : 'Conflict / Error:'}</span>{' '}
                    {dragRescheduleError}
                  </div>
                </div>
              )}

              {/* Slot shift details */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                <div className="flex items-center justify-between text-slate-600">
                  <span>{isBn ? 'রোগী:' : 'Patient:'}</span>
                  <span className="font-bold text-slate-900">{draggingAppointment.patient_name}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>{isBn ? 'পূর্ববর্তী সময়:' : 'Current Slot:'}</span>
                  <span className="font-semibold text-rose-700">
                    {draggingAppointment.appointment_date} at {draggingAppointment.start_time}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600 border-t border-slate-200/60 pt-2">
                  <span>{isBn ? 'নতুন সময় (টার্গেট):' : 'New Target Slot:'}</span>
                  <span className="font-bold text-emerald-700">
                    {dragTargetSlot.date} at {dragTargetSlot.time}
                  </span>
                </div>
              </div>

              {/* Mandatory Reason */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  {isBn ? 'পুনঃনির্ধারণের কারণ (বাধ্যতামূলক)' : 'Rescheduling Reason (Mandatory)'}
                  <span className="text-rose-500 ml-1">*</span>
                </label>
                <textarea
                  value={dragReason}
                  onChange={(e) => setDragReason(e.target.value)}
                  rows={3}
                  placeholder={
                    isBn
                      ? 'উদাঃ রোগীর অনুরোধে সময় পরিবর্তন, ডাক্তারের অনুরোধ ইত্যাদি...'
                      : 'e.g. Patient requested morning slot, doctor delayed...'
                  }
                  className="w-full text-xs rounded-xl border border-slate-300 p-3 focus:outline-hidden focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F] transition-all resize-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsConfirmingDragReschedule(false);
                    setDraggingAppointment(null);
                    setDragTargetSlot(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  {isBn ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="button"
                  disabled={isSubmittingDrag || !dragReason.trim()}
                  onClick={handleConfirmDragReschedule}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#0DA54F] hover:bg-[#09833e] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                >
                  {isSubmittingDrag && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isBn ? 'পুনঃনির্ধারণ নিশ্চিত করুন' : 'Confirm Reschedule'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          REUSED DRAWERS: New Appointment & Detail View
         ========================================================================= */}
      <NewAppointmentDrawer
        isOpen={isNewAppointmentOpen}
        onClose={() => setIsNewAppointmentOpen(false)}
        initialDoctorId={newAppointmentPrefill.doctorId}
        initialDate={newAppointmentPrefill.date}
        initialTime={newAppointmentPrefill.time}
        onSuccess={(newApt) => {
          showToast(
            'success',
            isBn
              ? `নতুন অ্যাপয়েন্টমেন্ট (${newApt.appointment_code}) সফলভাবে বুক করা হয়েছে!`
              : `Appointment (${newApt.appointment_code}) booked successfully!`
          );
          fetchCalendarData();
        }}
      />

      <AppointmentDetailDrawer
        isOpen={isDetailOpen}
        appointmentId={selectedAppointmentId}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedAppointmentId(null);
        }}
        onStatusChange={() => {
          fetchCalendarData();
        }}
        onOpenReschedule={(detail) => {
          setIsDetailOpen(false);
          setRescheduleModalApt(detail);
        }}
        onOpenCancel={(detail) => {
          setIsDetailOpen(false);
          setCancelModalApt(detail);
        }}
      />

      {/* Reused Reschedule Modal */}
      {rescheduleModalApt && (
        <RescheduleAppointmentModal
          isOpen={Boolean(rescheduleModalApt)}
          appointment={rescheduleModalApt}
          onClose={() => setRescheduleModalApt(null)}
          onSuccess={() => {
            showToast('success', isBn ? 'অ্যাপয়েন্টমেন্ট সফলভাবে পুনঃনির্ধারণ করা হয়েছে!' : 'Appointment rescheduled successfully!');
            fetchCalendarData();
          }}
        />
      )}

      {/* Reused Cancel Modal */}
      {cancelModalApt && (
        <CancelAppointmentModal
          isOpen={Boolean(cancelModalApt)}
          appointment={cancelModalApt}
          onClose={() => setCancelModalApt(null)}
          onSuccess={() => {
            showToast('success', isBn ? 'অ্যাপয়েন্টমেন্ট বাতিল করা হয়েছে।' : 'Appointment cancelled.');
            fetchCalendarData();
          }}
        />
      )}
    </div>
  );
};
