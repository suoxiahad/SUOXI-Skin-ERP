import React from 'react';
import {
  Sparkles,
  Clock,
  ShieldCheck,
  Calendar,
  AlertCircle,
  CheckCircle2,
  PhoneCall,
  User,
  CreditCard,
  Package,
  Layers,
  FileText,
  Building2,
  Stethoscope,
  Activity,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext.js';
import { useAuth } from '../../context/AuthContext.js';
import { StatusBadge, StatusType } from '../common/StatusBadge.js';
import { NavItem } from '../../navigation/navItems.js';

interface ModulePlaceholderViewProps {
  item: NavItem;
  groupTitle: string;
  onOpenSearch?: () => void;
  onNewAppointment?: () => void;
}

export const ModulePlaceholderView: React.FC<ModulePlaceholderViewProps> = ({
  item,
  groupTitle,
  onOpenSearch,
  onNewAppointment,
}) => {
  const { t, lang } = useI18n();
  const { user, role } = useAuth();
  const Icon = item.icon;

  const itemTitle = t.nav[item.labelKey] || item.labelKey;

  // Key action contextual guidelines per K1
  const getRoleContextNotes = () => {
    switch (item.id) {
      case 'appointments':
      case 'calendar':
        return {
          title: t.under60SecBooking,
          desc: 'Receptionists and Call Center staff create patient appointments in under 60 seconds with instant duplicate prevention, branch slot verification, and mandatory therapist/doctor allocation.',
          primaryAction: t.newAppointment,
          actionHandler: onNewAppointment,
          icon: Clock,
        };
      case 'prescriptions':
      case 'consultations':
      case 'sessions':
        return {
          title: 'Doctor & Consultant Key Action: Next Session Scheduling',
          desc: 'Doctor finalizes clinical prescription, issues optional food/lifestyle guidance, and sets the mandatory NEXT SESSION date to ensure continuous aesthetic progression.',
          primaryAction: null,
          actionHandler: undefined,
          icon: Stethoscope,
        };
      case 'call-center':
      case 'tasks':
        return {
          title: "Call Center Worklist: Tomorrow's Treatment Sessions",
          desc: "Prioritized worklist of patients scheduled for tomorrow across Dhaka. All calls made via external telephony hardware/software, then logged with standardized disposition outcomes.",
          primaryAction: null,
          actionHandler: undefined,
          icon: PhoneCall,
        };
      case 'billing-invoices':
      case 'billing-payments':
        return {
          title: 'Accounts & Cashier: Accurate Dues & Split Payments',
          desc: 'Cashier records cash, bKash, card, or multi-tender payments, tracks package consumption, and verifies exact outstanding dues before releasing patient receipts.',
          primaryAction: null,
          actionHandler: undefined,
          icon: CreditCard,
        };
      case 'inv-stock':
      case 'inv-products':
        return {
          title: 'Inventory & Batch Expiry Tracking',
          desc: 'FEFO (First-Expired, First-Out) tracking for aesthetic serums, Botox vials, peeling solutions, and consumable supplies with minimum stock safety thresholds.',
          primaryAction: null,
          actionHandler: undefined,
          icon: Package,
        };
      default:
        return {
          title: 'SUOXI Operational Workflow Module',
          desc: 'Integrated clinical record, branch scheduling, and multi-role operations designed for high-throughput Dhaka clinic performance.',
          primaryAction: null,
          actionHandler: undefined,
          icon: Sparkles,
        };
    }
  };

  const contextNote = getRoleContextNotes();
  const ContextIcon = contextNote.icon;

  const demoBadges: StatusType[] = [
    'CONFIRMED',
    'CHECKED_IN',
    'IN_SESSION',
    'COMPLETED',
    'PAID',
    'PARTIAL',
    'DUE',
    'IN_STOCK',
    'LOW_STOCK',
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header Card */}
      <div className="glass-panel rounded-xl p-5 sm:p-6 bg-brand-card/90 shadow-sm border border-brand-border">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center flex-shrink-0 text-brand-primary">
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-brand-muted">
                  {groupTitle}
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-xs text-brand-primary font-mono bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                  {item.permission}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-brand-text mt-0.5">
                {itemTitle}
              </h1>
              <p className="text-xs sm:text-sm text-brand-muted mt-1 max-w-2xl">
                {item.description}
              </p>
            </div>
          </div>

          {contextNote.primaryAction && contextNote.actionHandler && (
            <button
              type="button"
              onClick={contextNote.actionHandler}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand-primary hover:bg-brand-primary-hover text-white text-sm font-semibold shadow-sm transition-all focus-ring self-start sm:self-center"
            >
              <Calendar className="w-4 h-4" />
              <span>{contextNote.primaryAction}</span>
            </button>
          )}
        </div>

        {/* Context Highlight Bar */}
        <div className="mt-5 p-3.5 rounded-lg bg-slate-50/90 border border-slate-200/80 flex items-start gap-3">
          <ContextIcon className="w-5 h-5 text-brand-primary flex-shrink-0 mt-0.5" />
          <div className="text-xs text-slate-700">
            <span className="font-semibold text-slate-900 mr-1.5">{contextNote.title}:</span>
            <span>{contextNote.desc}</span>
          </div>
        </div>
      </div>

      {/* Metrics / KPI Preview row with glassmorphic cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card rounded-xl p-4 bg-brand-card/70 border border-brand-border shadow-2xs">
          <div className="flex items-center justify-between text-xs text-brand-muted">
            <span>{t.clinicBranch}</span>
            <Building2 className="w-4 h-4 text-brand-primary" />
          </div>
          <div className="text-lg font-bold text-brand-text mt-2">Bashundhara, Dhaka</div>
          <div className="text-[11px] text-emerald-700 mt-1 font-medium flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Timezone: UTC+6 (Dhaka)</span>
          </div>
        </div>

        <div className="glass-card rounded-xl p-4 bg-brand-card/70 border border-brand-border shadow-2xs">
          <div className="flex items-center justify-between text-xs text-brand-muted">
            <span>Active Session Role</span>
            <ShieldCheck className="w-4 h-4 text-brand-primary" />
          </div>
          <div className="text-lg font-bold text-brand-text mt-2 capitalize">
            {user ? (t[role as keyof typeof t] as string) || role.replace('_', ' ') : 'Guest'}
          </div>
          <div className="text-[11px] text-brand-muted mt-1 truncate">
            {user?.email}
          </div>
        </div>

        <div className="glass-card rounded-xl p-4 bg-brand-card/70 border border-brand-border shadow-2xs">
          <div className="flex items-center justify-between text-xs text-brand-muted">
            <span>Branch Operating Status</span>
            <Activity className="w-4 h-4 text-brand-primary" />
          </div>
          <div className="text-lg font-bold text-brand-text mt-2">Active Shifts</div>
          <div className="text-[11px] text-slate-600 mt-1">
            Doctors, Therapists & Cashier Online
          </div>
        </div>

        <div className="glass-card rounded-xl p-4 bg-brand-card/70 border border-brand-border shadow-2xs">
          <div className="flex items-center justify-between text-xs text-brand-muted">
            <span>Quick Patient Search</span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 rounded border">⌘K</kbd>
          </div>
          <div className="text-lg font-bold text-brand-text mt-2">Instant Lookup</div>
          <div className="text-[11px] text-brand-primary font-medium mt-1">
            <button
              type="button"
              onClick={onOpenSearch}
              className="hover:underline flex items-center gap-1"
            >
              Open Search Modal &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* K2 Status Badges Demonstration & Operational Table Preview */}
      <div className="glass-panel rounded-xl bg-brand-card/90 border border-brand-border overflow-hidden shadow-sm">
        <div className="p-4 sm:p-5 border-b border-brand-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/50">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-brand-text">
              K2 Design System Status & Token Verification
            </h2>
            <p className="text-xs text-brand-muted mt-0.5">
              Accessible badges pair recognizable icons with explicit text labels. Zero color-only indicators.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {demoBadges.slice(0, 4).map((status) => (
              <StatusBadge key={status} status={status} size="sm" />
            ))}
          </div>
        </div>

        {/* Informative Table Structure */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-brand-border font-medium">
              <tr>
                <th className="py-3 px-4">Entity / Record</th>
                <th className="py-3 px-4">Identifier</th>
                <th className="py-3 px-4">Operational Status</th>
                <th className="py-3 px-4">Target Role</th>
                <th className="py-3 px-4 text-right">Standard SLA / Rule</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-brand-text">
              <tr className="hover:bg-slate-50/50 transition-colors">
                <td className="py-3 px-4 font-medium flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-brand-primary" />
                  <span>Nusrat Jahan (Bashundhara)</span>
                </td>
                <td className="py-3 px-4 font-mono text-brand-muted">SX-2026-0041</td>
                <td className="py-3 px-4">
                  <StatusBadge status="CONFIRMED" size="sm" />
                </td>
                <td className="py-3 px-4 text-slate-600">Receptionist / Therapist</td>
                <td className="py-3 px-4 text-right text-brand-muted">Check-in within 5m</td>
              </tr>
              <tr className="hover:bg-slate-50/50 transition-colors">
                <td className="py-3 px-4 font-medium flex items-center gap-2">
                  <Stethoscope className="w-3.5 h-3.5 text-brand-primary" />
                  <span>Clinical Prescription & Guidance</span>
                </td>
                <td className="py-3 px-4 font-mono text-brand-muted">RX-2026-0812</td>
                <td className="py-3 px-4">
                  <StatusBadge status="IN_SESSION" size="sm" />
                </td>
                <td className="py-3 px-4 text-slate-600">Doctor / Consultant</td>
                <td className="py-3 px-4 text-right text-brand-muted">Mandatory Next Session date</td>
              </tr>
              <tr className="hover:bg-slate-50/50 transition-colors">
                <td className="py-3 px-4 font-medium flex items-center gap-2">
                  <CreditCard className="w-3.5 h-3.5 text-brand-primary" />
                  <span>Package Invoice (Laser Toning 6x)</span>
                </td>
                <td className="py-3 px-4 font-mono text-brand-muted">INV-2026-1045</td>
                <td className="py-3 px-4">
                  <StatusBadge status="PARTIAL" size="sm" />
                </td>
                <td className="py-3 px-4 text-slate-600">Accounts / Cashier</td>
                <td className="py-3 px-4 text-right text-brand-muted">Due ৳12,500 recorded</td>
              </tr>
              <tr className="hover:bg-slate-50/50 transition-colors">
                <td className="py-3 px-4 font-medium flex items-center gap-2">
                  <Package className="w-3.5 h-3.5 text-brand-primary" />
                  <span>Hyaluronic Serum 50ml (Batch B24)</span>
                </td>
                <td className="py-3 px-4 font-mono text-brand-muted">SKU-SER-002</td>
                <td className="py-3 px-4">
                  <StatusBadge status="LOW_STOCK" size="sm" />
                </td>
                <td className="py-3 px-4 text-slate-600">Inventory Manager</td>
                <td className="py-3 px-4 text-right text-brand-muted">Reorder trigger (4 left)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="p-3 bg-slate-50 border-t border-brand-border flex items-center justify-between text-[11px] text-brand-muted">
          <span>SUOXI Clinic CRM Architecture • Stage Prompt 1 App Shell</span>
          <span className="font-mono">Ready for Prompt 2A API & DB Migration</span>
        </div>
      </div>
    </div>
  );
};
