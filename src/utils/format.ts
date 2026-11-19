/**
 * SUOXI Skin Care & Aesthetic Center CRM
 * Formatting & Localization Utilities
 * Currency BDT ৳, Asia/Dhaka wall-clock dates, status badges
 */

export function formatBDT(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '৳ 0.00';
  return `৳ ${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatBDTNoDecimals(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '৳ 0';
  return `৳ ${Math.round(amount).toLocaleString('en-US')}`;
}

export function formatDateDhaka(dateStr: string | undefined | null): string {
  if (!dateStr || typeof dateStr !== 'string') return '';
  try {
    const raw = dateStr.split('T')[0];
    const parts = raw.split('-');
    if (parts.length < 3) return dateStr;
    const [year, month, day] = parts;
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    const mIdx = parseInt(month, 10) - 1;
    const monthName = months[mIdx] || month;
    return `${parseInt(day, 10)} ${monthName} ${year}`;
  } catch {
    return String(dateStr);
  }
}

export function formatDateTimeDhaka(dateInput?: string | Date | null): string {
  if (!dateInput) return '—';
  try {
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) return String(dateInput);
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Dhaka',
    }).format(d);
  } catch {
    return String(dateInput);
  }
}

export function formatTime12h(time24: string | undefined | null): string {
  if (!time24 || typeof time24 !== 'string') return '';
  try {
    const parts = time24.split(':');
    if (parts.length < 2) return time24;
    const [hours, minutes] = parts;
    const h = parseInt(hours, 10);
    if (isNaN(h)) return time24;
    const suffix = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes.substring(0, 2)} ${suffix}`;
  } catch {
    return String(time24);
  }
}

export function getStatusBadgeClass(status: string): { bg: string; text: string; border: string } {
  switch (status.toLowerCase()) {
    case 'confirmed':
    case 'visited':
    case 'paid':
    case 'active':
    case 'in_stock':
      return {
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
      };
    case 'booked':
    case 'gateway_accepted':
      return {
        bg: 'bg-blue-50',
        text: 'text-blue-700',
        border: 'border-blue-200',
      };
    case 'partially_paid':
    case 'rescheduled':
    case 'low_stock':
    case 'pending':
    case 'call_attempted':
      return {
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        border: 'border-amber-200',
      };
    case 'no_show':
    case 'unpaid':
    case 'cancelled':
    case 'expired':
    case 'failed':
      return {
        bg: 'bg-rose-50',
        text: 'text-rose-700',
        border: 'border-rose-200',
      };
    case 'void':
      return {
        bg: 'bg-slate-100',
        text: 'text-slate-500 line-through',
        border: 'border-slate-300',
      };
    default:
      return {
        bg: 'bg-slate-50',
        text: 'text-slate-600',
        border: 'border-slate-200',
      };
  }
}
