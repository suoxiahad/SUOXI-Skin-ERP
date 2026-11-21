import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Stethoscope,
  PhoneCall,
  CreditCard,
  Package,
  Boxes,
  Users,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Lock,
  UserCheck,
  Percent,
  Apple,
  FolderTree,
  FolderPlus,
  PlusCircle,
  ListOrdered,
  FileText,
  FileCheck,
  Receipt,
  Clock,
  Tag,
  Truck,
  Sliders,
  Building2,
  BarChart3,
  LayoutDashboard,
  CheckSquare,
  TrendingUp,
  PlugZap,
  MessageSquare,
  Mail,
  Database,
  SlidersHorizontal,
  Scale,
  DollarSign,
  ClipboardList,
  LogOut,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { t } from '../../utils/translations.ts';

export const Sidebar: React.FC = () => {
  const {
    currentView,
    currentPath,
    navigate,
    language,
    currentUser,
    logout,
    setSelectedPatientId,
    setIsQuickBookOpen,
    isAddTreatmentOpen,
    isAddCategoryOpen,
    packageActiveTab,
    isAddPackageOpen,
  } = useApp();
  const isBn = language === 'bn';

  const [isCollapsed, setIsCollapsed] = useState(false);

  type MenuAccordionId = 'crm' | 'treatment' | 'package' | 'consultation' | 'billing' | 'inventory' | 'referrals' | 'integration' | 'users' | 'settings';

  const getActiveMenuFromPath = (path: string, view: string): MenuAccordionId | null => {
    if (path.startsWith('/crm') || ['appointments', 'reception-checkin', 'reception', 'call-center', 'patients'].includes(view)) {
      return 'crm';
    }
    if (path.startsWith('/treatment') || path.startsWith('/treatments') || ['treatments', 'treatment-list', 'treatment-packages', 'categories'].includes(view)) {
      return 'treatment';
    }
    if (path.startsWith('/package') || path.startsWith('/packages') || ['packages', 'sessions', 'package-catalog'].includes(view)) {
      return 'package';
    }
    if (path.startsWith('/consultation') || path.startsWith('/prescription') || path.startsWith('/rx-protocols') || ['consultation-desk', 'prescription-list', 'medical-documents', 'rx-protocols', 'doctor'].includes(view)) {
      return 'consultation';
    }
    if (path.startsWith('/billing') || path.startsWith('/invoices') || ['billing-counter', 'billing-invoices', 'billing-closing', 'billing-sales-report'].includes(view)) {
      return 'billing';
    }
    if (path.startsWith('/inventory') || ['inventory-stock', 'inventory-products', 'inventory-purchases', 'inventory-adjustments', 'inventory-suppliers'].includes(view)) {
      return 'inventory';
    }
    if (path.startsWith('/referrals') || ['referrals', 'referrals-directory', 'referrals-commissions', 'referrals-rules', 'referrals-payouts'].includes(view)) {
      return 'referrals';
    }
    if (path.startsWith('/integration') || ['integration-sms', 'integration-email'].includes(view)) {
      return 'integration';
    }
    if (path.startsWith('/users') || path.startsWith('/user') || ['users-staff', 'users-roles', 'users-doctors', 'users-roster', 'users-security'].includes(view)) {
      return 'users';
    }
    if (path.startsWith('/settings') || path.startsWith('/setting') || ['settings-general', 'settings-access-control', 'settings-security', 'settings-scheduling', 'settings-backup'].includes(view)) {
      return 'settings';
    }
    return null;
  };

  // Only the active section's menu is open initially; others remain closed
  const [openMenu, setOpenMenu] = useState<MenuAccordionId | null>(() => getActiveMenuFromPath(currentPath, currentView));

  // Sync open menu when route/view changes
  useEffect(() => {
    const detected = getActiveMenuFromPath(currentPath, currentView);
    if (detected) {
      setOpenMenu(detected);
    }
  }, [currentPath, currentView]);

  const toggleMenu = (menuId: MenuAccordionId) => {
    setOpenMenu((prev) => (prev === menuId ? null : menuId));
  };

  const dict = t[language];

  // 1. CRM Sub-items (Clean single line labels without descriptions)
  const crmSubItems = [
    {
      id: 'reception-checkin',
      path: '/crm/reception',
      label: isBn ? 'রিসেপশন চেক-ইন' : 'Reception Check-In',
      icon: UserCheck,
      roles: ['super_admin', 'admin_manager', 'receptionist', 'doctor', 'call_center', 'cashier'],
      isActive:
        currentPath === '/crm/reception' ||
        currentPath === '/reception' ||
        currentView === 'reception-checkin' ||
        currentView === 'reception',
    },
    {
      id: 'appointments',
      path: '/crm/appointments',
      label: isBn ? 'অ্যাপয়েন্টমেন্ট' : 'Appointment',
      icon: Calendar,
      roles: ['super_admin', 'admin_manager', 'receptionist', 'doctor', 'call_center', 'cashier'],
      isActive: currentPath === '/crm/appointments' || (currentView === 'appointments' && !currentPath.includes('/')),
    },
    {
      id: 'call-center',
      path: '/crm/followups',
      label: isBn ? 'ফলোআপ' : 'Lead Followup',
      icon: PhoneCall,
      roles: ['super_admin', 'call_center', 'receptionist', 'admin_manager'],
      isActive: currentPath === '/crm/followups' || currentView === 'call-center',
    },
    {
      id: 'patients',
      path: '/crm/patients',
      label: isBn ? 'পেশেন্ট ডিরেক্টরি' : 'Patient Directory',
      icon: Users,
      roles: ['super_admin', 'admin_manager', 'receptionist', 'doctor', 'call_center', 'cashier'],
      isActive: currentPath === '/crm/patients' || currentView === 'patients',
    },
  ];

  // 2. Treatment Sub-items
  const treatmentSubItems = [
    {
      id: 'treatment-list',
      path: '/treatments',
      label: isBn ? 'ট্রিটমেন্ট লিস্ট' : 'Treatment List',
      icon: ListOrdered,
      action: () => navigate('/treatments'),
      isActive:
        (currentPath === '/treatments' || currentPath === '/treatment/list' || currentPath === '/treatment') &&
        !isAddTreatmentOpen &&
        !isAddCategoryOpen,
    },
    {
      id: 'add-treatment',
      path: '/treatments/new',
      label: isBn ? 'নতুন ট্রিটমেন্ট' : 'Add Treatment',
      icon: PlusCircle,
      action: () => navigate('/treatments/new'),
      isActive:
        currentPath === '/treatments/new' ||
        currentPath === '/treatment/add-new' ||
        currentPath === '/treatments/add-new' ||
        isAddTreatmentOpen,
    },
    {
      id: 'add-category',
      path: '/treatments/categories',
      label: isBn ? 'ক্যাটাগরি যুক্ত করুন' : 'Add Category',
      icon: FolderPlus,
      action: () => navigate('/treatments/categories'),
      isActive:
        currentPath === '/treatments/categories' ||
        currentPath === '/treatment/category' ||
        currentPath === '/treatments/category' ||
        isAddCategoryOpen,
    },
  ];

  // 3. Package Sub-items
  const packageSubItems = [
    {
      id: 'package-list',
      path: '/packages',
      label: isBn ? 'প্যাকেজ লিস্ট' : 'Package List',
      icon: ListOrdered,
      action: () => navigate('/packages'),
      isActive:
        (currentPath === '/packages' ||
          currentPath === '/packages/list' ||
          currentPath === '/package/list' ||
          currentPath === '/package') &&
        packageActiveTab === 'list' &&
        !isAddPackageOpen,
    },
    {
      id: 'patient-sessions',
      path: '/packages/sessions',
      label: isBn ? 'পেশেন্ট সেশনস' : 'Patient Sessions',
      icon: Package,
      action: () => navigate('/packages/sessions'),
      isActive:
        (currentPath === '/packages/sessions' || currentPath === '/package/sessions') &&
        packageActiveTab === 'sessions' &&
        !isAddPackageOpen,
    },
    {
      id: 'add-package',
      path: '/packages/new',
      label: isBn ? 'নতুন প্যাকেজ তৈরি' : 'Add Package',
      icon: PlusCircle,
      action: () => navigate('/packages/new'),
      isActive:
        currentPath === '/packages/new' ||
        currentPath === '/packages/add-new' ||
        currentPath === '/package/add-new' ||
        isAddPackageOpen ||
        packageActiveTab === 'create',
    },
  ];

  // 4. Consultation Sub-items (Renamed from Consultation & Records to Consultation)
  const consultationSubItems = [
    {
      id: 'consultation-desk',
      path: '/consultation/desk',
      label: isBn ? 'কনসালটেশন' : 'Consultation Desk',
      icon: Stethoscope,
      action: () => navigate('/consultation/desk'),
      isActive:
        currentPath === '/consultation/desk' ||
        currentPath === '/consultation' ||
        currentPath === '/doctor' ||
        currentView === 'consultation-desk' ||
        currentView === 'doctor',
    },
    {
      id: 'prescription-list',
      path: '/consultation/prescriptions',
      label: isBn ? 'প্রেসক্রিপশন লিস্ট' : 'Prescription List',
      icon: FileText,
      action: () => navigate('/consultation/prescriptions'),
      isActive:
        currentPath === '/consultation/prescriptions' ||
        currentPath === '/prescriptions' ||
        currentPath === '/prescription-list' ||
        currentView === 'prescription-list' ||
        currentView === 'prescriptions',
    },
    {
      id: 'medical-documents',
      path: '/consultation/documents',
      label: isBn ? 'মেডিক্যাল ডকুমেন্টস' : 'Medical Documents',
      icon: FileCheck,
      action: () => navigate('/consultation/documents'),
      isActive:
        currentPath === '/consultation/documents' ||
        currentPath === '/consultation/attachments' ||
        currentPath === '/medical-documents' ||
        currentPath === '/medical-records' ||
        currentView === 'medical-documents',
    },
    {
      id: 'rx-protocols',
      path: '/consultation/protocols',
      label: isBn ? 'Rx প্রোটোকল' : 'Rx Protocols',
      icon: ClipboardList,
      action: () => navigate('/consultation/protocols'),
      isActive:
        currentPath === '/consultation/protocols' ||
        currentPath === '/rx-protocols' ||
        currentView === 'rx-protocols',
    },
  ];

  // 5. Billing & Cashier Sub-items
  const billingSubItems = [
    {
      id: 'billing-counter',
      path: '/billing/counter',
      label: isBn ? 'পিওএস বিলিং কাউন্টার' : 'POS Billing Counter',
      icon: CreditCard,
      roles: ['super_admin', 'cashier', 'admin_manager'],
      action: () => navigate('/billing/counter'),
      isActive:
        currentPath === '/billing/counter' ||
        currentPath === '/billing' ||
        currentView === 'billing-counter',
    },
    {
      id: 'billing-invoices',
      path: '/billing/invoices',
      label: isBn ? 'ইনভয়েস ও রসিদ' : 'Invoices & Receipts',
      icon: Receipt,
      roles: ['super_admin', 'cashier', 'admin_manager'],
      action: () => navigate('/billing/invoices'),
      isActive:
        currentPath === '/billing/invoices' ||
        currentPath === '/invoices' ||
        currentView === 'billing-invoices' ||
        currentView === 'invoices',
    },
    {
      id: 'billing-closing',
      path: '/billing/closing',
      label: isBn ? 'দৈনিক শিফট ক্লোজিং' : 'Daily Shift Closing',
      icon: Clock,
      roles: ['super_admin', 'cashier', 'admin_manager'],
      action: () => navigate('/billing/closing'),
      isActive:
        currentPath === '/billing/closing' ||
        currentPath === '/closing' ||
        currentView === 'billing-closing',
    },
    {
      id: 'billing-sales-report',
      path: '/billing/sales-report',
      label: isBn ? 'সেলস রিপোর্ট' : 'Sales Report',
      icon: BarChart3,
      roles: ['super_admin', 'cashier', 'admin_manager'],
      action: () => navigate('/billing/sales-report'),
      isActive:
        currentPath === '/billing/sales-report' ||
        currentPath === '/billing/sales' ||
        currentPath === '/sales-report' ||
        currentView === 'billing-sales-report',
    },
  ];

  // 6. Inventory & Stock Sub-items
  const inventorySubItems = [
    {
      id: 'inventory-stock',
      path: '/inventory/stock',
      label: 'Stock Report',
      icon: Boxes,
      roles: ['super_admin', 'inventory_manager', 'admin_manager', 'cashier', 'doctor'],
      action: () => navigate('/inventory/stock'),
      isActive:
        currentPath === '/inventory/stock' ||
        currentPath === '/inventory' ||
        currentView === 'inventory-stock' ||
        currentView === 'inventory',
    },
    {
      id: 'inventory-products',
      path: '/inventory/products',
      label: isBn ? 'প্রডাক্ট ক্যাটালগ' : 'Product Catalog',
      icon: Tag,
      roles: ['super_admin', 'inventory_manager', 'admin_manager'],
      action: () => navigate('/inventory/products'),
      isActive:
        currentPath === '/inventory/products' ||
        currentPath === '/inventory/catalog' ||
        currentView === 'inventory-products',
    },
    {
      id: 'inventory-purchases',
      path: '/inventory/purchases',
      label: isBn ? 'পারচেজ রিপোর্ট' : 'Purchase Report',
      icon: Truck,
      roles: ['super_admin', 'inventory_manager', 'admin_manager'],
      action: () => navigate('/inventory/purchases'),
      isActive:
        currentPath === '/inventory/purchases' ||
        currentPath === '/inventory/po' ||
        currentPath === '/inventory/grn' ||
        currentView === 'inventory-purchases',
    },
    {
      id: 'inventory-adjustments',
      path: '/inventory/adjustments',
      label: isBn ? 'মুভমেন্ট ও অডিট' : 'Stock Movements',
      icon: Sliders,
      roles: ['super_admin', 'inventory_manager', 'admin_manager'],
      action: () => navigate('/inventory/adjustments'),
      isActive:
        currentPath === '/inventory/adjustments' ||
        currentPath === '/inventory/logs' ||
        currentView === 'inventory-adjustments',
    },
    {
      id: 'inventory-suppliers',
      path: '/inventory/suppliers',
      label: isBn ? 'সাপ্লায়ার ও ভেন্ডর' : 'Suppliers & Vendors',
      icon: Building2,
      roles: ['super_admin', 'inventory_manager', 'admin_manager'],
      action: () => navigate('/inventory/suppliers'),
      isActive:
        currentPath === '/inventory/suppliers' ||
        currentPath === '/inventory/vendors' ||
        currentView === 'inventory-suppliers',
    },
  ];

  // 7. Referrals & Commissions Sub-items (Clean single line labels without descriptions)
  const referralSubItems = [
    {
      id: 'referrals-directory',
      path: '/referrals/directory',
      label: isBn ? 'রেফারার ডিরেক্টরি' : 'Referrers Directory',
      icon: Users,
      roles: ['super_admin', 'admin_manager', 'cashier'],
      action: () => navigate('/referrals/directory'),
      isActive:
        currentPath === '/referrals/directory' ||
        currentPath === '/referrals' ||
        currentView === 'referrals-directory' ||
        (currentView === 'referrals' &&
          !['/referrals/commissions', '/referrals/rules', '/referrals/payouts'].includes(currentPath)),
    },
    {
      id: 'referrals-commissions',
      path: '/referrals/commissions',
      label: isBn ? 'কমিশন লেজার' : 'Commissions Ledger',
      icon: DollarSign,
      roles: ['super_admin', 'admin_manager', 'cashier'],
      action: () => navigate('/referrals/commissions'),
      isActive:
        currentPath === '/referrals/commissions' ||
        currentPath === '/referrals/ledger' ||
        currentView === 'referrals-commissions',
    },
    {
      id: 'referrals-rules',
      path: '/referrals/rules',
      label: isBn ? 'কমিশন রুলস' : 'Commission Rules',
      icon: Scale,
      roles: ['super_admin', 'admin_manager'],
      action: () => navigate('/referrals/rules'),
      isActive:
        currentPath === '/referrals/rules' ||
        currentView === 'referrals-rules',
    },
    {
      id: 'referrals-payouts',
      path: '/referrals/payouts',
      label: isBn ? 'পে-আউট ও সেটেলমেন্ট' : 'Payouts & Settlement',
      icon: CheckSquare,
      roles: ['super_admin', 'admin_manager', 'cashier'],
      action: () => navigate('/referrals/payouts'),
      isActive:
        currentPath === '/referrals/payouts' ||
        currentPath === '/referrals/settlements' ||
        currentView === 'referrals-payouts',
    },
  ];

  // 7. Integration Sub-items (Clean single line labels without descriptions)
  const integrationSubItems = [
    {
      id: 'integration-sms',
      path: '/integration/sms',
      label: isBn ? 'এসএমএস গেটওয়ে' : 'SMS Gateway',
      icon: MessageSquare,
      roles: ['super_admin', 'admin_manager', 'doctor', 'receptionist', 'call_center', 'cashier'],
      action: () => navigate('/integration/sms'),
      isActive:
        currentPath === '/integration/sms' ||
        currentPath === '/integration' ||
        currentView === 'integration-sms',
    },
    {
      id: 'integration-email',
      path: '/integration/email',
      label: isBn ? 'ইমেইল গেটওয়ে' : 'Email Gateway',
      icon: Mail,
      roles: ['super_admin', 'admin_manager', 'doctor', 'receptionist', 'call_center', 'cashier'],
      action: () => navigate('/integration/email'),
      isActive:
        currentPath === '/integration/email' ||
        currentView === 'integration-email',
    },
  ];

  // 8. User Management Sub-items (Clean single line labels without descriptions)
  const userSubItems = [
    {
      id: 'users-staff',
      path: '/users/staff',
      label: isBn ? 'স্টাফ ডিরেক্টরি' : 'Staff Directory',
      icon: Users,
      roles: ['super_admin', 'admin_manager'],
      action: () => navigate('/users/staff'),
      isActive:
        currentPath === '/users/staff' ||
        currentPath === '/users' ||
        currentPath === '/user' ||
        currentPath === '/users/directory' ||
        currentView === 'users-staff',
    },
    {
      id: 'users-roles',
      path: '/users/roles',
      label: isBn ? 'রোলস ও পারমিশন' : 'Roles & Permissions',
      icon: ShieldCheck,
      roles: ['super_admin', 'admin_manager'],
      action: () => navigate('/users/roles'),
      isActive:
        currentPath === '/users/roles' ||
        currentPath === '/users/permissions' ||
        currentView === 'users-roles',
    },
    {
      id: 'users-doctors',
      path: '/users/doctors',
      label: isBn ? 'ডাক্তার ও বিশেষজ্ঞ' : 'Doctors & Specialists',
      icon: Stethoscope,
      roles: ['super_admin', 'admin_manager', 'doctor'],
      action: () => navigate('/users/doctors'),
      isActive:
        currentPath === '/users/doctors' ||
        currentPath === '/users/specialists' ||
        currentView === 'users-doctors',
    },
    {
      id: 'users-roster',
      path: '/users/roster',
      label: isBn ? 'থেরাপিস্ট ও ডিউটি রোস্টার' : 'Therapists & Duty Roster',
      icon: Sparkles,
      roles: ['super_admin', 'admin_manager', 'doctor', 'therapist'],
      action: () => navigate('/users/roster'),
      isActive:
        currentPath === '/users/roster' ||
        currentPath === '/users/rosters' ||
        currentPath === '/users/therapists' ||
        currentView === 'users-roster',
    },
    {
      id: 'users-security',
      path: '/users/security',
      label: isBn ? 'লগইন ও সিকিউরিটি অডিট' : 'Login & Security Audit',
      icon: Lock,
      roles: ['super_admin', 'admin_manager'],
      action: () => navigate('/users/security'),
      isActive:
        currentPath === '/users/security' ||
        currentPath === '/users/audit' ||
        currentPath === '/users/logs' ||
        currentView === 'users-security',
    },
  ];

  // 9. Security & System Settings Sub-items (Clean single line labels without descriptions)
  const settingsSubItems = [
    {
      id: 'settings-general',
      path: '/settings/general',
      label: isBn ? 'জেনারেল ও ব্রাঞ্চ সেটআপ' : 'General & Branch Setup',
      icon: Building2,
      roles: ['super_admin', 'admin_manager'],
      action: () => navigate('/settings/general'),
      isActive:
        currentPath === '/settings/general' ||
        currentPath === '/settings' ||
        currentPath === '/setting' ||
        currentPath === '/settings/branches' ||
        currentView === 'settings-general',
    },
    {
      id: 'settings-access-control',
      path: '/settings/access-control',
      label: isBn ? 'অ্যাক্সেস কন্ট্রোল ও আরব্যাক' : 'Access Control & RBAC',
      icon: ShieldCheck,
      roles: ['super_admin', 'admin_manager'],
      action: () => navigate('/settings/access-control'),
      isActive:
        currentPath === '/settings/access-control' ||
        currentPath === '/settings/rbac' ||
        currentPath === '/settings/permissions' ||
        currentView === 'settings-access-control',
    },
    {
      id: 'settings-security',
      path: '/settings/security',
      label: isBn ? 'অথেনটিকেশন ও সিকিউরিটি' : 'Authentication & Security',
      icon: Lock,
      roles: ['super_admin', 'admin_manager'],
      action: () => navigate('/settings/security'),
      isActive:
        currentPath === '/settings/security' ||
        currentPath === '/settings/auth' ||
        currentPath === '/settings/sessions' ||
        currentView === 'settings-security',
    },
    {
      id: 'settings-scheduling',
      path: '/settings/scheduling',
      label: isBn ? 'বুকিং ও ক্লিনিক্যাল রুলস' : 'Booking & Clinical Rules',
      icon: Clock,
      roles: ['super_admin', 'admin_manager', 'doctor'],
      action: () => navigate('/settings/scheduling'),
      isActive:
        currentPath === '/settings/scheduling' ||
        currentPath === '/settings/slots' ||
        currentPath === '/settings/timing' ||
        currentView === 'settings-scheduling',
    },
    {
      id: 'settings-backup',
      path: '/settings/backup',
      label: isBn ? 'ব্যাকআপ ও সিস্টেম অডিট' : 'Backup & System Audit',
      icon: Database,
      roles: ['super_admin', 'admin_manager'],
      action: () => navigate('/settings/backup'),
      isActive:
        currentPath === '/settings/backup' ||
        currentPath === '/settings/backups' ||
        currentPath === '/settings/recovery' ||
        currentView === 'settings-backup',
    },
  ];

  // Patient Portal & External View Items
  const otherItems = [
    {
      id: 'portal',
      path: '/portal',
      label: dict.patientPortal,
      icon: UserCheck,
      badgeColor: 'bg-cyan-50 text-cyan-600',
      roles: ['super_admin', 'patient', 'doctor', 'receptionist'],
      highlight: true,
    },
  ];

  const currentRole = currentUser?.role || 'doctor';
  const isDashboardActive =
    currentPath === '/dashboard' ||
    currentPath === '/' ||
    currentView === 'dashboard';

  return (
    <aside
      className={`relative z-20 flex flex-col h-screen transition-all duration-300 border-r border-slate-200/80 bg-white shadow-xs ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#0DA54F] to-emerald-400 flex items-center justify-center text-white shadow-xs shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col truncate">
              <span className="font-extrabold text-base tracking-tight text-slate-900 leading-none">
                SUOXI
              </span>
              <span className="text-[10px] uppercase font-bold text-[#0DA54F] tracking-wider mt-1 truncate">
                Aesthetic & Skin CRM
              </span>
              <span className="text-[10px] text-slate-400 truncate">Dhaka, Bangladesh</span>
            </div>
          )}
        </div>

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Quick Action Button */}
      <div className="p-3 pb-2">
        <button
          onClick={() => setIsQuickBookOpen(true)}
          className={`w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#0DA54F] to-[#0a8740] hover:from-[#0a8740] hover:to-[#086f34] text-white font-semibold text-xs shadow-xs flex items-center justify-center gap-2 transition-all duration-150 cursor-pointer ${
            isCollapsed ? 'px-0' : ''
          }`}
          title="Quick Book Appointment"
        >
          <Calendar className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span className="truncate">{dict.quickBook}</span>}
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-1.5 space-y-2">
        {/* Section Header */}
        {!isCollapsed && (
          <div className="px-2 pt-1 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>{isBn ? 'মেনু' : 'Menu'}</span>
          </div>
        )}

        {/* ==================================================== */}
        {/* 0. DASHBOARD MAIN MENU (SmartDesk Styled Top Item)   */}
        {/* ==================================================== */}
        <div className="space-y-0.5">
          {!isCollapsed ? (
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className={`w-full flex items-center justify-between p-1.5 rounded-xl transition-all cursor-pointer select-none group ${
                isDashboardActive
                  ? 'bg-indigo-50 text-indigo-900 font-bold shadow-2xs'
                  : 'hover:bg-slate-100/70 text-slate-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-xs shrink-0 group-hover:scale-105 transition-transform ${
                    isDashboardActive
                      ? 'bg-gradient-to-tr from-indigo-600 via-indigo-700 to-purple-600'
                      : 'bg-gradient-to-tr from-indigo-500 to-purple-400'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4 text-white" />
                </div>
                <span className="text-slate-800 font-semibold text-xs tracking-tight group-hover:text-slate-900">
                  {isBn ? 'ড্যাশবোর্ড' : 'Dashboard'}
                </span>
              </div>
              {isDashboardActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 mr-2" />
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="w-full flex justify-center py-1.5"
              title="Dashboard"
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-xs ${
                  isDashboardActive
                    ? 'bg-gradient-to-tr from-indigo-600 to-purple-600'
                    : 'bg-gradient-to-tr from-indigo-500 to-purple-400'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
              </div>
            </button>
          )}
        </div>

        {/* ==================================================== */}
        {/* 1. CRM MAIN MENU (Title Case with Blue Badge)        */}
        {/* ==================================================== */}
        <div className="space-y-0.5">
          {!isCollapsed ? (
            <button
              type="button"
              onClick={() => toggleMenu('crm')}
              className="w-full flex items-center justify-between p-1.5 rounded-xl hover:bg-slate-100/70 transition-colors cursor-pointer select-none group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-sky-400 flex items-center justify-center text-white shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                  <Users className="w-4 h-4 text-white" />
                </div>
                <span className="text-slate-800 font-semibold text-xs tracking-tight group-hover:text-slate-900">
                  {isBn ? 'সিআরএম' : 'CRM'}
                </span>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-transform duration-200 ${
                  openMenu === 'crm' ? 'rotate-0' : '-rotate-90'
                }`}
              />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/crm/appointments')}
              className="w-full flex justify-center py-1.5"
              title="CRM"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-sky-400 flex items-center justify-center text-white shadow-xs">
                <Users className="w-4 h-4" />
              </div>
            </button>
          )}

          {/* CRM SUB-MENUS WITH INSPIRATION TREE CONNECTOR LINE */}
          {(openMenu === 'crm' || isCollapsed) && (
            <div className={`${!isCollapsed ? 'ml-5 pl-3 border-l-2 border-blue-200/80 my-1 space-y-0.5' : 'space-y-1'}`}>
              {crmSubItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.isActive;
                const isAllowed = item.roles.includes(currentRole);

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (item.id === 'patients') {
                        setSelectedPatientId(null);
                      }
                      navigate(item.path);
                    }}
                    disabled={!isAllowed}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      isActive
                        ? 'bg-blue-50 text-blue-700 font-bold'
                        : isAllowed
                        ? 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                        : 'text-slate-300 cursor-not-allowed opacity-60'
                    }`}
                    title={item.label}
                  >
                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>

                    {!isCollapsed && (
                      <span className="truncate text-left text-xs">{item.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ==================================================== */}
        {/* 2. TREATMENT (Title Case with Rose/Pink Badge)        */}
        {/* ==================================================== */}
        <div className="space-y-0.5">
          {!isCollapsed ? (
            <button
              type="button"
              onClick={() => toggleMenu('treatment')}
              className="w-full flex items-center justify-between p-1.5 rounded-xl hover:bg-slate-100/70 transition-colors cursor-pointer select-none group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-pink-500 to-rose-400 flex items-center justify-center text-white shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <span className="text-slate-800 font-semibold text-xs tracking-tight group-hover:text-slate-900">
                  {isBn ? 'ট্রিটমেন্ট' : 'Treatment'}
                </span>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-transform duration-200 ${
                  openMenu === 'treatment' ? 'rotate-0' : '-rotate-90'
                }`}
              />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/treatments')}
              className="w-full flex justify-center py-1.5"
              title="Treatment"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-pink-500 to-rose-400 flex items-center justify-center text-white shadow-xs">
                <Sparkles className="w-4 h-4" />
              </div>
            </button>
          )}

          {/* TREATMENT SUB-MENUS WITH TREE CONNECTOR */}
          {(openMenu === 'treatment' || isCollapsed) && (
            <div className={`${!isCollapsed ? 'ml-5 pl-3 border-l-2 border-pink-200/80 my-1 space-y-0.5' : 'space-y-1'}`}>
              {treatmentSubItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.isActive;

                return (
                  <button
                    key={item.id}
                    onClick={item.action}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      isActive
                        ? 'bg-rose-50 text-rose-700 font-bold'
                        : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                    }`}
                    title={item.label}
                  >
                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                        isActive
                          ? 'bg-rose-500 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>

                    {!isCollapsed && (
                      <span className="truncate text-left text-xs">{item.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ==================================================== */}
        {/* 3. PACKAGE (Title Case with Purple Badge)            */}
        {/* ==================================================== */}
        <div className="space-y-0.5">
          {!isCollapsed ? (
            <button
              type="button"
              onClick={() => toggleMenu('package')}
              className="w-full flex items-center justify-between p-1.5 rounded-xl hover:bg-slate-100/70 transition-colors cursor-pointer select-none group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-400 flex items-center justify-center text-white shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                  <Package className="w-4 h-4 text-white" />
                </div>
                <span className="text-slate-800 font-semibold text-xs tracking-tight group-hover:text-slate-900">
                  {isBn ? 'প্যাকেজ' : 'Package'}
                </span>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-transform duration-200 ${
                  openMenu === 'package' ? 'rotate-0' : '-rotate-90'
                }`}
              />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/packages')}
              className="w-full flex justify-center py-1.5"
              title="Package"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-400 flex items-center justify-center text-white shadow-xs">
                <Package className="w-4 h-4" />
              </div>
            </button>
          )}

          {/* PACKAGE SUB-MENUS WITH TREE CONNECTOR */}
          {(openMenu === 'package' || isCollapsed) && (
            <div className={`${!isCollapsed ? 'ml-5 pl-3 border-l-2 border-purple-200/80 my-1 space-y-0.5' : 'space-y-1'}`}>
              {packageSubItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.isActive;

                return (
                  <button
                    key={item.id}
                    onClick={item.action}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      isActive
                        ? 'bg-purple-50 text-purple-700 font-bold'
                        : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                    }`}
                    title={item.label}
                  >
                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                        isActive
                          ? 'bg-purple-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>

                    {!isCollapsed && (
                      <span className="truncate text-left text-xs">{item.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ==================================================== */}
        {/* 4. CONSULTATION (Renamed from Consultation & Records)*/}
        {/* ==================================================== */}
        <div className="space-y-0.5">
          {!isCollapsed ? (
            <button
              type="button"
              onClick={() => toggleMenu('consultation')}
              className="w-full flex items-center justify-between p-1.5 rounded-xl hover:bg-slate-100/70 transition-colors cursor-pointer select-none group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-teal-500 to-cyan-400 flex items-center justify-center text-white shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                  <Stethoscope className="w-4 h-4 text-white" />
                </div>
                <span className="text-slate-800 font-semibold text-xs tracking-tight group-hover:text-slate-900">
                  {isBn ? 'কনসালটেশন' : 'Consultation'}
                </span>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-transform duration-200 ${
                  openMenu === 'consultation' ? 'rotate-0' : '-rotate-90'
                }`}
              />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/consultation/desk')}
              className="w-full flex justify-center py-1.5"
              title="Consultation"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-teal-500 to-cyan-400 flex items-center justify-center text-white shadow-xs">
                <Stethoscope className="w-4 h-4" />
              </div>
            </button>
          )}

          {/* CONSULTATION SUB-MENUS WITH TREE CONNECTOR */}
          {(openMenu === 'consultation' || isCollapsed) && (
            <div className={`${!isCollapsed ? 'ml-5 pl-3 border-l-2 border-teal-200/80 my-1 space-y-0.5' : 'space-y-1'}`}>
              {consultationSubItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.isActive;

                return (
                  <button
                    key={item.id}
                    onClick={item.action}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      isActive
                        ? 'bg-teal-50 text-teal-800 font-bold'
                        : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                    }`}
                    title={item.label}
                  >
                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                        isActive
                          ? 'bg-teal-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>

                    {!isCollapsed && (
                      <span className="truncate text-left text-xs">{item.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ==================================================== */}
        {/* 5. BILLING & CASHIER (Title Case with Emerald Badge) */}
        {/* ==================================================== */}
        <div className="space-y-0.5">
          {!isCollapsed ? (
            <button
              type="button"
              onClick={() => toggleMenu('billing')}
              className="w-full flex items-center justify-between p-1.5 rounded-xl hover:bg-slate-100/70 transition-colors cursor-pointer select-none group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                  <Receipt className="w-4 h-4 text-white" />
                </div>
                <span className="text-slate-800 font-semibold text-xs tracking-tight group-hover:text-slate-900">
                  {isBn ? 'বিলিং ও ক্যাশিয়ার' : 'Billing & Cashier'}
                </span>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-transform duration-200 ${
                  openMenu === 'billing' ? 'rotate-0' : '-rotate-90'
                }`}
              />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/billing/counter')}
              className="w-full flex justify-center py-1.5"
              title="Billing & Cashier"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white shadow-xs">
                <Receipt className="w-4 h-4" />
              </div>
            </button>
          )}

          {/* BILLING SUB-MENUS WITH TREE CONNECTOR */}
          {(openMenu === 'billing' || isCollapsed) && (
            <div className={`${!isCollapsed ? 'ml-5 pl-3 border-l-2 border-emerald-200/80 my-1 space-y-0.5' : 'space-y-1'}`}>
              {billingSubItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.isActive;
                const isAllowed = item.roles.includes(currentRole);

                return (
                  <button
                    key={item.id}
                    onClick={item.action}
                    disabled={!isAllowed}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      isActive
                        ? 'bg-emerald-50 text-[#0DA54F] font-bold'
                        : isAllowed
                        ? 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                        : 'text-slate-300 cursor-not-allowed opacity-60'
                    }`}
                    title={item.label}
                  >
                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                        isActive
                          ? 'bg-[#0DA54F] text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>

                    {!isCollapsed && (
                      <span className="truncate text-left text-xs">{item.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ==================================================== */}
        {/* 6. INVENTORY & STOCK (Title Case with Orange Badge)  */}
        {/* ==================================================== */}
        <div className="space-y-0.5">
          {!isCollapsed ? (
            <button
              type="button"
              onClick={() => toggleMenu('inventory')}
              className="w-full flex items-center justify-between p-1.5 rounded-xl hover:bg-slate-100/70 transition-colors cursor-pointer select-none group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-400 flex items-center justify-center text-white shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                  <Boxes className="w-4 h-4 text-white" />
                </div>
                <span className="text-slate-800 font-semibold text-xs tracking-tight group-hover:text-slate-900">
                  {isBn ? 'ইনভেন্টরি ও স্টক' : 'Inventory & Stock'}
                </span>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-transform duration-200 ${
                  openMenu === 'inventory' ? 'rotate-0' : '-rotate-90'
                }`}
              />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/inventory/stock')}
              className="w-full flex justify-center py-1.5"
              title="Inventory & Stock"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-400 flex items-center justify-center text-white shadow-xs">
                <Boxes className="w-4 h-4" />
              </div>
            </button>
          )}

          {/* INVENTORY SUB-MENUS WITH TREE CONNECTOR */}
          {(openMenu === 'inventory' || isCollapsed) && (
            <div className={`${!isCollapsed ? 'ml-5 pl-3 border-l-2 border-amber-200/80 my-1 space-y-0.5' : 'space-y-1'}`}>
              {inventorySubItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.isActive;
                const isAllowed = item.roles.includes(currentRole);

                return (
                  <button
                    key={item.id}
                    onClick={item.action}
                    disabled={!isAllowed}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      isActive
                        ? 'bg-amber-50 text-amber-800 font-bold'
                        : isAllowed
                        ? 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                        : 'text-slate-300 cursor-not-allowed opacity-60'
                    }`}
                    title={item.label}
                  >
                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                        isActive
                          ? 'bg-amber-500 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>

                    {!isCollapsed && (
                      <span className="truncate text-left text-xs">{item.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ==================================================== */}
        {/* 7. REFERRALS & COMMISSIONS (Emerald/Teal Badge)      */}
        {/* ==================================================== */}
        <div className="space-y-0.5">
          {!isCollapsed ? (
            <button
              type="button"
              onClick={() => toggleMenu('referrals')}
              className="w-full flex items-center justify-between p-1.5 rounded-xl hover:bg-slate-100/70 transition-colors cursor-pointer select-none group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                  <Percent className="w-4 h-4 text-white" />
                </div>
                <span className="text-slate-800 font-semibold text-xs tracking-tight group-hover:text-slate-900">
                  {isBn ? 'রেফারেল ও কমিশন' : 'Referrals & Commissions'}
                </span>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-transform duration-200 ${
                  openMenu === 'referrals' ? 'rotate-0' : '-rotate-90'
                }`}
              />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/referrals/directory')}
              className="w-full flex justify-center py-1.5"
              title={isBn ? 'রেফারেল ও কমিশন' : 'Referrals & Commissions'}
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-xs">
                <Percent className="w-4 h-4" />
              </div>
            </button>
          )}

          {/* REFERRALS SUB-MENUS WITH TREE CONNECTOR */}
          {(openMenu === 'referrals' || isCollapsed) && (
            <div className={`${!isCollapsed ? 'ml-5 pl-3 border-l-2 border-emerald-200/80 my-1 space-y-0.5' : 'space-y-1'}`}>
              {referralSubItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.isActive;
                const isAllowed = item.roles.includes(currentRole);

                return (
                  <button
                    key={item.id}
                    onClick={item.action}
                    disabled={!isAllowed}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      isActive
                        ? 'bg-emerald-50 text-[#0DA54F] font-bold'
                        : isAllowed
                        ? 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                        : 'text-slate-300 cursor-not-allowed opacity-60'
                    }`}
                    title={item.label}
                  >
                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                        isActive
                          ? 'bg-[#0DA54F] text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>

                    {!isCollapsed && (
                      <span className="truncate text-left text-xs">{item.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ==================================================== */}
        {/* 8. INTEGRATION (Title Case with Indigo/Violet Badge) */}
        {/* ==================================================== */}
        <div className="space-y-0.5">
          {!isCollapsed ? (
            <button
              type="button"
              onClick={() => toggleMenu('integration')}
              className="w-full flex items-center justify-between p-1.5 rounded-xl hover:bg-slate-100/70 transition-colors cursor-pointer select-none group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                  <PlugZap className="w-4 h-4 text-white" />
                </div>
                <span className="text-slate-800 font-semibold text-xs tracking-tight group-hover:text-slate-900">
                  {isBn ? 'ইন্টিগ্রেশন' : 'Integration'}
                </span>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-transform duration-200 ${
                  openMenu === 'integration' ? 'rotate-0' : '-rotate-90'
                }`}
              />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/integration/sms')}
              className="w-full flex justify-center py-1.5"
              title="Integration"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-xs">
                <PlugZap className="w-4 h-4" />
              </div>
            </button>
          )}

          {/* INTEGRATION SUB-MENUS WITH TREE CONNECTOR */}
          {(openMenu === 'integration' || isCollapsed) && (
            <div className={`${!isCollapsed ? 'ml-5 pl-3 border-l-2 border-indigo-200/80 my-1 space-y-0.5' : 'space-y-1'}`}>
              {integrationSubItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.isActive;
                const isAllowed = item.roles.includes(currentRole);

                return (
                  <button
                    key={item.id}
                    onClick={item.action}
                    disabled={!isAllowed}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-700 font-bold'
                        : isAllowed
                        ? 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                        : 'text-slate-300 cursor-not-allowed opacity-60'
                    }`}
                    title={item.label}
                  >
                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>

                    {!isCollapsed && (
                      <span className="truncate text-left text-xs">{item.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ==================================================== */}
        {/* 8. USER MANAGEMENT (Title Case with Blue/Cyan Badge) */}
        {/* ==================================================== */}
        <div className="space-y-0.5">
          {!isCollapsed ? (
            <button
              type="button"
              onClick={() => toggleMenu('users')}
              className="w-full flex items-center justify-between p-1.5 rounded-xl hover:bg-slate-100/70 transition-colors cursor-pointer select-none group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                  <Users className="w-4 h-4 text-white" />
                </div>
                <span className="text-slate-800 font-semibold text-xs tracking-tight group-hover:text-slate-900">
                  {isBn ? 'ইউজার ম্যানেজমেন্ট' : 'User Management'}
                </span>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-transform duration-200 ${
                  openMenu === 'users' ? 'rotate-0' : '-rotate-90'
                }`}
              />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/users/staff')}
              className="w-full flex justify-center py-1.5"
              title="User Management"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-xs">
                <Users className="w-4 h-4" />
              </div>
            </button>
          )}

          {/* USER MANAGEMENT SUB-MENUS WITH TREE CONNECTOR */}
          {(openMenu === 'users' || isCollapsed) && (
            <div className={`${!isCollapsed ? 'ml-5 pl-3 border-l-2 border-cyan-200/80 my-1 space-y-0.5' : 'space-y-1'}`}>
              {userSubItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.isActive;
                const isAllowed = item.roles.includes(currentRole);

                return (
                  <button
                    key={item.id}
                    onClick={item.action}
                    disabled={!isAllowed}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      isActive
                        ? 'bg-cyan-50 text-cyan-800 font-bold'
                        : isAllowed
                        ? 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                        : 'text-slate-300 cursor-not-allowed opacity-60'
                    }`}
                    title={item.label}
                  >
                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                        isActive
                          ? 'bg-cyan-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>

                    {!isCollapsed && (
                      <span className="truncate text-left text-xs">{item.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ==================================================== */}
        {/* 9. SECURITY & SYSTEM SETTINGS (Slate/Indigo Badge)   */}
        {/* ==================================================== */}
        <div className="space-y-0.5">
          {!isCollapsed ? (
            <button
              type="button"
              onClick={() => toggleMenu('settings')}
              className="w-full flex items-center justify-between p-1.5 rounded-xl hover:bg-slate-100/70 transition-colors cursor-pointer select-none group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-slate-800 to-indigo-600 flex items-center justify-center text-white shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                  <SlidersHorizontal className="w-4 h-4 text-white" />
                </div>
                <span className="text-slate-800 font-semibold text-xs tracking-tight group-hover:text-slate-900">
                  {isBn ? 'সিকিউরিটি ও সিস্টেম সেটিংস' : 'Security & System Settings'}
                </span>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-transform duration-200 ${
                  openMenu === 'settings' ? 'rotate-0' : '-rotate-90'
                }`}
              />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/settings/general')}
              className="w-full flex justify-center py-1.5"
              title="Security & System Settings"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-slate-800 to-indigo-600 flex items-center justify-center text-white shadow-xs">
                <SlidersHorizontal className="w-4 h-4" />
              </div>
            </button>
          )}

          {/* SETTINGS SUB-MENUS WITH TREE CONNECTOR */}
          {(openMenu === 'settings' || isCollapsed) && (
            <div className={`${!isCollapsed ? 'ml-5 pl-3 border-l-2 border-indigo-200/80 my-1 space-y-0.5' : 'space-y-1'}`}>
              {settingsSubItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.isActive;
                const isAllowed = item.roles.includes(currentRole);

                return (
                  <button
                    key={item.id}
                    onClick={item.action}
                    disabled={!isAllowed}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-800 font-bold'
                        : isAllowed
                        ? 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                        : 'text-slate-300 cursor-not-allowed opacity-60'
                    }`}
                    title={item.label}
                  >
                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>

                    {!isCollapsed && (
                      <span className="truncate text-left text-xs">{item.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ==================================================== */}
        {/* CLINICAL & OTHER OPERATIONS (SECONDARY GROUP)        */}
        {/* ==================================================== */}
        <div className="pt-2">
          {!isCollapsed && (
            <div className="px-2 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              {isBn ? 'পোর্টাল ভিউ' : 'Patient Portal'}
            </div>
          )}

          <div className="space-y-0.5 mt-0.5">
            {otherItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                currentPath === item.path ||
                (currentView === item.id &&
                  !currentPath.startsWith('/crm') &&
                  !currentPath.startsWith('/treatments') &&
                  !currentPath.startsWith('/packages') &&
                  !currentPath.startsWith('/consultation') &&
                  !currentPath.startsWith('/billing') &&
                  !currentPath.startsWith('/inventory') &&
                  !currentPath.startsWith('/referrals') &&
                  !currentPath.startsWith('/integration') &&
                  !currentPath.startsWith('/users') &&
                  !currentPath.startsWith('/settings'));
              const isAllowed = item.roles.includes(currentRole);

              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.path)}
                  disabled={!isAllowed}
                  className={`w-full flex items-center gap-2.5 p-1.5 rounded-xl text-xs font-medium transition-all relative cursor-pointer ${
                    isActive
                      ? 'bg-emerald-50 text-[#0DA54F] font-bold shadow-2xs'
                      : isAllowed
                      ? 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900'
                      : 'text-slate-300 cursor-not-allowed opacity-60'
                  }`}
                  title={item.label}
                >
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      isActive ? 'bg-[#0DA54F] text-white shadow-xs' : item.badgeColor
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>

                  {!isCollapsed && (
                    <span className="truncate flex-1 text-left text-xs font-semibold">{item.label}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* User Session Footnote + Logout */}
      <div className="p-3 border-t border-slate-100 bg-slate-50/50">
        <div className={`flex items-center ${isCollapsed ? 'flex-col gap-2' : 'justify-between gap-2'}`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-xs font-bold text-slate-700 shrink-0">
              {currentUser?.name.charAt(0) || 'U'}
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800 truncate leading-none">
                  {currentUser?.name}
                </p>
                <p className="text-[10px] text-slate-500 capitalize truncate mt-1 flex items-center gap-1">
                  {currentUser?.employeeId && (
                    <>
                      <span className="font-mono font-semibold text-slate-700">{currentUser.employeeId}</span>
                      <span className="text-slate-300">•</span>
                    </>
                  )}
                  <span className="truncate">{currentUser?.role.replace('_', ' ')}</span>
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void logout()}
            title={isBn ? 'লগআউট' : 'Logout'}
            aria-label={isBn ? 'লগআউট' : 'Logout'}
            className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold text-slate-600 hover:text-rose-600 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition-colors shrink-0 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            {!isCollapsed && (
              <span className="whitespace-nowrap">{isBn ? 'লগআউট' : 'Logout'}</span>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
};
