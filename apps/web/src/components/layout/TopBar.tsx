import React from 'react';
import {
  Menu,
  Search,
  Globe,
  ChevronRight,
  LogOut,
  Building2,
  CalendarPlus,
  UserPlus,
  Shield,
  User,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext.js';
import { useAuth } from '../../context/AuthContext.js';
import { notificationsApi } from '../../api/notifications.js';
import type { StaffAlertDto } from '@suoxi/shared-types';
import {
  Bell,
  Check,
  AlertTriangle,
  Clock,
  Archive,
  Calendar,
  Stethoscope,
  X,
} from 'lucide-react';

interface TopBarProps {
  onOpenMobileSidebar: () => void;
  onOpenSearch: () => void;
  breadcrumbs: { group: string; label: string };
  onQuickNewAppointment?: () => void;
  onQuickRegisterPatient?: () => void;
  onNavigate?: (path: string) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onOpenMobileSidebar,
  onOpenSearch,
  breadcrumbs,
  onQuickNewAppointment,
  onQuickRegisterPatient,
  onNavigate,
}) => {
  const { t, lang, toggleLang } = useI18n();
  const { user, logout, branches, allBranches, activeBranchId, setActiveBranchId } = useAuth();

  // Staff alerts state
  const [alerts, setAlerts] = React.useState<StaffAlertDto[]>([]);
  const [unreadCount, setUnreadCount] = React.useState<number>(0);
  const [isAlertsOpen, setIsAlertsOpen] = React.useState<boolean>(false);
  const alertsRef = React.useRef<HTMLDivElement>(null);

  const fetchAlerts = React.useCallback(async () => {
    try {
      const res = await notificationsApi.listStaffAlerts(undefined, 10);
      if (Array.isArray(res)) {
        setAlerts(res);
        setUnreadCount(res.filter((a: StaffAlertDto) => !a.is_read).length);
      }
    } catch {
      // Background poll failure silent
    }
  }, []);

  React.useEffect(() => {
    fetchAlerts();
    const timer = setInterval(fetchAlerts, 15000);
    return () => clearInterval(timer);
  }, [fetchAlerts]);

  // Close dropdown on outside click
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (alertsRef.current && !alertsRef.current.contains(e.target as Node)) {
        setIsAlertsOpen(false);
      }
    };
    if (isAlertsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isAlertsOpen]);

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await notificationsApi.markStaffAlertRead(id);
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, is_read: true, read_at: new Date().toISOString() } : a))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllStaffAlertsRead();
      setAlerts((prev) =>
        prev.map((a) => ({ ...a, is_read: true, read_at: new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch {
      // Ignore
    }
  };

  const handleAlertClick = (alert: StaffAlertDto) => {
    if (!alert.is_read) {
      handleMarkAsRead(alert.id);
    }
    setIsAlertsOpen(false);
    if (alert.link_path && onNavigate) {
      onNavigate(alert.link_path);
    }
  };

  const renderAlertIcon = (type: string) => {
    switch (type) {
      case 'upcoming_session':
        return <Calendar className="w-3.5 h-3.5 text-blue-600" />;
      case 'failed_reminder':
        return <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />;
      case 'low_stock':
        return <Archive className="w-3.5 h-3.5 text-purple-600" />;
      case 'clinical_alert':
        return <Stethoscope className="w-3.5 h-3.5 text-emerald-600" />;
      default:
        return <Clock className="w-3.5 h-3.5 text-amber-600" />;
    }
  };

  const primaryRole = user?.roles?.[0] || 'staff';
  const displayName = user?.fullName || user?.username || 'Staff User';
  const currentBranch = branches.find((b: any) => b.id === activeBranchId) || branches[0];
  const branchName =
    lang === 'bn' && currentBranch?.nameBn
      ? currentBranch.nameBn
      : currentBranch?.name || t.clinicBranch;
  const hasMultipleBranches = allBranches || branches.length > 1;

  return (
    <header className="h-16 bg-brand-card/90 backdrop-blur-md border-b border-brand-border sticky top-0 z-30 flex items-center justify-between px-3 sm:px-6">
      {/* Left Section: Mobile Menu + Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          aria-label="Open mobile navigation sidebar"
          className="lg:hidden p-2 rounded-lg text-brand-muted hover:text-brand-text hover:bg-brand-primary-light focus-ring"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Dynamic Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1.5 text-xs">
          <span className="text-brand-muted font-medium">{breadcrumbs.group}</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-brand-text font-semibold">{breadcrumbs.label}</span>
        </nav>
      </div>

      {/* Middle Section: Quick Search Trigger */}
      <div className="flex-1 max-w-xs sm:max-w-md mx-2 sm:mx-6">
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label={t.searchPlaceholder}
          className="w-full flex items-center justify-between px-3.5 py-1.5 rounded-xl border border-brand-border bg-slate-50/70 hover:bg-slate-100/80 text-brand-muted text-xs transition-all focus-ring cursor-pointer group"
        >
          <div className="flex items-center gap-2 truncate">
            <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-brand-primary transition-colors" />
            <span className="truncate">{t.searchPlaceholder}</span>
          </div>

          <kbd className="hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-mono font-medium text-slate-500 shadow-2xs">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right Section: Actions & Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Fast Action Buttons (Under-60-sec appointment & patient registration) */}
        {onQuickNewAppointment && (
          <button
            type="button"
            onClick={onQuickNewAppointment}
            aria-label={t.under60SecBooking}
            title={t.under60SecBooking}
            className="hidden xl:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200/80 text-xs font-semibold transition-all focus-ring"
          >
            <CalendarPlus className="w-3.5 h-3.5 text-emerald-700" />
            <span>{t.quickBookNew}</span>
          </button>
        )}

        {onQuickRegisterPatient && (
          <button
            type="button"
            onClick={onQuickRegisterPatient}
            aria-label={t.newAppointment}
            title={t.newAppointment}
            className="hidden 2xl:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200/80 border border-slate-200 text-xs font-semibold transition-all focus-ring"
          >
            <UserPlus className="w-3.5 h-3.5 text-slate-600" />
            <span>+ Patient</span>
          </button>
        )}

        {/* Staff Alerts Bell Dropdown */}
        <div className="relative" ref={alertsRef}>
          <button
            type="button"
            onClick={() => setIsAlertsOpen((prev) => !prev)}
            className="p-1.5 rounded-lg text-brand-muted hover:text-brand-text hover:bg-brand-primary-light transition-colors focus-ring relative cursor-pointer"
            aria-label="Staff Alerts"
            title={unreadCount > 0 ? `${unreadCount} unread staff alerts` : 'Staff Alerts'}
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold shadow-xs animate-bounce">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {isAlertsOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-brand-border z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="p-3 border-b border-brand-border bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-brand-text">
                    {lang === 'bn' ? 'স্টাফ সতর্কতা' : 'Staff Alerts'}
                  </h4>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                      {unreadCount} {lang === 'bn' ? 'নতুন' : 'new'}
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="text-[11px] text-brand-primary hover:underline font-semibold cursor-pointer"
                  >
                    {lang === 'bn' ? 'সব পঠিত চিহ্নিত করুন' : 'Mark all read'}
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-brand-border/60">
                {alerts.length === 0 ? (
                  <div className="p-6 text-center text-xs text-brand-muted">
                    {lang === 'bn' ? 'কোনো নতুন সতর্কতা নেই' : 'No alerts at this time'}
                  </div>
                ) : (
                  alerts.map((alt) => (
                    <div
                      key={alt.id}
                      onClick={() => handleAlertClick(alt)}
                      className={`p-3 text-xs hover:bg-slate-50 transition-colors cursor-pointer flex items-start gap-2.5 ${
                        !alt.is_read ? 'bg-amber-50/30' : 'opacity-80'
                      }`}
                    >
                      <div className="p-1.5 rounded-lg bg-slate-100 shrink-0 mt-0.5">
                        {renderAlertIcon(alt.alert_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-brand-text truncate">
                            {alt.title}
                          </span>
                          {!alt.is_read && (
                            <button
                              type="button"
                              onClick={(e) => handleMarkAsRead(alt.id, e)}
                              className="text-[10px] text-slate-400 hover:text-brand-primary font-medium shrink-0"
                              title="Mark read"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 line-clamp-2 mt-0.5">
                          {alt.message}
                        </p>
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          {new Date(alt.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-2 border-t border-brand-border bg-slate-50 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsAlertsOpen(false);
                    if (onNavigate) onNavigate('/reports/notifications');
                  }}
                  className="text-xs text-brand-primary font-semibold hover:underline cursor-pointer"
                >
                  {lang === 'bn' ? 'সব নোটিফিকেশন ও কিউ দেখুন →' : 'View Notification Queue →'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Language Toggle */}
        <button
          type="button"
          onClick={toggleLang}
          className="p-1.5 rounded-lg text-brand-muted hover:text-brand-text hover:bg-brand-primary-light transition-colors focus-ring"
          aria-label="Toggle Language"
          title={lang === 'bn' ? 'Switch to English' : 'বাংলায় পরিবর্তন করুন'}
        >
          <div className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-brand-primary px-1">
            <Globe className="w-3.5 h-3.5" />
            <span>{lang === 'bn' ? 'EN' : 'বাং'}</span>
          </div>
        </button>

        {/* Branch Selector or Locked Display */}
        {hasMultipleBranches ? (
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 bg-slate-100/90 hover:bg-slate-200/70 rounded-lg text-xs font-medium text-slate-700 border border-slate-200 transition-colors">
            <Building2 className="w-3.5 h-3.5 text-brand-primary shrink-0" />
            <select
              value={activeBranchId || currentBranch?.id || ''}
              onChange={(e) => setActiveBranchId(e.target.value)}
              aria-label="Select active clinic branch"
              className="bg-transparent border-none text-xs font-semibold text-slate-700 focus:outline-hidden cursor-pointer pr-1 truncate max-w-[160px]"
            >
              {branches.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {lang === 'bn' && b.nameBn ? b.nameBn : b.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 bg-slate-100/80 rounded-lg text-xs font-medium text-slate-600 border border-slate-200/60"
            title={branchName}
          >
            <Building2 className="w-3 h-3 text-brand-primary shrink-0" />
            <span className="truncate max-w-[150px] font-semibold">{branchName}</span>
          </div>
        )}

        {/* Authenticated Role Badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50/80 border border-emerald-200/80 rounded-lg text-xs font-semibold text-emerald-800">
          <Shield className="w-3 h-3 text-[#0DA54F] flex-shrink-0" />
          <span className="capitalize">{primaryRole.replace('_', ' ')}</span>
        </div>

        {/* User Profile Chip */}
        <div className="flex items-center gap-2 pl-1 sm:pl-2 border-l border-brand-border">
          <div className="w-8 h-8 rounded-full bg-slate-100 border border-brand-border flex items-center justify-center text-xs font-bold text-brand-text">
            {displayName.charAt(0).toUpperCase()}
          </div>

          <div className="hidden md:block text-left">
            <div className="text-xs font-semibold text-brand-text leading-tight truncate max-w-[120px]">
              {displayName}
            </div>
            <div className="text-[10px] text-brand-muted capitalize leading-none mt-0.5 truncate max-w-[120px]">
              {primaryRole.replace('_', ' ')}
            </div>
          </div>

          {/* Logout Button */}
          <button
            type="button"
            onClick={logout}
            aria-label={t.signOut}
            title={t.signOut}
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors focus-ring cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
