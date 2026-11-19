import React, { useState, useEffect } from 'react';
import {
  Search,
  Building2,
  Globe,
  Bell,
  UserCheck,
  ChevronDown,
  Clock,
  Sparkles,
  ShieldAlert,
  LogOut,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import type { UserRole } from '../../types/index.ts';

export const Topbar: React.FC = () => {
  const {
    currentUser,
    branches,
    activeBranchId,
    setActiveBranchId,
    language,
    setLanguage,
    switchRole,
    allowRoleSwitcher,
    logout,
    setIsSearchOpen,
    setIsQuickBookOpen,
  } = useApp();

  const [dhakaTime, setDhakaTime] = useState('');
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);

  // Live Asia/Dhaka Wall-clock Time (Hard Rule & Locale)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      // Format in Asia/Dhaka time
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Dhaka',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });
      setDhakaTime(formatter.format(now));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const rolesList: { role: UserRole; title: string; subtitle: string }[] = [
    { role: 'doctor', title: 'Doctor / Consultant', subtitle: 'Dr. Nusrat Jahan (BMDC-A-48921)' },
    { role: 'receptionist', title: 'Receptionist', subtitle: 'Fatima Zohra (Fast Booking <60s)' },
    { role: 'call_center', title: 'Call Center Agent', subtitle: "Tania Khan (Tomorrow's Calls)" },
    { role: 'cashier', title: 'Accounts & Cashier', subtitle: 'Shamim Hossain (Derived Dues & Billing)' },
    { role: 'therapist', title: 'Therapist / Aesthetician', subtitle: 'Rina Begum (Session Deductions)' },
    { role: 'inventory_manager', title: 'Inventory Manager', subtitle: 'Sharmin Sultana (Stock Adjustments)' },
    { role: 'super_admin', title: 'Super Admin', subtitle: 'Full Privileged Access & Audits' },
    { role: 'patient', title: 'Patient (Mobile Portal)', subtitle: 'Taslima Akter (Upcoming Rx & Diet)' },
  ];

  const currentBranch = branches.find((b) => b.id === activeBranchId) || branches[0];

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 sm:px-6 bg-white/90 backdrop-blur-md border-b border-slate-200">
      {/* Left: Global Search & Fast Search Input */}
      <div className="flex items-center gap-3 flex-1 max-w-md">
        <button
          onClick={() => setIsSearchOpen(true)}
          className="w-full flex items-center justify-between px-3.5 py-2 text-xs text-slate-500 bg-slate-100/80 hover:bg-slate-200/70 border border-slate-200 rounded-xl transition-all shadow-xs group"
        >
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400 group-hover:text-[#0DA54F] transition-colors" />
            <span className="truncate">
              {language === 'bn' ? 'রোগী খুঁজুন (নাম / ফোন)...' : 'Search patient by phone or name...'}
            </span>
          </div>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-mono text-slate-500 bg-white rounded border border-slate-300 shadow-2xs">
            Ctrl K
          </kbd>
        </button>
      </div>

      {/* Right Controls: Branch Switcher, Time, Language, Role Switcher */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Wall Clock Time (Asia/Dhaka) */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-600 bg-slate-50 rounded-lg border border-slate-200">
          <Clock className="w-3.5 h-3.5 text-[#0DA54F]" />
          <span className="font-mono text-[11px] font-medium">{dhakaTime}</span>
          <span className="text-[10px] text-slate-400 uppercase font-semibold">Dhaka (UTC+6)</span>
        </div>

        {/* Branch Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setIsBranchDropdownOpen(!isBranchDropdownOpen);
              setIsRoleDropdownOpen(false);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition-colors"
          >
            <Building2 className="w-3.5 h-3.5 text-[#0DA54F]" />
            <span className="hidden md:inline truncate max-w-[120px]">
              {language === 'bn' ? currentBranch?.nameBn || currentBranch?.name : currentBranch?.name}
            </span>
            <span className="md:hidden font-mono">{currentBranch?.code || 'DHN'}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {isBranchDropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50 animate-in fade-in zoom-in-95">
              <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] font-semibold uppercase text-slate-400 tracking-wider">
                {language === 'bn' ? 'শাখা নির্বাচন করুন' : 'Select Clinic Branch'}
              </div>
              {branches.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    setActiveBranchId(b.id);
                    setIsBranchDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 transition-colors ${
                    activeBranchId === b.id ? 'bg-[#0DA54F]/5 text-[#0DA54F] font-semibold' : 'text-slate-700'
                  }`}
                >
                  <div>
                    <p className="font-medium">{language === 'bn' ? b.nameBn : b.name}</p>
                    <p className="text-[10px] text-slate-400 truncate max-w-[180px]">{b.address}</p>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                    {b.code}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Language Toggle বাংলা | EN */}
        <div className="flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-xs">
          <button
            onClick={() => setLanguage('bn')}
            className={`px-2 py-1 rounded-md font-bengali text-xs transition-all ${
              language === 'bn'
                ? 'bg-white text-[#0DA54F] font-bold shadow-2xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            বাংলা
          </button>
          <button
            onClick={() => setLanguage('en')}
            className={`px-2 py-1 rounded-md text-xs font-semibold transition-all ${
              language === 'en'
                ? 'bg-white text-[#0DA54F] font-bold shadow-2xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            EN
          </button>
        </div>

        {/* Role Switcher (Crucial for testing all 8 roles) */}
        <div className="relative">
          <button
            onClick={() => {
              setIsRoleDropdownOpen(!isRoleDropdownOpen);
              setIsBranchDropdownOpen(false);
            }}
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 text-xs font-medium text-slate-800 bg-[#0DA54F]/10 hover:bg-[#0DA54F]/15 border border-[#0DA54F]/20 rounded-lg transition-all"
            title="Switch User Role"
          >
            <div className="w-5 h-5 rounded-full bg-[#0DA54F] text-white flex items-center justify-center text-[10px] font-bold">
              {currentUser?.name.charAt(0) || 'D'}
            </div>
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-[11px] font-bold text-[#0DA54F] leading-tight">
                {currentUser?.role.replace('_', ' ').toUpperCase()}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-[#0DA54F]" />
          </button>

          {isRoleDropdownOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95">
              {allowRoleSwitcher ? (
                <>
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="text-[11px] font-bold text-slate-800">Switch Operational Role</p>
                    <p className="text-[10px] text-slate-500">
                      Test SUOXI workflows under any of the 8 clinic roles:
                    </p>
                  </div>

                  <div className="max-h-80 overflow-y-auto py-1">
                    {rolesList.map((item) => (
                      <button
                        key={item.role}
                        onClick={() => {
                          switchRole(item.role);
                          setIsRoleDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs flex items-start gap-2.5 hover:bg-slate-50 transition-colors ${
                          currentUser?.role === item.role ? 'bg-[#0DA54F]/10 text-[#0DA54F]' : 'text-slate-700'
                        }`}
                      >
                        <div
                          className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                            currentUser?.role === item.role ? 'bg-[#0DA54F]' : 'bg-slate-300'
                          }`}
                        />
                        <div>
                          <p className="font-semibold">{item.title}</p>
                          <p className="text-[10px] text-slate-400">{item.subtitle}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="p-3 space-y-2">
                  <div className="border-b border-slate-100 pb-2">
                    <p className="text-xs font-bold text-slate-800">{currentUser?.name}</p>
                    <p className="text-[11px] text-slate-500">{currentUser?.email}</p>
                    <p className="text-[10px] uppercase font-semibold text-[#0DA54F] mt-0.5">
                      {currentUser?.role.replace('_', ' ')} · {currentUser?.branchName}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setIsRoleDropdownOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'সাইন আউট' : 'Sign Out'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
