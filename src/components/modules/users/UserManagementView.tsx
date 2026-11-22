import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  ShieldCheck,
  Stethoscope,
  Sparkles,
  Lock,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Edit2,
  KeyRound,
  Eye,
  Check,
  Copy,
  Clock,
  Building2,
  Calendar as CalendarIcon,
  Phone,
  Mail,
  Award,
  RefreshCw,
  FileSignature,
  DollarSign,
  UserX,
  UserCheck,
  ChevronRight,
  ShieldAlert,
  SlidersHorizontal,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';
import { api } from '../../../api/client.ts';
import type {
  User,
  UserRole,
  ClinicRoleDefinition,
  StaffDutyRoster,
  UserSecurityLog,
} from '../../../types/index.ts';

export const UserManagementView: React.FC = () => {
  const { currentView, navigate, language, addToast, branches, activeBranchId } = useApp();
  const isBn = language === 'bn';

  // Active Sub-tab derived from currentView
  const activeTab = useMemo<'staff' | 'roles' | 'doctors' | 'roster' | 'security'>(() => {
    if (currentView === 'users-roles') return 'roles';
    if (currentView === 'users-doctors') return 'doctors';
    if (currentView === 'users-roster') return 'roster';
    if (currentView === 'users-security') return 'security';
    return 'staff';
  }, [currentView]);

  const handleTabChange = (tab: 'staff' | 'roles' | 'doctors' | 'roster' | 'security') => {
    switch (tab) {
      case 'staff':
        navigate('/users/staff');
        break;
      case 'roles':
        navigate('/users/roles');
        break;
      case 'doctors':
        navigate('/users/doctors');
        break;
      case 'roster':
        navigate('/users/roster');
        break;
      case 'security':
        navigate('/users/security');
        break;
    }
  };

  // State
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<ClinicRoleDefinition[]>([]);
  const [rosters, setRosters] = useState<StaffDutyRoster[]>([]);
  const [securityLogs, setSecurityLogs] = useState<UserSecurityLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Filters for Staff Directory
  const [branchFilter, setBranchFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [tempPasswordModal, setTempPasswordModal] = useState<{ userName: string; tempPass: string } | null>(null);
  const [copiedPass, setCopiedPass] = useState(false);
  const [isRosterModalOpen, setIsRosterModalOpen] = useState(false);

  // Roles Tab selected role
  const [selectedRoleId, setSelectedRoleId] = useState<string>('doctor');
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [editablePermissions, setEditablePermissions] = useState<string[]>([]);

  // Roster Filter
  const [rosterDate, setRosterDate] = useState('2026-11-03');
  const [rosterBranch, setRosterBranch] = useState('all');

  // Load all initial data
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [uList, rList, rosList, sLogs] = await Promise.all([
        api.users.list({
          branchId: branchFilter !== 'all' ? branchFilter : undefined,
          role: roleFilter !== 'all' ? roleFilter : undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          search: searchQuery || undefined,
        }),
        api.users.listRoles(),
        api.users.listRosters(),
        api.users.listSecurityLogs(),
      ]);
      setUsers(uList);
      setRoles(rList);
      setRosters(rosList);
      setSecurityLogs(sLogs);
    } catch (err: any) {
      console.error('Failed to load user management data:', err);
      addToast({
        type: 'error',
        title: isBn ? 'তথ্য লোড ব্যর্থ' : 'Failed to load user data',
        description: err.message || 'Network error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [branchFilter, roleFilter, statusFilter, searchQuery]);

  // Sync permissions when selected role changes
  useEffect(() => {
    const r = roles.find((role) => role.id === selectedRoleId);
    if (r) {
      setEditablePermissions([...r.permissions]);
    }
  }, [selectedRoleId, roles]);

  // Handle User Status Toggle
  const handleToggleStatus = async (user: User) => {
    const nextStatus = user.status === 'active' ? 'suspended' : 'active';
    try {
      const updated = await api.users.toggleStatus(user.id, nextStatus, 'Admin console toggled status');
      setUsers((prev) => prev.map((u) => (u.id === user.id ? updated : u)));
      addToast({
        type: 'success',
        title: isBn ? 'স্ট্যাটাস পরিবর্তিত' : 'Status Updated',
        description: `${user.name} is now ${nextStatus.toUpperCase()}`,
      });
      // Refresh security logs
      const logs = await api.users.listSecurityLogs();
      setSecurityLogs(logs);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: isBn ? 'ব্যর্থ হয়েছে' : 'Failed to update status',
        description: err.message,
      });
    }
  };

  // Handle Reset Password
  const handleResetPassword = async (user: User) => {
    try {
      const res = await api.users.resetPassword(user.id);
      setTempPasswordModal({
        userName: user.name,
        tempPass: res.tempPassword,
      });
      setCopiedPass(false);
      addToast({
        type: 'success',
        title: isBn ? 'পাসওয়ার্ড রিসেট সফল' : 'Temporary Password Generated',
        description: `Issued temporary credential for ${user.name}`,
      });
      const logs = await api.users.listSecurityLogs();
      setSecurityLogs(logs);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: isBn ? 'রিসেট ব্যর্থ' : 'Reset Failed',
        description: err.message,
      });
    }
  };

  // Copy temp password
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPass(true);
    setTimeout(() => setCopiedPass(false), 2000);
  };

  // Save role permissions
  const handleSaveRolePermissions = async () => {
    if (!selectedRoleId) return;
    setSavingRoleId(selectedRoleId);
    try {
      const updated = await api.users.updateRole(selectedRoleId, {
        permissions: editablePermissions,
      });
      setRoles((prev) => prev.map((r) => (r.id === selectedRoleId ? updated : r)));
      addToast({
        type: 'success',
        title: isBn ? 'পারমিশন সংরক্ষিত' : 'Permissions Saved',
        description: `RBAC permissions for ${updated.name} updated successfully`,
      });
      const logs = await api.users.listSecurityLogs();
      setSecurityLogs(logs);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: isBn ? 'সংরক্ষণ ব্যর্থ' : 'Failed to save',
        description: err.message,
      });
    } finally {
      setSavingRoleId(null);
    }
  };

  // Toggle single permission checkbox
  const togglePermission = (perm: string) => {
    setEditablePermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  // Doctors list
  const doctorList = useMemo(() => {
    return users.filter((u) => u.role === 'doctor');
  }, [users]);

  // Therapists list
  const therapistList = useMemo(() => {
    return users.filter((u) => u.role === 'therapist');
  }, [users]);

  // Filtered Rosters for Roster tab
  const filteredRosters = useMemo(() => {
    let list = [...rosters];
    if (rosterBranch !== 'all') {
      list = list.filter((r) => r.branchId === rosterBranch);
    }
    if (rosterDate) {
      list = list.filter((r) => r.date === rosterDate);
    }
    return list;
  }, [rosters, rosterBranch, rosterDate]);

  // Form State for Add / Edit User
  const [formData, setFormData] = useState({
    employeeId: '',
    name: '',
    nameBn: '',
    email: '',
    phone: '',
    role: 'doctor' as UserRole,
    branchId: activeBranchId || branches[0]?.id || '',
    designation: '',
    specialization: '',
    bmdcRegNo: '',
    consultationFeeBDT: 2000,
    followUpFeeBDT: 1000,
    roomNumber: '',
    shift: 'morning' as 'morning' | 'evening' | 'full_day',
    certifications: [] as string[],
  });

  const openAddModal = () => {
    setFormData({
      employeeId: '',
      name: '',
      nameBn: '',
      email: '',
      phone: '+8801',
      role: 'doctor',
      branchId: activeBranchId || branches[0]?.id || '',
      designation: '',
      specialization: '',
      bmdcRegNo: '',
      consultationFeeBDT: 2000,
      followUpFeeBDT: 1000,
      roomNumber: '',
      shift: 'morning',
      certifications: [],
    });
    setEditingUser(null);
    setIsAddStaffOpen(true);
  };

  const openEditModal = (u: User) => {
    setEditingUser(u);
    setFormData({
      employeeId: u.employeeId || '',
      name: u.name,
      nameBn: u.nameBn || '',
      email: u.email,
      phone: u.phone,
      role: u.role,
      branchId: u.branchId,
      designation: u.designation || '',
      specialization: u.specialization || '',
      bmdcRegNo: u.bmdcRegNo || '',
      consultationFeeBDT: u.consultationFeeBDT || 2000,
      followUpFeeBDT: u.followUpFeeBDT || 1000,
      roomNumber: u.roomNumber || '',
      shift: u.shift || 'morning',
      certifications: u.certifications || [],
    });
    setIsAddStaffOpen(true);
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.phone) {
      addToast({
        type: 'warning',
        title: isBn ? 'তথ্য অসম্পূর্ণ' : 'Incomplete Form',
        description: 'Please fill name, email and phone',
      });
      return;
    }

    try {
      if (editingUser) {
        const updated = await api.users.update(editingUser.id, formData);
        setUsers((prev) => prev.map((u) => (u.id === editingUser.id ? updated : u)));
        addToast({
          type: 'success',
          title: isBn ? 'স্টাফ আপডেট সফল' : 'Staff Profile Updated',
          description: `${updated.name} updated successfully`,
        });
      } else {
        const created = await api.users.create(formData);
        setUsers((prev) => [created, ...prev]);
        addToast({
          type: 'success',
          title: isBn ? 'নতুন স্টাফ যুক্ত হয়েছে' : 'Staff Registered',
          description: `${created.name} added to ${created.branchName}`,
        });
      }
      setIsAddStaffOpen(false);
      setEditingUser(null);
      const logs = await api.users.listSecurityLogs();
      setSecurityLogs(logs);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: isBn ? 'ব্যর্থ হয়েছে' : 'Failed to save',
        description: err.message,
      });
    }
  };

  // Form State for Roster Scheduling
  const [rosterForm, setRosterForm] = useState({
    staffId: '',
    branchId: activeBranchId || branches[0]?.id || '',
    date: new Date().toISOString().substring(0, 10),
    shift: 'morning' as 'morning' | 'evening' | 'full_day' | 'off',
    roomNumber: 'Treatment Suite 1',
    assignedDoctorName: 'Dr. Nusrat Jahan',
    notes: '',
  });

  const handleSaveRoster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rosterForm.staffId || !rosterForm.date) {
      addToast({
        type: 'warning',
        title: isBn ? 'তথ্য অসম্পূর্ণ' : 'Incomplete Form',
        description: 'Select staff and date',
      });
      return;
    }
    try {
      const saved = await api.users.saveRoster(rosterForm);
      setRosters((prev) => {
        const idx = prev.findIndex((r) => r.staffId === saved.staffId && r.date === saved.date);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [saved, ...prev];
      });
      setIsRosterModalOpen(false);
      addToast({
        type: 'success',
        title: isBn ? 'রোস্টার শিডিউল সংরক্ষিত' : 'Duty Roster Updated',
        description: `Duty scheduled for ${saved.staffName}`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: isBn ? 'রোস্টার ব্যর্থ' : 'Failed to schedule',
        description: err.message,
      });
    }
  };

  // Standard permission catalog categorized by module
  const permissionCatalog = [
    {
      category: 'Users & RBAC Governance',
      categoryBn: 'ইউজার ও রোল নিয়ন্ত্রণ',
      items: [
        { key: 'users.view', label: 'View Staff Directory & Profiles' },
        { key: 'users.create', label: 'Register New Staff Member' },
        { key: 'users.edit', label: 'Modify Staff Roles, Fees & Data' },
        { key: 'users.delete', label: 'Suspend or Deactivate User Accounts' },
        { key: 'users.roles', label: 'Edit Role Permission Schemas' },
        { key: 'users.security', label: 'View Security Audit Logs & 2FA Logs' },
        { key: 'users.roster', label: 'Assign & Modify Daily Duty Rosters' },
      ],
    },
    {
      category: 'Clinical Desk & EMR',
      categoryBn: 'ক্লিনিক্যাল ও প্রেসক্রিপশন',
      items: [
        { key: 'clinical.consultation', label: 'Doctor OPD Consultation Desk Access' },
        { key: 'clinical.consultation_view', label: 'View Consultation Records (Read-Only)' },
        { key: 'clinical.prescription', label: 'Issue Digital Rx with BMDC Reg' },
        { key: 'clinical.documents', label: 'Upload Medical Photos & Consent Forms' },
        { key: 'calendar.view', label: 'View Central Clinic Scheduling Calendar' },
        { key: 'calendar.manage_slots', label: 'Block or Customize Doctor Time Slots' },
      ],
    },
    {
      category: 'Aesthetic Packages & Procedures',
      categoryBn: 'প্যাকেজ ও ট্রিটমেন্ট সেশন',
      items: [
        { key: 'packages.view', label: 'View Patient Package Cards' },
        { key: 'packages.deduct', label: 'Perform Session Punch/Deduction' },
        { key: 'treatments.execute', label: 'Log Laser & Energy Device Parameters' },
      ],
    },
    {
      category: 'Billing, Cashier & Financials',
      categoryBn: 'বিলিং, পেমেন্ট ও ক্যাশিয়ার',
      items: [
        { key: 'billing.view', label: 'View Invoices & Receipts' },
        { key: 'billing.create', label: 'Generate New Invoices (POS)' },
        { key: 'billing.collect_payment', label: 'Collect Cash, Card & bKash/Nagad' },
        { key: 'billing.discount_unlimited', label: 'Override Discount Limit (> 5%)' },
        { key: 'billing.closing', label: 'Perform Daily Evening Cash Closing' },
        { key: 'billing.refund', label: 'Issue Bill Void & Refund Clearances' },
      ],
    },
    {
      category: 'Patients & CRM Relations',
      categoryBn: 'পেশেন্ট ও সিআরএম রিলেশন',
      items: [
        { key: 'patients.view', label: 'View Patient Directory & History' },
        { key: 'patients.create', label: 'Register New Patients' },
        { key: 'patients.edit', label: 'Update Contact, Allergies & Skin Type' },
        { key: 'patients.delete', label: 'Flag & Archive Patient Records' },
        { key: 'patients.export', label: 'Export Patient Data to Excel/CSV' },
        { key: 'appointments.view', label: 'View Appointment Pipeline' },
        { key: 'appointments.book', label: 'Create Instant Bookings' },
        { key: 'appointments.checkin', label: 'Perform Reception Physical Check-In' },
        { key: 'followups.view', label: 'View Call Center Follow-up Pipeline' },
      ],
    },
    {
      category: 'Inventory & Gateways',
      categoryBn: 'ইনভেন্টরি ও গেটওয়ে',
      items: [
        { key: 'inventory.view', label: 'View Stock Balances & Batches' },
        { key: 'inventory.create', label: 'Add New Products & SKU Codes' },
        { key: 'inventory.purchase', label: 'Create Purchase Orders (PO)' },
        { key: 'inventory.grn', label: 'Accept Goods Received Notes (GRN)' },
        { key: 'inventory.adjust', label: 'Log Damage, Tester & Clinic Use' },
        { key: 'settings.sms', label: 'Configure SMS Gateway & Masking' },
        { key: 'settings.email', label: 'Configure cPanel SMTP Email Gateway' },
        { key: 'audit.view', label: 'System Audit Trail Access' },
      ],
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Branding */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-sm">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <span>{isBn ? 'ইউজার ম্যানেজমেন্ট' : 'User Management'}</span>
                <span className="text-xs px-2.5 py-0.5 rounded-md font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200">
                  RBAC 2.0
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {isBn
                  ? 'ডাক্তার, লেজার থেরাপিস্ট, ক্যাশিয়ার ও কর্মীদের প্রোফাইল, রোল পারমিশন এবং ডিউটি রোস্টার পরিচালনা'
                  : 'Manage clinical doctors, certified therapists, cashiers, role permissions, and duty rosters'}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fetchData}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isBn ? 'রিফ্রেশ' : 'Refresh'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsRosterModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-cyan-700 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 rounded-xl transition-all cursor-pointer"
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            <span>{isBn ? 'ডিউটি শিডিউল' : 'Schedule Duty'}</span>
          </button>

          <button
            type="button"
            onClick={openAddModal}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{isBn ? 'নতুন স্টাফ যুক্ত করুন' : 'Add New Staff'}</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Staff */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {isBn ? 'মোট সক্রিয় কর্মী' : 'Total Active Staff'}
            </p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">
              {users.filter((u) => u.status === 'active').length}
              <span className="text-xs font-normal text-slate-400 ml-1.5">/ {users.length} registered</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
              <span className="truncate">
                {branches.filter((b) => b.isActive !== false).map((b) => b.name).join(', ') || 'No active branches'}
              </span>
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: Doctors & Specialists */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {isBn ? 'ডাক্তার ও বিশেষজ্ঞ' : 'Doctors & Specialists'}
            </p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">
              {doctorList.length}
              <span className="text-xs font-normal text-emerald-600 ml-1.5 font-semibold">100% BMDC Reg</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <FileSignature className="w-3.5 h-3.5 text-blue-600" />
              <span>Digital Signature Verified</span>
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Stethoscope className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Certified Therapists */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {isBn ? 'সার্টিফাইড থেরাপিস্ট' : 'Certified Therapists'}
            </p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">
              {therapistList.length}
              <span className="text-xs font-normal text-purple-600 ml-1.5 font-semibold">Laser Certified</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <Award className="w-3.5 h-3.5 text-purple-600" />
              <span>HydraFacial, Q-Switch, CO2</span>
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <Sparkles className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: Security & Audit */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {isBn ? 'সিকিউরিটি অডিট লগ' : 'Security Audit Trail'}
            </p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">
              {securityLogs.length}
              <span className="text-xs font-normal text-slate-400 ml-1.5">events</span>
            </h3>
            <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>2FA & IP Tracking Active</span>
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center">
            <Lock className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-4 rounded-t-xl overflow-x-auto no-scrollbar">
        {[
          { id: 'staff', label: isBn ? 'স্টাফ ডিরেক্টরি' : 'Staff Directory', icon: Users, count: users.length },
          { id: 'roles', label: isBn ? 'রোলস ও পারমিশন' : 'Roles & Permissions', icon: ShieldCheck, count: roles.length },
          { id: 'doctors', label: isBn ? 'ডাক্তার ও বিশেষজ্ঞ' : 'Doctors & Specialists', icon: Stethoscope, count: doctorList.length },
          { id: 'roster', label: isBn ? 'থেরাপিস্ট ও ডিউটি রোস্টার' : 'Therapists & Duty Roster', icon: Sparkles, count: rosters.length },
          { id: 'security', label: isBn ? 'লগইন ও সিকিউরিটি অডিট' : 'Login & Security Audit', icon: Lock, count: securityLogs.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id as any)}
              className={`flex items-center gap-2 py-3.5 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: STAFF DIRECTORY                                                    */}
      {/* ========================================================================= */}
      {activeTab === 'staff' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex-1 w-full relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isBn ? 'নাম, ফোন নম্বর, স্পেশালাইজেশন বা BMDC দিয়ে সার্চ...' : 'Search staff by name, phone, email, BMDC...'}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
              />
            </div>

            <div className="flex items-center gap-2.5 w-full md:w-auto">
              {/* Branch Filter */}
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">{isBn ? 'সব ব্রাঞ্চ' : 'All Branches'}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>

              {/* Role Filter */}
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">{isBn ? 'সব পদবী (Roles)' : 'All Roles'}</option>
                <option value="doctor">Doctor / Specialist</option>
                <option value="therapist">Aesthetic Therapist</option>
                <option value="receptionist">Receptionist</option>
                <option value="cashier">Cashier</option>
                <option value="inventory_manager">Inventory Manager</option>
                <option value="call_center">Call Center</option>
                <option value="admin_manager">Operations Manager</option>
                <option value="super_admin">Super Admin</option>
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">{isBn ? 'সকল স্ট্যাটাস' : 'All Status'}</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {/* Staff Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Staff Member</th>
                    <th className="py-3 px-4">Role & Designation</th>
                    <th className="py-3 px-4">Clinic Branch</th>
                    <th className="py-3 px-4">Contact Info</th>
                    <th className="py-3 px-4">Shift & Room</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        {isBn ? 'কোন কর্মী পাওয়া যায়নি' : 'No staff members match the selected criteria.'}
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => {
                      const isDoctor = u.role === 'doctor';
                      const isTherapist = u.role === 'therapist';
                      return (
                        <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                          {/* Name & Avatar */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                                  isDoctor
                                    ? 'bg-blue-100 text-blue-700 border border-blue-200'
                                    : isTherapist
                                    ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                    : u.role === 'super_admin'
                                    ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                                }`}
                              >
                                {u.name.charAt(0)}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-slate-900 leading-tight">{u.name}</p>
                                  {u.employeeId && (
                                    <span className="font-mono text-[11px] font-semibold text-emerald-700 tabular-nums">
                                      · {u.employeeId}
                                    </span>
                                  )}
                                </div>
                                {u.nameBn && <p className="text-[11px] text-slate-500 font-normal">{u.nameBn}</p>}
                                {u.bmdcRegNo && (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded-sm border border-emerald-200 mt-0.5">
                                    <CheckCircle2 className="w-2.5 h-2.5" />
                                    {u.bmdcRegNo}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Role & Designation */}
                          <td className="py-3 px-4">
                            <span
                              className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-md uppercase tracking-wider ${
                                isDoctor
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : isTherapist
                                  ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                  : u.role === 'cashier'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : u.role === 'super_admin'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}
                            >
                              {u.role.replace('_', ' ')}
                            </span>
                            <p className="text-[11px] text-slate-500 truncate max-w-[200px] mt-0.5">
                              {u.designation || u.specialization || 'Clinical Staff'}
                            </p>
                          </td>

                          {/* Branch */}
                          <td className="py-3 px-4">
                            <span className="flex items-center gap-1.5 font-medium text-slate-700">
                              <Building2 className="w-3.5 h-3.5 text-slate-400" />
                              <span>{u.branchName}</span>
                            </span>
                          </td>

                          {/* Contact Info */}
                          <td className="py-3 px-4">
                            <p className="font-mono text-slate-800">{u.phone}</p>
                            <p className="text-slate-400 text-[11px] truncate max-w-[160px]">{u.email}</p>
                          </td>

                          {/* Shift & Room */}
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 capitalize">
                              <Clock className="w-3 h-3 text-slate-400" />
                              {u.shift || 'morning'} shift
                            </span>
                            {u.roomNumber && (
                              <p className="text-[10px] text-slate-500 truncate max-w-[140px] mt-0.5">
                                {u.roomNumber}
                              </p>
                            )}
                          </td>

                          {/* Status */}
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                u.status === 'active'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : u.status === 'suspended'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  u.status === 'active'
                                    ? 'bg-emerald-500'
                                    : u.status === 'suspended'
                                    ? 'bg-rose-500'
                                    : 'bg-slate-400'
                                }`}
                              ></span>
                              {u.status || 'active'}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Edit Profile */}
                              <button
                                type="button"
                                onClick={() => openEditModal(u)}
                                title="Edit Staff Profile"
                                className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Reset Temporary Password */}
                              <button
                                type="button"
                                onClick={() => handleResetPassword(u)}
                                title="Issue Temporary Password"
                                className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                              </button>

                              {/* Toggle Active / Suspended */}
                              <button
                                type="button"
                                onClick={() => handleToggleStatus(u)}
                                title={u.status === 'active' ? 'Suspend Account' : 'Activate Account'}
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                  u.status === 'active'
                                    ? 'text-slate-500 hover:text-rose-600 hover:bg-rose-50'
                                    : 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50'
                                }`}
                              >
                                {u.status === 'active' ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ROLES & PERMISSIONS (RBAC MATRIX)                                  */}
      {/* ========================================================================= */}
      {activeTab === 'roles' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Roles Selection (Left 4 cols) */}
          <div className="lg:col-span-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-800 tracking-tight flex items-center justify-between">
              <span>{isBn ? 'ক্লিনিক রোলসমূহ' : 'Clinic Roles'}</span>
              <span className="text-xs font-normal text-slate-400">8 predefined roles</span>
            </h3>

            <div className="space-y-2">
              {roles.map((r) => {
                const isSelected = selectedRoleId === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRoleId(r.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/50 shadow-2xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">{r.name}</span>
                        {r.isSystemRole && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-sm bg-amber-50 text-amber-700 border border-amber-200 uppercase">
                            System
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{r.description}</p>
                      <span className="text-[10px] text-slate-400 mt-1 inline-block">
                        {r.permissions.length} active permissions • {r.userCount} users
                      </span>
                    </div>
                    <ChevronRight
                      className={`w-4 h-4 shrink-0 transition-transform ${
                        isSelected ? 'text-blue-600 translate-x-0.5' : 'text-slate-300'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Granular Permission Checklist (Right 8 cols) */}
          <div className="lg:col-span-8 bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  Permissions Matrix: {roles.find((r) => r.id === selectedRoleId)?.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure granular role-based privileges and screen accessibility
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">
                  <span className="font-bold text-blue-600">{editablePermissions.length}</span> permissions selected
                </span>
                <button
                  type="button"
                  onClick={handleSaveRolePermissions}
                  disabled={savingRoleId === selectedRoleId}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  {savingRoleId === selectedRoleId ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>{isBn ? 'সংরক্ষণ করুন' : 'Save Changes'}</span>
                </button>
              </div>
            </div>

            {/* Modules Checkboxes */}
            <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2">
              {permissionCatalog.map((module) => (
                <div key={module.category} className="space-y-2.5">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-1.5">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      {isBn ? module.categoryBn : module.category}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {module.items.map((item) => {
                      const isChecked = editablePermissions.includes(item.key);
                      return (
                        <label
                          key={item.key}
                          className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition-all cursor-pointer ${
                            isChecked
                              ? 'bg-blue-50/40 border-blue-200'
                              : 'bg-white border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => togglePermission(item.key)}
                            className="mt-0.5 w-4 h-4 rounded-sm border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <div className="text-xs">
                            <span className="font-semibold text-slate-800 block">{item.label}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{item.key}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: DOCTORS & SPECIALISTS                                              */}
      {/* ========================================================================= */}
      {activeTab === 'doctors' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                {isBn ? 'ডাক্তার ও কনসালট্যান্ট তালিকা' : 'Clinical Doctors & Specialist Profiles'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                BMDC registration numbers, consultation & follow-up fees, digital signature authorizations
              </p>
            </div>
            <button
              type="button"
              onClick={openAddModal}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isBn ? 'নতুন ডাক্তার যুক্ত করুন' : 'Add Specialist'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {doctorList.map((doc) => (
              <div
                key={doc.id}
                className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-4 hover:border-blue-300 transition-all"
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 border-2 border-blue-200 flex items-center justify-center font-bold text-base shrink-0">
                      {doc.name.charAt(doc.name.startsWith('Dr.') ? 4 : 0)}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-900">{doc.name}</h4>
                      {doc.nameBn && <p className="text-xs text-slate-500 font-normal">{doc.nameBn}</p>}
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-sm border border-emerald-200 mt-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        {doc.bmdcRegNo || 'BMDC Verified'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openEditModal(doc)}
                    className="p-1 text-slate-400 hover:text-blue-600 rounded-md hover:bg-blue-50 cursor-pointer"
                    title="Edit Doctor Settings"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Details */}
                <div className="text-xs space-y-2 border-t border-slate-100 pt-3 text-slate-600">
                  <p className="flex items-center justify-between">
                    <span className="text-slate-400">Specialization:</span>
                    <span className="font-semibold text-slate-800 text-right truncate max-w-[180px]">
                      {doc.specialization || 'Consultant Dermatologist'}
                    </span>
                  </p>
                  <p className="flex items-center justify-between">
                    <span className="text-slate-400">Branch & Suite:</span>
                    <span className="font-semibold text-slate-800 text-right truncate max-w-[180px]">
                      {doc.branchName.split(' ')[0]} • {doc.roomNumber || 'Room 201'}
                    </span>
                  </p>
                  <p className="flex items-center justify-between">
                    <span className="text-slate-400">New Consultation:</span>
                    <span className="font-mono font-bold text-slate-900">৳ {doc.consultationFeeBDT || 2000}</span>
                  </p>
                  <p className="flex items-center justify-between">
                    <span className="text-slate-400">Follow-up Fee:</span>
                    <span className="font-mono font-bold text-slate-900">৳ {doc.followUpFeeBDT || 1000}</span>
                  </p>
                </div>

                {/* Digital Signature & Shift Footnote */}
                <div className="border-t border-slate-100 pt-3 flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 text-slate-600">
                    <FileSignature className="w-3.5 h-3.5 text-blue-600" />
                    <span className="text-[11px] font-medium">Digital Signature Active</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                    {doc.shift || 'morning'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: THERAPISTS & DUTY ROSTER                                           */}
      {/* ========================================================================= */}
      {activeTab === 'roster' && (
        <div className="space-y-6">
          {/* Certified Therapists Machine Credentials Summary */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Award className="w-4 h-4 text-purple-600" />
              <span>Certified Laser & Energy Device Therapists</span>
            </h3>
            <p className="text-xs text-slate-500">
              Only certified therapists with authorized machine credentials can execute energy-based skin treatments and deduct package sessions.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              {therapistList.map((th) => (
                <div key={th.id} className="p-3 rounded-lg border border-purple-100 bg-purple-50/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 font-bold text-xs flex items-center justify-center">
                        {th.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-xs text-slate-900">{th.name}</p>
                        <p className="text-[10px] text-slate-500">{th.branchName.split(' ')[0]} Center</p>
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-purple-100 text-purple-700 uppercase">
                      {th.shift || 'morning'}
                    </span>
                  </div>

                  {/* Certifications Tags */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {(th.certifications && th.certifications.length > 0
                      ? th.certifications
                      : ['HydraFacial MD Certified', 'Q-Switch Laser Specialist', 'Fractional CO2 Operator']
                    ).map((cert, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] font-semibold bg-white border border-purple-200 text-purple-800 px-2 py-0.5 rounded-md"
                      >
                        ✓ {cert}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Duty Roster Schedule */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  {isBn ? 'দৈনিক ডিউটি রোস্টার গ্রিড' : 'Daily Shift & Room Allocation Roster'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Treatment suite allocation, supervisor doctor assignments, and morning/evening shift coverage
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <input
                  type="date"
                  value={rosterDate}
                  onChange={(e) => setRosterDate(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700"
                />

                <select
                  value={rosterBranch}
                  onChange={(e) => setRosterBranch(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700"
                >
                  <option value="all">All Branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setIsRosterModalOpen(true)}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Assign Shift</span>
                </button>
              </div>
            </div>

            {/* Roster Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Staff Name</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-3">Clinic Branch</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Shift Timing</th>
                    <th className="py-2.5 px-3">Assigned Room / Suite</th>
                    <th className="py-2.5 px-3">Supervising Doctor / Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredRosters.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-400">
                        No duty roster entries found for the selected date.
                      </td>
                    </tr>
                  ) : (
                    filteredRosters.map((rst) => (
                      <tr key={rst.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 font-semibold text-slate-900">{rst.staffName}</td>
                        <td className="py-3 px-3">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase ${
                              rst.role === 'doctor'
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-purple-50 text-purple-700'
                            }`}
                          >
                            {rst.role}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-600">{rst.branchName}</td>
                        <td className="py-3 px-3 font-mono text-slate-600">{rst.date}</td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              rst.shift === 'morning'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : rst.shift === 'evening'
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                : rst.shift === 'full_day'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {rst.shift === 'morning'
                              ? 'Morning (9AM-3PM)'
                              : rst.shift === 'evening'
                              ? 'Evening (3PM-9PM)'
                              : rst.shift === 'full_day'
                              ? 'Full Day'
                              : 'Off Duty'}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-800">{rst.roomNumber || 'General Suite'}</td>
                        <td className="py-3 px-3 text-slate-600">
                          {rst.assignedDoctorName && (
                            <span className="font-semibold text-blue-700 block">
                              Supervisor: {rst.assignedDoctorName}
                            </span>
                          )}
                          <span className="text-[11px] text-slate-500">{rst.notes || '—'}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: LOGIN & SECURITY AUDIT                                             */}
      {/* ========================================================================= */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          {/* Security Governance Rules */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-600" />
              <span>Clinic Security Policies & Access Controls</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">Two-Factor Authentication</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-emerald-100 text-emerald-800">
                    ENFORCED
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Mandatory OTP verification for Doctors, Super Admin, and Accounts Executive.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">Cashier Discount Limit</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-cyan-100 text-cyan-800">
                    MAX 5%
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Discounts exceeding 5% require Manager OTP clearance or Super Admin override.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">Session Auto-Lock</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-slate-200 text-slate-800">
                    15 MINS
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Inactivity locks Doctor consultation iPad and POS terminal to prevent unauthorized record access.
                </p>
              </div>
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  {isBn ? 'নিরাপত্তা ও অ্যাকশন অডিট লগ' : 'Real-Time Security & Action Audit Trail'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Immutable log of staff logins, password resets, role overrides and data exports
                </p>
              </div>

              <span className="text-xs font-semibold text-slate-500">
                Total Logs: <span className="font-bold text-slate-900">{securityLogs.length}</span>
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Timestamp</th>
                    <th className="py-2.5 px-3">User & Role</th>
                    <th className="py-2.5 px-3">Action</th>
                    <th className="py-2.5 px-3">IP & Terminal</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-mono text-[11px]">
                  {securityLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Timestamp */}
                      <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>

                      {/* User & Role */}
                      <td className="py-3 px-3 font-sans">
                        <span className="font-semibold text-slate-900 block">{log.userName}</span>
                        <span className="text-[10px] text-slate-500 font-bold uppercase">{log.role}</span>
                      </td>

                      {/* Action */}
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-sm font-bold text-[10px] tracking-wider ${
                            log.action === 'LOGIN'
                              ? 'bg-blue-50 text-blue-700'
                              : log.action === 'ROLE_CHANGED'
                              ? 'bg-amber-50 text-amber-700'
                              : log.action === 'PASSWORD_RESET'
                              ? 'bg-purple-50 text-purple-700'
                              : log.action === 'PERMISSION_OVERRIDE'
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {log.action}
                        </span>
                      </td>

                      {/* IP & Terminal */}
                      <td className="py-3 px-3 text-slate-600">
                        <span className="font-bold text-slate-800 block">{log.ipAddress}</span>
                        <span className="text-[10px] text-slate-400 font-sans">{log.deviceInfo}</span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1 font-bold text-[10px] uppercase ${
                            log.status === 'success'
                              ? 'text-emerald-700'
                              : log.status === 'flagged'
                              ? 'text-rose-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {log.status === 'success' && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                          {log.status === 'flagged' && <AlertTriangle className="w-3 h-3 text-rose-600" />}
                          <span>{log.status}</span>
                        </span>
                      </td>

                      {/* Details */}
                      <td className="py-3 px-3 font-sans text-slate-600 max-w-[280px] truncate">
                        {log.details}
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
      {/* MODAL 1: ADD / EDIT STAFF MEMBER                                          */}
      {/* ========================================================================= */}
      {isAddStaffOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
                  {editingUser ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </div>
                <h3 className="font-bold text-base text-slate-900">
                  {editingUser ? (isBn ? 'স্টাফ প্রোফাইল এডিট' : 'Edit Staff Profile') : isBn ? 'নতুন স্টাফ নিবন্ধন' : 'Register New Staff Member'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddStaffOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveStaff} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name (English) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Dr. Sabrina Mostafa"
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Name Bangla */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Name (বাংলা)
                  </label>
                  <input
                    type="text"
                    value={formData.nameBn}
                    onChange={(e) => setFormData({ ...formData, nameBn: e.target.value })}
                    placeholder="e.g. ডাঃ সাবরিনা মোস্তফা"
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Employee ID */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isBn ? 'এমপ্লয়ি আইডি (Employee ID)' : 'Employee ID (Used for Staff Login)'}
                  </label>
                  <input
                    type="text"
                    value={formData.employeeId}
                    onChange={(e) => setFormData({ ...formData, employeeId: e.target.value.toUpperCase() })}
                    placeholder={isBn ? 'খালি রাখলে অটো তৈরি হবে (যেমন: 0015)' : 'Leave blank to auto-assign (e.g. 0015)'}
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 font-mono uppercase tracking-wider"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="staff@suoxiclinic.com"
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mobile Phone (+880) *
                  </label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+88017XXXXXXXX"
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>

                {/* Role */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Designated Clinic Role *
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 capitalize"
                  >
                    <option value="doctor">Doctor / Specialist</option>
                    <option value="therapist">Aesthetic Laser Therapist</option>
                    <option value="receptionist">Front Desk Receptionist</option>
                    <option value="cashier">Cashier & Accounts</option>
                    <option value="inventory_manager">Inventory Manager</option>
                    <option value="call_center">Call Center Agent</option>
                    <option value="admin_manager">Operations Manager</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </div>

                {/* Branch */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Base Branch Center *
                  </label>
                  <select
                    value={formData.branchId || activeBranchId || branches[0]?.id || ''}
                    onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    {branches.length === 0 ? (
                      <option value="">No branches configured</option>
                    ) : (
                      branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.code})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Conditional: If Doctor */}
              {formData.role === 'doctor' && (
                <div className="p-3.5 bg-blue-50/50 rounded-xl border border-blue-100 space-y-3">
                  <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                    <Stethoscope className="w-3.5 h-3.5" /> Doctor & Clinical Setup
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        BMDC Reg. Number
                      </label>
                      <input
                        type="text"
                        value={formData.bmdcRegNo}
                        onChange={(e) => setFormData({ ...formData, bmdcRegNo: e.target.value })}
                        placeholder="e.g. BMDC-A-70112"
                        className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Specialization & Degrees
                      </label>
                      <input
                        type="text"
                        value={formData.specialization}
                        onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                        placeholder="MBBS, DDV, Aesthetic Fellow"
                        className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        New Consultation Fee (BDT)
                      </label>
                      <input
                        type="number"
                        value={formData.consultationFeeBDT}
                        onChange={(e) => setFormData({ ...formData, consultationFeeBDT: Number(e.target.value) })}
                        className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Follow-up Fee (BDT)
                      </label>
                      <input
                        type="number"
                        value={formData.followUpFeeBDT}
                        onChange={(e) => setFormData({ ...formData, followUpFeeBDT: Number(e.target.value) })}
                        className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Conditional: If Therapist */}
              {formData.role === 'therapist' && (
                <div className="p-3.5 bg-purple-50/50 rounded-xl border border-purple-100 space-y-3">
                  <span className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Laser & Energy Device Certifications
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      'HydraFacial MD Certified',
                      'Q-Switch Laser Specialist',
                      'Fractional CO2 Operator',
                      'HIFU Ultra-lift',
                      'Morpheus8 RF Certified',
                      'Chemical Peel Specialist',
                    ].map((cert) => {
                      const isSelected = formData.certifications?.includes(cert);
                      return (
                        <label
                          key={cert}
                          className="flex items-center gap-2 p-2 bg-white rounded-md border border-purple-100 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              const curr = formData.certifications || [];
                              setFormData({
                                ...formData,
                                certifications: isSelected
                                  ? curr.filter((c) => c !== cert)
                                  : [...curr, cert],
                              });
                            }}
                            className="rounded-sm text-purple-600 focus:ring-purple-500"
                          />
                          <span className="text-[11px] font-medium text-slate-800">{cert}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Shift and Room Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Primary Duty Shift
                  </label>
                  <select
                    value={formData.shift}
                    onChange={(e) => setFormData({ ...formData, shift: e.target.value as any })}
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    <option value="morning">Morning Shift (9:00 AM - 3:00 PM)</option>
                    <option value="evening">Evening Shift (3:00 PM - 9:00 PM)</option>
                    <option value="full_day">Full Day Coverage</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Consultation Room / Laser Suite
                  </label>
                  <input
                    type="text"
                    value={formData.roomNumber}
                    onChange={(e) => setFormData({ ...formData, roomNumber: e.target.value })}
                    placeholder="e.g. Room 201 (Laser Suite A)"
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddStaffOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 text-xs font-semibold rounded-xl hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold text-xs rounded-xl shadow-xs cursor-pointer"
                >
                  {editingUser ? 'Save Updates' : 'Confirm Registration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: TEMPORARY PASSWORD ISSUED MODAL                                  */}
      {/* ========================================================================= */}
      {tempPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
              <KeyRound className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="font-bold text-base text-slate-900">Temporary Password Generated</h3>
              <p className="text-xs text-slate-500 mt-1">
                A temporary credential has been issued for <strong>{tempPasswordModal.userName}</strong>. It will expire in 24 hours.
              </p>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <span className="font-mono text-base font-bold text-slate-900 tracking-wider">
                {tempPasswordModal.tempPass}
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(tempPasswordModal.tempPass)}
                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer"
              >
                {copiedPass ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedPass ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-400 text-center">
              The user will be prompted to change their password on first login.
            </p>

            <button
              type="button"
              onClick={() => setTempPasswordModal(null)}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: SCHEDULE DUTY ROSTER                                             */}
      {/* ========================================================================= */}
      {isRosterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-cyan-600 text-white flex items-center justify-center font-bold">
                  <CalendarIcon className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-base text-slate-900">Assign Duty Shift</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsRosterModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRoster} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Select Staff Member *</label>
                <select
                  required
                  value={rosterForm.staffId}
                  onChange={(e) => {
                    const st = users.find((u) => u.id === e.target.value);
                    setRosterForm({
                      ...rosterForm,
                      staffId: e.target.value,
                      branchId: st?.branchId || rosterForm.branchId,
                    });
                  }}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="">-- Choose Doctor or Therapist --</option>
                  {users
                    .filter((u) => ['doctor', 'therapist'].includes(u.role))
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role} - {u.branchName.split(' ')[0]})
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Duty Date *</label>
                  <input
                    type="date"
                    required
                    value={rosterForm.date}
                    onChange={(e) => setRosterForm({ ...rosterForm, date: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Shift Timing *</label>
                  <select
                    value={rosterForm.shift}
                    onChange={(e) => setRosterForm({ ...rosterForm, shift: e.target.value as any })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    <option value="morning">Morning (9am - 3pm)</option>
                    <option value="evening">Evening (3pm - 9pm)</option>
                    <option value="full_day">Full Day Coverage</option>
                    <option value="off">Off Duty / Leave</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Treatment Suite / Room</label>
                <input
                  type="text"
                  value={rosterForm.roomNumber}
                  onChange={(e) => setRosterForm({ ...rosterForm, roomNumber: e.target.value })}
                  placeholder="Treatment Suite 1, Laser Room B"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Supervising Doctor</label>
                <select
                  value={rosterForm.assignedDoctorName}
                  onChange={(e) => setRosterForm({ ...rosterForm, assignedDoctorName: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="">None / Independent</option>
                  {doctorList.map((d) => (
                    <option key={d.id} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Shift Operational Notes</label>
                <input
                  type="text"
                  value={rosterForm.notes}
                  onChange={(e) => setRosterForm({ ...rosterForm, notes: e.target.value })}
                  placeholder="e.g. Assigned to HydraFacial MD & Carbon Laser cases"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsRosterModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 cursor-pointer font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-xl shadow-xs cursor-pointer"
                >
                  Confirm Shift
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
