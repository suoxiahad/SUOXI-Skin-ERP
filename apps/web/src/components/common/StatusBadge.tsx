import React from 'react';
import {
  Clock,
  CheckCircle2,
  UserCheck,
  PlayCircle,
  XCircle,
  AlertTriangle,
  Receipt,
  CreditCard,
  AlertCircle,
  PackageCheck,
  PackageX,
  Sparkles,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext.js';

export type StatusType =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'IN_SESSION'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'PAID'
  | 'PARTIAL'
  | 'DUE'
  | 'UNPAID'
  | 'IN_STOCK'
  | 'LOW_STOCK'
  | 'OUT_OF_STOCK'
  | 'MERGED';

interface StatusBadgeProps {
  status: StatusType;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * StatusBadge Component
 * Adheres to K2 Design Tokens:
 * 1. Accessible contrast (WCAG AA).
 * 2. Never relies on color alone: ALWAYS pairs a recognizable icon with explicit text.
 * 3. Uses centralized theme classes without hardcoded hexes.
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md', className = '' }) => {
  const { t } = useI18n();

  const getStatusConfig = () => {
    switch (status) {
      case 'CONFIRMED':
        return {
          label: t.statusConfirmed,
          icon: CheckCircle2,
          classes: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        };
      case 'CHECKED_IN':
        return {
          label: t.statusCheckedIn,
          icon: UserCheck,
          classes: 'bg-blue-50 text-blue-800 border-blue-200',
        };
      case 'IN_SESSION':
        return {
          label: t.statusInSession,
          icon: PlayCircle,
          classes: 'bg-purple-50 text-purple-800 border-purple-200',
        };
      case 'COMPLETED':
        return {
          label: t.statusCompleted,
          icon: Sparkles,
          classes: 'bg-teal-50 text-teal-800 border-teal-200',
        };
      case 'CANCELLED':
        return {
          label: t.statusCancelled,
          icon: XCircle,
          classes: 'bg-stone-100 text-stone-700 border-stone-300',
        };
      case 'NO_SHOW':
        return {
          label: t.statusNoShow,
          icon: AlertCircle,
          classes: 'bg-red-50 text-red-800 border-red-200',
        };
      case 'PAID':
        return {
          label: t.statusPaid,
          icon: CreditCard,
          classes: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        };
      case 'PARTIAL':
        return {
          label: t.statusPartial,
          icon: Receipt,
          classes: 'bg-amber-50 text-amber-800 border-amber-200',
        };
      case 'DUE':
      case 'UNPAID':
        return {
          label: t.statusDue,
          icon: AlertTriangle,
          classes: 'bg-rose-50 text-rose-800 border-rose-200',
        };
      case 'IN_STOCK':
        return {
          label: t.statusInStock,
          icon: PackageCheck,
          classes: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        };
      case 'LOW_STOCK':
        return {
          label: t.statusLowStock,
          icon: AlertTriangle,
          classes: 'bg-amber-50 text-amber-800 border-amber-200',
        };
      case 'OUT_OF_STOCK':
        return {
          label: t.statusOutOfStock,
          icon: PackageX,
          classes: 'bg-rose-50 text-rose-800 border-rose-200',
        };
      case 'MERGED':
        return {
          label: 'Merged',
          icon: AlertTriangle,
          classes: 'bg-stone-100 text-stone-600 border-stone-300',
        };
      case 'DRAFT':
      default:
        return {
          label: t.statusDraft,
          icon: Clock,
          classes: 'bg-slate-100 text-slate-700 border-slate-300',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const sizeClasses = size === 'sm' ? 'px-1.5 py-0.5 text-[11px] gap-1' : 'px-2 py-0.5 text-xs gap-1.5';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span
      className={`inline-flex items-center font-medium border rounded-full ${sizeClasses} ${config.classes} ${className}`}
    >
      <Icon className={`${iconSize} flex-shrink-0`} aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
};
