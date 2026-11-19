import React, { useState, useEffect, useMemo } from 'react';
import {
  SlidersHorizontal,
  Building2,
  ShieldCheck,
  Lock,
  Clock,
  Database,
  Plus,
  Edit2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Download,
  RotateCcw,
  Smartphone,
  Laptop,
  Globe,
  DollarSign,
  Receipt,
  Eye,
  EyeOff,
  UserCheck,
  LogOut,
  Calendar,
  Check,
  FileText,
  AlertCircle,
  HelpCircle,
  HardDriveDownload,
  Power,
  Server,
  Zap,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';
import { api } from '../../../api/client.ts';
import type {
  Branch,
  ClinicGeneralSettings,
  ClinicSchedulingSettings,
  ClinicSecuritySettings,
  BackupRecord,
  ActiveSessionRecord,
} from '../../../types/index.ts';

export const SecuritySettingsView: React.FC = () => {
  const { currentView, navigate, language, addToast } = useApp();
  const isBn = language === 'bn';

  // Active Sub-tab derived from currentView
  const activeTab = useMemo<'general' | 'access' | 'security' | 'scheduling' | 'backup'>(() => {
    if (currentView === 'settings-access-control') return 'access';
    if (currentView === 'settings-security') return 'security';
    if (currentView === 'settings-scheduling') return 'scheduling';
    if (currentView === 'settings-backup') return 'backup';
    return 'general';
  }, [currentView]);

  const handleTabChange = (tab: 'general' | 'access' | 'security' | 'scheduling' | 'backup') => {
    switch (tab) {
      case 'general':
        navigate('/settings/general');
        break;
      case 'access':
        navigate('/settings/access-control');
        break;
      case 'security':
        navigate('/settings/security');
        break;
      case 'scheduling':
        navigate('/settings/scheduling');
        break;
      case 'backup':
        navigate('/settings/backup');
        break;
    }
  };

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [general, setGeneral] = useState<ClinicGeneralSettings | null>(null);
  const [scheduling, setScheduling] = useState<ClinicSchedulingSettings | null>(null);
  const [security, setSecurity] = useState<ClinicSecuritySettings | null>(null);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [sessions, setSessions] = useState<ActiveSessionRecord[]>([]);

  // Modals & form state
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchFormData, setBranchFormData] = useState({
    name: '',
    nameBn: '',
    code: '',
    phone: '',
    email: '',
    address: '',
    city: 'Dhaka',
    managerName: '',
    managerPhone: '',
    operatingHours: '09:00 AM - 08:30 PM (Sat - Thu)',
  });

  const [isSavingGeneral, setIsSavingGeneral] = useState(false);
  const [isSavingScheduling, setIsSavingScheduling] = useState(false);
  const [isSavingSecurity, setIsSavingSecurity] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);

  // Fetch all configuration
  const fetchAllSettings = async () => {
    setIsLoading(true);
    try {
      const [brList, gen, sched, sec, bkpList, sessList] = await Promise.all([
        api.branches.list(),
        api.settings.getGeneral(),
        api.settings.getScheduling(),
        api.settings.getSecurity(),
        api.settings.listBackups(),
        api.settings.listSessions(),
      ]);
      setBranches(brList);
      setGeneral(gen);
      setScheduling(sched);
      setSecurity(sec);
      setBackups(bkpList);
      setSessions(sessList);
    } catch (err: any) {
      console.error('Failed to load system settings:', err);
      addToast({
        type: 'error',
        title: isBn ? 'সেটিংস লোড ব্যর্থ' : 'Failed to load settings',
        description: err.message || 'Network error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllSettings();
  }, []);

  // Handle Save General Settings
  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!general) return;
    setIsSavingGeneral(true);
    try {
      const updated = await api.settings.updateGeneral(general);
      setGeneral(updated);
      addToast({
        type: 'success',
        title: isBn ? 'জেনারেল সেটিংস সংরক্ষিত' : 'General Settings Saved',
        description: 'Clinic branding, VAT and invoice rules updated',
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: isBn ? 'সংরক্ষণ ব্যর্থ' : 'Save Failed',
        description: err.message,
      });
    } finally {
      setIsSavingGeneral(false);
    }
  };

  // Handle Save Scheduling Settings
  const handleSaveScheduling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduling) return;
    setIsSavingScheduling(true);
    try {
      const updated = await api.settings.updateScheduling(scheduling);
      setScheduling(updated);
      addToast({
        type: 'success',
        title: isBn ? 'শিডিউলিং সেটিংস সংরক্ষিত' : 'Scheduling Rules Saved',
        description: 'Appointment slot durations and turnover buffers updated',
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: isBn ? 'সংরক্ষণ ব্যর্থ' : 'Save Failed',
        description: err.message,
      });
    } finally {
      setIsSavingScheduling(false);
    }
  };

  // Handle Save Security Settings
  const handleSaveSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!security) return;
    setIsSavingSecurity(true);
    try {
      const updated = await api.settings.updateSecurity(security);
      setSecurity(updated);
      addToast({
        type: 'success',
        title: isBn ? 'সিকিউরিটি পলিসি সংরক্ষিত' : 'Security Policies Saved',
        description: '2FA, password expiry, and session timeout updated',
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: isBn ? 'সংরক্ষণ ব্যর্থ' : 'Save Failed',
        description: err.message,
      });
    } finally {
      setIsSavingSecurity(false);
    }
  };

  // Handle Branch Form Submit (Add or Edit)
  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchFormData.name || !branchFormData.code || !branchFormData.phone) {
      addToast({
        type: 'warning',
        title: isBn ? 'তথ্য অসম্পূর্ণ' : 'Incomplete Form',
        description: 'Branch name, code and phone are required',
      });
      return;
    }

    try {
      if (editingBranch) {
        const updated = await api.branches.update(editingBranch.id, branchFormData);
        setBranches((prev) => prev.map((b) => (b.id === editingBranch.id ? updated : b)));
        addToast({
          type: 'success',
          title: isBn ? 'ব্রাঞ্চ আপডেট সফল' : 'Branch Updated',
          description: `${updated.name} updated successfully`,
        });
      } else {
        const created = await api.branches.create(branchFormData);
        setBranches((prev) => [...prev, created]);
        addToast({
          type: 'success',
          title: isBn ? 'নতুন ব্রাঞ্চ যুক্ত হয়েছে' : 'Branch Registered',
          description: `${created.name} (${created.code}) created successfully`,
        });
      }
      setIsBranchModalOpen(false);
      setEditingBranch(null);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: isBn ? 'ব্রাঞ্চ সংরক্ষণ ব্যর্থ' : 'Failed to save branch',
        description: err.message,
      });
    }
  };

  // Toggle Branch Status
  const handleToggleBranchStatus = async (branch: Branch) => {
    try {
      const updated = await api.branches.toggleStatus(branch.id);
      setBranches((prev) => prev.map((b) => (b.id === branch.id ? updated : b)));
      addToast({
        type: 'success',
        title: isBn ? 'স্ট্যাটাস পরিবর্তিত' : 'Branch Status Updated',
        description: `${branch.name} is now ${updated.isActive ? 'ACTIVE' : 'INACTIVE'}`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: isBn ? 'ব্যর্থ হয়েছে' : 'Failed to toggle status',
        description: err.message,
      });
    }
  };

  // Open Edit Branch Modal
  const openEditBranchModal = (b: Branch) => {
    setEditingBranch(b);
    setBranchFormData({
      name: b.name,
      nameBn: b.nameBn || '',
      code: b.code,
      phone: b.phone,
      email: b.email || '',
      address: b.address,
      city: b.city,
      managerName: b.managerName || '',
      managerPhone: b.managerPhone || '',
      operatingHours: b.operatingHours || '09:00 AM - 08:30 PM (Sat - Thu)',
    });
    setIsBranchModalOpen(true);
  };

  // Open Add Branch Modal
  const openAddBranchModal = () => {
    setEditingBranch(null);
    setBranchFormData({
      name: '',
      nameBn: '',
      code: '',
      phone: '+880',
      email: '',
      address: '',
      city: 'Dhaka',
      managerName: '',
      managerPhone: '',
      operatingHours: '09:00 AM - 08:30 PM (Sat - Thu)',
    });
    setIsBranchModalOpen(true);
  };

  // Create Manual Backup
  const handleCreateBackup = async () => {
    setIsCreatingBackup(true);
    try {
      const newBkp = await api.settings.createBackup('manual');
      setBackups((prev) => [newBkp, ...prev]);
      addToast({
        type: 'success',
        title: isBn ? 'ব্যাকআপ সফল' : 'Backup Snapshot Created',
        description: `Snapshot ${newBkp.filename} generated successfully`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: isBn ? 'ব্যাকআপ ব্যর্থ' : 'Backup Failed',
        description: err.message,
      });
    } finally {
      setIsCreatingBackup(false);
    }
  };

  // Restore Backup Simulation
  const handleRestoreBackup = async (b: BackupRecord) => {
    const confirm = window.confirm(
      `Are you sure you want to simulate restoring from snapshot: ${b.filename}?`
    );
    if (!confirm) return;

    try {
      const res = await api.settings.restoreBackup(b.id);
      addToast({
        type: 'success',
        title: isBn ? 'রিস্টোর সফল' : 'Database Restored',
        description: res.message,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: isBn ? 'রিস্টোর ব্যর্থ' : 'Restore Failed',
        description: err.message,
      });
    }
  };

  // Revoke Single Session
  const handleRevokeSession = async (s: ActiveSessionRecord) => {
    try {
      await api.settings.revokeSession(s.id);
      setSessions((prev) => prev.filter((sess) => sess.id !== s.id));
      addToast({
        type: 'success',
        title: isBn ? 'সেশন বাতিল' : 'Session Revoked',
        description: `Terminated session for ${s.userName} on ${s.deviceInfo}`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: isBn ? 'বাতিল ব্যর্থ' : 'Failed to revoke',
        description: err.message,
      });
    }
  };

  // Revoke All Other Sessions
  const handleRevokeAllSessions = async () => {
    try {
      const res = await api.settings.revokeAllSessions();
      setSessions((prev) => prev.filter((s) => s.isCurrentSession));
      addToast({
        type: 'success',
        title: isBn ? 'সকল কনকারেন্ট সেশন সমাপ্ত' : 'All Other Sessions Revoked',
        description: res.message,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: isBn ? 'ব্যর্থ হয়েছে' : 'Failed to revoke all',
        description: err.message,
      });
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Branding */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-slate-800 to-indigo-600 flex items-center justify-center text-white shadow-sm">
              <SlidersHorizontal className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <span>{isBn ? 'সিকিউরিটি ও সিস্টেম সেটিংস' : 'Security & System Settings'}</span>
                <span className="text-xs px-2.5 py-0.5 rounded-md font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Enterprise
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {isBn
                  ? 'মাল্টি-ব্রাঞ্চ নেটওয়ার্ক, আরব্যাক ডেটা রেস্ট্রিকশন, সেশন ও অডিট, স্লট শিডিউলিং এবং অটোমেটেড ব্যাকআপ'
                  : 'Manage clinic branch network, RBAC access governance, session security, scheduling rules, and automated backups'}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Header Actions */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fetchAllSettings}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isBn ? 'রিফ্রেশ' : 'Refresh'}</span>
          </button>

          <button
            type="button"
            onClick={openAddBranchModal}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all cursor-pointer"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>{isBn ? 'নতুন ব্রাঞ্চ' : 'Add Branch'}</span>
          </button>

          <button
            type="button"
            onClick={handleCreateBackup}
            disabled={isCreatingBackup}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-slate-800 to-indigo-700 hover:from-slate-900 hover:to-indigo-800 rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Database className={`w-3.5 h-3.5 ${isCreatingBackup ? 'animate-spin' : ''}`} />
            <span>{isCreatingBackup ? 'Creating...' : isBn ? 'ব্যাকআপ নিন' : 'Backup Now'}</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Branch Network */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {isBn ? 'সক্রিয় ব্রাঞ্চ নেটওয়ার্ক' : 'Active Branches'}
            </p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">
              {branches.filter((b) => b.isActive).length}
              <span className="text-xs font-normal text-slate-400 ml-1.5">/ {branches.length} centers</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Dhanmondi, Gulshan & Uttara</span>
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Building2 className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: Security & Compliance */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {isBn ? 'সিকিউরিটি স্থিতি' : 'Security Health'}
            </p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">
              {security?.twoFactorEnforced ? '2FA Enforced' : 'Standard'}
            </h3>
            <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{security?.sessionTimeoutMinutes || 15}m Auto Session Lock</span>
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Lock className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Scheduling Rules */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {isBn ? 'ডিফল্ট স্লট ও বাফার' : 'Slot Duration'}
            </p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">
              {scheduling?.defaultSlotDurationMinutes || 30} mins
            </h3>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1 font-medium">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              <span>+{scheduling?.patientBufferMinutes || 5} mins patient turnover buffer</span>
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: Disaster Recovery */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {isBn ? 'ডেটা ব্যাকআপ স্টেটাস' : 'Data Protection'}
            </p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">
              {backups.length > 0 ? 'Protected' : 'Pending'}
            </h3>
            <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Daily Automated Snapshots</span>
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Database className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Sub-Tab Navigation */}
      <div className="flex border-b border-slate-200 bg-white px-4 rounded-t-xl overflow-x-auto no-scrollbar">
        {[
          { id: 'general', label: isBn ? 'জেনারেল ও ব্রাঞ্চ সেটআপ' : 'General & Branch Setup', icon: Building2 },
          { id: 'access', label: isBn ? 'অ্যাক্সেস কন্ট্রোল ও আরব্যাক' : 'Access Control & RBAC', icon: ShieldCheck },
          { id: 'security', label: isBn ? 'অথেনটিকেশন ও সিকিউরিটি' : 'Authentication & Security', icon: Lock },
          { id: 'scheduling', label: isBn ? 'বুকিং ও ক্লিনিক্যাল রুলস' : 'Booking & Clinical Rules', icon: Clock },
          { id: 'backup', label: isBn ? 'ব্যাকআপ ও সিস্টেম অডিট' : 'Backup & System Audit', icon: Database },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id as any)}
              className={`flex items-center gap-2 py-3.5 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: GENERAL & BRANCH SETUP                                             */}
      {/* ========================================================================= */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          {/* Branch Network Management Card */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  <span>Clinic Branch Centers Network</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Manage clinical branches, addresses, managers, and operating hours across Dhaka
                </p>
              </div>

              <button
                type="button"
                onClick={openAddBranchModal}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add New Branch</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {branches.map((b) => (
                <div
                  key={b.id}
                  className={`p-4 rounded-xl border transition-all ${
                    b.isActive ? 'border-slate-200 bg-white hover:border-blue-300' : 'border-slate-200 bg-slate-50 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">{b.name}</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-blue-100 text-blue-800 font-mono">
                          {b.code}
                        </span>
                      </div>
                      {b.nameBn && <p className="text-xs text-slate-500 mt-0.5 font-normal">{b.nameBn}</p>}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditBranchModal(b)}
                        className="p-1 text-slate-400 hover:text-blue-600 rounded-md cursor-pointer"
                        title="Edit Branch"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleBranchStatus(b)}
                        className={`p-1 rounded-md cursor-pointer ${
                          b.isActive ? 'text-slate-400 hover:text-rose-600' : 'text-slate-400 hover:text-emerald-600'
                        }`}
                        title={b.isActive ? 'Deactivate Branch' : 'Activate Branch'}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 text-xs space-y-1.5 text-slate-600 border-t border-slate-100 pt-2.5">
                    <p className="truncate text-slate-700 font-medium">{b.address}</p>
                    <p className="font-mono text-slate-800 flex items-center justify-between">
                      <span className="text-slate-400">Hotline:</span>
                      <span>{b.phone}</span>
                    </p>
                    <p className="flex items-center justify-between">
                      <span className="text-slate-400">Branch Manager:</span>
                      <span className="font-semibold text-slate-800">{b.managerName || '—'}</span>
                    </p>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{b.operatingHours || '09:00 AM - 08:30 PM'}</span>
                    </p>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Status:</span>
                    <span
                      className={`font-bold px-2 py-0.5 rounded-full text-[10px] uppercase ${
                        b.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {b.isActive ? 'Operating' : 'Inactive'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Clinic Profile & General Billing Form */}
          {general && (
            <form onSubmit={handleSaveGeneral} className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                    {isBn ? 'ক্লিনিক প্রোফাইল ও জেনারেল ফাইন্যান্সিয়াল সেটিংস' : 'Clinic Profile & Financial Parameters'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Official clinic title, business identification number (BIN), tax compliance, and invoice numbering
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isSavingGeneral}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  {isSavingGeneral ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Save General Setup</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Clinic Name (English)</label>
                  <input
                    type="text"
                    required
                    value={general.clinicName}
                    onChange={(e) => setGeneral({ ...general, clinicName: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Clinic Name (বাংলা)</label>
                  <input
                    type="text"
                    value={general.clinicNameBn || ''}
                    onChange={(e) => setGeneral({ ...general, clinicNameBn: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tax BIN Number (Bangladesh)</label>
                  <input
                    type="text"
                    required
                    value={general.binNumber}
                    onChange={(e) => setGeneral({ ...general, binNumber: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Trade License No.</label>
                  <input
                    type="text"
                    value={general.tradeLicenseNo || ''}
                    onChange={(e) => setGeneral({ ...general, tradeLicenseNo: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Government VAT Rate (%)</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={general.vatPercent}
                      onChange={(e) => setGeneral({ ...general, vatPercent: Number(e.target.value) })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Invoice Number Prefix</label>
                  <input
                    type="text"
                    required
                    value={general.invoicePrefix}
                    onChange={(e) => setGeneral({ ...general, invoicePrefix: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Primary Central Helpline</label>
                  <input
                    type="text"
                    required
                    value={general.primaryHelpline}
                    onChange={(e) => setGeneral({ ...general, primaryHelpline: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Support Email</label>
                  <input
                    type="email"
                    required
                    value={general.supportEmail}
                    onChange={(e) => setGeneral({ ...general, supportEmail: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">System Timezone</label>
                  <input
                    type="text"
                    disabled
                    value={general.timezone}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-slate-500 font-mono"
                  />
                </div>

                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="block font-semibold text-slate-700 mb-1">POS Receipt Legal Disclaimer & Footer</label>
                  <textarea
                    rows={2}
                    value={general.posFooterNotes || ''}
                    onChange={(e) => setGeneral({ ...general, posFooterNotes: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ACCESS CONTROL & RBAC                                              */}
      {/* ========================================================================= */}
      {activeTab === 'access' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Patient Privacy & Clinical Data Restriction Policies</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Protect sensitive patient records, medical photos, and restrict call center phone visibility
                </p>
              </div>

              <button
                type="button"
                onClick={() => navigate('/users/roles')}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span>Open Granular Role Matrix</span>
                <span className="text-blue-600 font-bold">→</span>
              </button>
            </div>

            <div className="space-y-3">
              {/* Policy 1: Phone Masking in Call Center */}
              <div className="p-4 rounded-xl border border-slate-200 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="font-bold text-xs text-slate-900 block">
                    Call Center Phone Number Masking
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Hides the last 4 digits of patient mobile numbers (e.g. +8801712***678) in Call Center follow-up lists to prevent unauthorized contact extraction.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={security?.maskPatientMobileInCallCenter ?? true}
                    onChange={(e) => {
                      if (security) setSecurity({ ...security, maskPatientMobileInCallCenter: e.target.checked });
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* Policy 2: Data Export Privileges */}
              <div className="p-4 rounded-xl border border-slate-200 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="font-bold text-xs text-slate-900 block">
                    Data Export Authorization (Excel & CSV)
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Restricts downloading patient lists, invoices, or inventory records to Super Admin and Operations Manager roles only. All exports trigger high-priority audit events.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={security?.allowDataExport ?? true}
                    onChange={(e) => {
                      if (security) setSecurity({ ...security, allowDataExport: e.target.checked });
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* Policy 3: EMR & Prescription Sign-off */}
              <div className="p-4 rounded-xl border border-slate-200 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="font-bold text-xs text-slate-900 block">
                    Doctor Digital Signature & BMDC Validation Rule
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Enforces that clinical prescriptions cannot be finalized or exported without an authenticated BMDC Registration number assigned to the active doctor.
                  </p>
                </div>
                <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-emerald-100 text-emerald-800 uppercase">
                  Always Active
                </span>
              </div>
            </div>

            {security && (
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleSaveSecurity}
                  disabled={isSavingSecurity}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  {isSavingSecurity ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Save Privacy Policies</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: AUTHENTICATION & SECURITY                                          */}
      {/* ========================================================================= */}
      {activeTab === 'security' && security && (
        <div className="space-y-6">
          <form onSubmit={handleSaveSecurity} className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <Lock className="w-4 h-4 text-indigo-600" />
                  <span>Authentication Policies & Session Auto-Lock</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Two-factor authentication, cashier discount thresholds, and terminal inactivity timer
                </p>
              </div>

              <button
                type="submit"
                disabled={isSavingSecurity}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {isSavingSecurity ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Save Security Rules</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              {/* 2FA Enforcement */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">2-Factor Authentication (2FA)</span>
                  <input
                    type="checkbox"
                    checked={security.twoFactorEnforced}
                    onChange={(e) => setSecurity({ ...security, twoFactorEnforced: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 rounded-sm"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Enforces SMS OTP verification on logins for Super Admin, Doctors, and Cashiers.
                </p>
              </div>

              {/* Session Inactivity Timeout */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <label className="block font-bold text-slate-800">
                  Inactivity Auto-Lock Timeout
                </label>
                <select
                  value={security.sessionTimeoutMinutes}
                  onChange={(e) => setSecurity({ ...security, sessionTimeoutMinutes: Number(e.target.value) })}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white font-mono"
                >
                  <option value={10}>10 Minutes</option>
                  <option value={15}>15 Minutes (Recommended)</option>
                  <option value={30}>30 Minutes</option>
                  <option value={60}>60 Minutes</option>
                </select>
                <p className="text-[11px] text-slate-500">
                  Locks clinic consultation iPads and POS terminals upon inactivity.
                </p>
              </div>

              {/* Cashier Max Discount Cap */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <label className="block font-bold text-slate-800">
                  Cashier Max Discount Limit (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={security.maxDiscountPercentWithoutApproval}
                  onChange={(e) => setSecurity({ ...security, maxDiscountPercentWithoutApproval: Number(e.target.value) })}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white font-mono"
                />
                <p className="text-[11px] text-slate-500">
                  Discounts exceeding this threshold require Manager OTP clearance.
                </p>
              </div>

              {/* Password Expiry */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <label className="block font-bold text-slate-800">
                  Password Expiration (Days)
                </label>
                <select
                  value={security.passwordExpiryDays}
                  onChange={(e) => setSecurity({ ...security, passwordExpiryDays: Number(e.target.value) })}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white font-mono"
                >
                  <option value={60}>60 Days</option>
                  <option value={90}>90 Days (Recommended)</option>
                  <option value={180}>180 Days</option>
                  <option value={365}>365 Days</option>
                </select>
                <p className="text-[11px] text-slate-500">
                  Staff will be prompted to rotate passwords after this duration.
                </p>
              </div>

              {/* Patient Portal Magic Link Expiry */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <label className="block font-bold text-slate-800">
                  Patient Portal Link Expiry (Hours)
                </label>
                <input
                  type="number"
                  min={1}
                  max={72}
                  value={security.patientPortalLinkExpiryHours}
                  onChange={(e) => setSecurity({ ...security, patientPortalLinkExpiryHours: Number(e.target.value) })}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white font-mono"
                />
                <p className="text-[11px] text-slate-500">
                  SMS invitation and password reset token lifespan for patients.
                </p>
              </div>

              {/* Patient Portal OTP Expiry */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <label className="block font-bold text-slate-800">
                  Patient Portal OTP Expiry (Mins)
                </label>
                <input
                  type="number"
                  min={1}
                  max={15}
                  value={security.patientPortalOtpExpiryMinutes}
                  onChange={(e) => setSecurity({ ...security, patientPortalOtpExpiryMinutes: Number(e.target.value) })}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white font-mono"
                />
                <p className="text-[11px] text-slate-500">
                  Validity window of login 6-digit SMS verification code.
                </p>
              </div>
            </div>
          </form>

          {/* Live Active Sessions Table */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-blue-600" />
                  <span>Concurrent Terminal & Staff Login Sessions</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time list of active web browsers, clinical tablets, and POS terminals
                </p>
              </div>

              <button
                type="button"
                onClick={handleRevokeAllSessions}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Revoke All Other Sessions</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Staff Member</th>
                    <th className="py-2.5 px-3">Terminal / Device</th>
                    <th className="py-2.5 px-3">IP Address</th>
                    <th className="py-2.5 px-3">Login Time</th>
                    <th className="py-2.5 px-3">Last Active</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {sessions.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">{s.userName}</span>
                          {s.isCurrentSession && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-emerald-100 text-emerald-800">
                              THIS DEVICE
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase">{s.role}</span>
                      </td>

                      <td className="py-3 px-3 text-slate-600 font-medium">
                        {s.deviceInfo}
                      </td>

                      <td className="py-3 px-3 font-mono text-slate-800">
                        {s.ipAddress}
                      </td>

                      <td className="py-3 px-3 font-mono text-slate-500">
                        {new Date(s.loginTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>

                      <td className="py-3 px-3 font-mono text-slate-500">
                        {new Date(s.lastActiveTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>

                      <td className="py-3 px-3 text-right">
                        {!s.isCurrentSession && (
                          <button
                            type="button"
                            onClick={() => handleRevokeSession(s)}
                            className="text-xs text-rose-600 hover:text-rose-800 font-semibold cursor-pointer"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: BOOKING & CLINICAL RULES                                           */}
      {/* ========================================================================= */}
      {activeTab === 'scheduling' && scheduling && (
        <div className="space-y-6">
          <form onSubmit={handleSaveScheduling} className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <span>Clinical Appointment Timing & Slot Duration Rules</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Define consultation intervals, patient turnover buffers, and clinic opening hours
                </p>
              </div>

              <button
                type="submit"
                disabled={isSavingScheduling}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {isSavingScheduling ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Save Scheduling Rules</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Default Doctor Consultation Duration
                </label>
                <select
                  value={scheduling.defaultSlotDurationMinutes}
                  onChange={(e) => setScheduling({ ...scheduling, defaultSlotDurationMinutes: Number(e.target.value) })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white font-mono"
                >
                  <option value={15}>15 Minutes (Express Skin Check)</option>
                  <option value={20}>20 Minutes</option>
                  <option value={30}>30 Minutes (Standard Aesthetic Consultation)</option>
                  <option value={45}>45 Minutes (Comprehensive Dermatology & Laser Assessment)</option>
                  <option value={60}>60 Minutes (Full Face Aesthetic Procedure)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Patient Turnover Buffer (Sanitization)
                </label>
                <select
                  value={scheduling.patientBufferMinutes}
                  onChange={(e) => setScheduling({ ...scheduling, patientBufferMinutes: Number(e.target.value) })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white font-mono"
                >
                  <option value={0}>0 Minutes (Back-to-back)</option>
                  <option value={5}>5 Minutes (Room disinfection & prep)</option>
                  <option value={10}>10 Minutes</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Maximum Advance Booking Window
                </label>
                <select
                  value={scheduling.maxAdvanceBookingDays}
                  onChange={(e) => setScheduling({ ...scheduling, maxAdvanceBookingDays: Number(e.target.value) })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white font-mono"
                >
                  <option value={14}>14 Days</option>
                  <option value={30}>30 Days (Standard 1 Month)</option>
                  <option value={60}>60 Days</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Clinic Opening Time</label>
                <input
                  type="time"
                  value={scheduling.operatingStartTime}
                  onChange={(e) => setScheduling({ ...scheduling, operatingStartTime: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Clinic Closing Time</label>
                <input
                  type="time"
                  value={scheduling.operatingEndTime}
                  onChange={(e) => setScheduling({ ...scheduling, operatingEndTime: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono"
                />
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800 block">Automated 24h SMS Reminder</span>
                  <p className="text-[11px] text-slate-500">Dispatches clinic SMS with Token & Doctor Name</p>
                </div>
                <input
                  type="checkbox"
                  checked={scheduling.autoSendSmsReminder24h}
                  onChange={(e) => setScheduling({ ...scheduling, autoSendSmsReminder24h: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded-sm"
                />
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: BACKUP & SYSTEM AUDIT                                              */}
      {/* ========================================================================= */}
      {activeTab === 'backup' && (
        <div className="space-y-6">
          {/* Action Hero */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-600" />
                  <span>Clinic Database Snapshots & Disaster Recovery</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Generate instant full SQL database dumps or simulate disaster recovery point restorations
                </p>
              </div>

              <button
                type="button"
                onClick={handleCreateBackup}
                disabled={isCreatingBackup}
                className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <HardDriveDownload className={`w-3.5 h-3.5 ${isCreatingBackup ? 'animate-spin' : ''}`} />
                <span>{isCreatingBackup ? 'Creating Snapshot...' : 'Generate New Backup'}</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Snapshot Filename</th>
                    <th className="py-2.5 px-3">Backup Type</th>
                    <th className="py-2.5 px-3">Archive Size</th>
                    <th className="py-2.5 px-3">Record Count</th>
                    <th className="py-2.5 px-3">Created At</th>
                    <th className="py-2.5 px-3">Generated By</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-mono text-[11px]">
                  {backups.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 font-semibold text-slate-900 flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        <span className="truncate max-w-[220px]">{b.filename}</span>
                      </td>

                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-sm font-bold text-[10px] uppercase font-sans ${
                            b.backupType === 'auto_daily'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-indigo-50 text-indigo-700'
                          }`}
                        >
                          {b.backupType.replace('_', ' ')}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-slate-800 font-bold">
                        {b.fileSize}
                      </td>

                      <td className="py-3 px-3 text-slate-600 font-sans">
                        {b.totalRecords.toLocaleString()} rows
                      </td>

                      <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                        {new Date(b.createdAt).toLocaleString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      <td className="py-3 px-3 font-sans text-slate-600">
                        {b.createdBy}
                      </td>

                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-2 font-sans">
                          {/* Download Link */}
                          <a
                            href={`/api/v1/settings/backups/download/${b.id}`}
                            download
                            className="p-1.5 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors inline-flex items-center gap-1 font-semibold text-xs"
                            title="Download SQL archive"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download</span>
                          </a>

                          {/* Restore */}
                          <button
                            type="button"
                            onClick={() => handleRestoreBackup(b)}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition-colors inline-flex items-center gap-1 font-semibold text-xs cursor-pointer"
                            title="Simulate Restore"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Restore</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* System Environment Diagnostic Snapshot */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-600" />
              <span>System & Gateway Operational Health</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-400 block text-[11px]">CSRF Protection</span>
                <span className="font-bold text-emerald-700 flex items-center gap-1 mt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>ACTIVE (Double-Token)</span>
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-400 block text-[11px]">SMS Gateway (msg.mram.bd)</span>
                <span className="font-bold text-emerald-700 flex items-center gap-1 mt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>CONNECTED</span>
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-400 block text-[11px]">cPanel SMTP Mailer</span>
                <span className="font-bold text-emerald-700 flex items-center gap-1 mt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>SSL PORT 465 READY</span>
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-400 block text-[11px]">Server Outbound IP</span>
                <span className="font-bold text-slate-800 font-mono mt-0.5 block">
                  34.34.254.57
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT CLINIC BRANCH                                           */}
      {/* ========================================================================= */}
      {isBranchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
                  <Building2 className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-base text-slate-900">
                  {editingBranch ? 'Edit Branch Details' : 'Register New Clinic Branch'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsBranchModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBranch} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Branch Name (English) *</label>
                  <input
                    type="text"
                    required
                    value={branchFormData.name}
                    onChange={(e) => setBranchFormData({ ...branchFormData, name: e.target.value })}
                    placeholder="e.g. Banani Aesthetic Lounge"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Branch Code (3 Letters) *</label>
                  <input
                    type="text"
                    required
                    maxLength={5}
                    value={branchFormData.code}
                    onChange={(e) => setBranchFormData({ ...branchFormData, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. BNN"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Branch Name (বাংলা)</label>
                  <input
                    type="text"
                    value={branchFormData.nameBn}
                    onChange={(e) => setBranchFormData({ ...branchFormData, nameBn: e.target.value })}
                    placeholder="e.g. বনানী নান্দনিক লাউঞ্জ"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Contact Phone *</label>
                  <input
                    type="text"
                    required
                    value={branchFormData.phone}
                    onChange={(e) => setBranchFormData({ ...branchFormData, phone: e.target.value })}
                    placeholder="+88029XXXXXX"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Full Physical Address</label>
                  <input
                    type="text"
                    value={branchFormData.address}
                    onChange={(e) => setBranchFormData({ ...branchFormData, address: e.target.value })}
                    placeholder="House, Road, Block, Area, Dhaka"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Branch Manager Name</label>
                  <input
                    type="text"
                    value={branchFormData.managerName}
                    onChange={(e) => setBranchFormData({ ...branchFormData, managerName: e.target.value })}
                    placeholder="Manager Name"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Manager Direct Phone</label>
                  <input
                    type="text"
                    value={branchFormData.managerPhone}
                    onChange={(e) => setBranchFormData({ ...branchFormData, managerPhone: e.target.value })}
                    placeholder="+88017XXXXXXXX"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Operating Hours</label>
                  <input
                    type="text"
                    value={branchFormData.operatingHours}
                    onChange={(e) => setBranchFormData({ ...branchFormData, operatingHours: e.target.value })}
                    placeholder="09:00 AM - 08:30 PM (Sat - Thu)"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsBranchModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-xs cursor-pointer"
                >
                  {editingBranch ? 'Save Changes' : 'Confirm Registration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
