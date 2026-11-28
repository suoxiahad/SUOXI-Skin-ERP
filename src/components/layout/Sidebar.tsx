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
  PlugZap,
  MessageSquare,
  Mail,
  Database,
  SlidersHorizontal,
  Scale,
  DollarSign,
  ClipboardList,
  LogOut,
  Archive,
  Wrench,
  BookOpen,
  type LucideIcon,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { canAccessView, canBookAppointment } from '../../utils/rbac.ts';

interface SidebarSubItem {
  id: string;
  path: string;
  label: string;
  icon: LucideIcon;
  action: () => void;
  isActive: boolean;
}

interface SidebarSectionConfig {
  id:
    | 'crm'
    | 'treatment'
    | 'package'
    | 'consultation'
    | 'billing'
    | 'inventory'
    | 'store'
    | 'referrals'
    | 'integration'
    | 'users'
    | 'settings';
  title: string;
  icon: LucideIcon;
  badgeGradient: string;
  treeBorderClass: string;
  activeRowClass: string;
  activeIconClass: string;
  items: SidebarSubItem[];
}

export const Sidebar: React.FC = () => {
  const {
    currentView,
    currentPath,
    navigate,
    currentUser,
    logout,
    setSelectedPatientId,
    setIsQuickBookOpen,
    isAddTreatmentOpen,
    isAddCategoryOpen,
    packageActiveTab,
    isAddPackageOpen,
  } = useApp();

  const [isCollapsed, setIsCollapsed] = useState(false);

  type MenuAccordionId = SidebarSectionConfig['id'];

  const getActiveMenuFromPath = (path: string, view: string): MenuAccordionId | null => {
    if (
      path.startsWith('/crm') ||
      ['appointments', 'reception-checkin', 'reception', 'call-center', 'patients'].includes(view)
    ) {
      return 'crm';
    }
    if (
      path.startsWith('/treatment') ||
      path.startsWith('/treatments') ||
      ['treatments', 'treatment-list', 'treatment-packages', 'categories'].includes(view)
    ) {
      return 'treatment';
    }
    if (
      path.startsWith('/package') ||
      path.startsWith('/packages') ||
      ['packages', 'sessions', 'package-catalog'].includes(view)
    ) {
      return 'package';
    }
    if (
      path.startsWith('/consultation') ||
      path.startsWith('/prescription') ||
      path.startsWith('/rx-protocols') ||
      ['consultation-desk', 'prescription-list', 'medical-documents', 'rx-protocols', 'doctor'].includes(view)
    ) {
      return 'consultation';
    }
    if (
      path.startsWith('/billing') ||
      path.startsWith('/invoices') ||
      ['billing-counter', 'billing-invoices', 'billing-closing', 'billing-sales-report'].includes(view)
    ) {
      return 'billing';
    }
    if (
      path.startsWith('/inventory') ||
      [
        'inventory-stock',
        'inventory-products',
        'inventory-purchases',
        'inventory-adjustments',
        'inventory-suppliers',
      ].includes(view)
    ) {
      return 'inventory';
    }
    if (
      path.startsWith('/store') ||
      ['store', 'store-stock', 'store-requisitions', 'store-instruments', 'store-ledger'].includes(view)
    ) {
      return 'store';
    }
    if (
      path.startsWith('/referrals') ||
      ['referrals', 'referrals-directory', 'referrals-commissions', 'referrals-rules', 'referrals-payouts'].includes(
        view
      )
    ) {
      return 'referrals';
    }
    if (path.startsWith('/integration') || ['integration-sms', 'integration-email'].includes(view)) {
      return 'integration';
    }
    if (
      path.startsWith('/users') ||
      path.startsWith('/user') ||
      ['users-staff', 'users-roles', 'users-doctors', 'users-roster', 'users-security'].includes(view)
    ) {
      return 'users';
    }
    if (
      path.startsWith('/settings') ||
      path.startsWith('/setting') ||
      [
        'settings-general',
        'settings-access-control',
        'settings-security',
        'settings-scheduling',
        'settings-backup',
      ].includes(view)
    ) {
      return 'settings';
    }
    return null;
  };

  const [openMenu, setOpenMenu] = useState<MenuAccordionId | null>(() =>
    getActiveMenuFromPath(currentPath, currentView)
  );

  useEffect(() => {
    const detected = getActiveMenuFromPath(currentPath, currentView);
    if (detected) {
      setOpenMenu(detected);
    }
  }, [currentPath, currentView]);

  const toggleMenu = (menuId: MenuAccordionId) => {
    setOpenMenu((prev) => (prev === menuId ? null : menuId));
  };

  const sections: SidebarSectionConfig[] = [
    {
      id: 'crm',
      title: 'CRM',
      icon: Users,
      badgeGradient: 'from-blue-600 to-sky-400',
      treeBorderClass: 'border-blue-200/80',
      activeRowClass: 'bg-blue-50 text-blue-700 font-bold',
      activeIconClass: 'bg-blue-600 text-white shadow-2xs',
      items: [
        {
          id: 'reception-checkin',
          path: '/crm/reception',
          label: 'Reception Check-In',
          icon: UserCheck,
          action: () => navigate('/crm/reception'),
          isActive:
            currentPath === '/crm/reception' ||
            currentPath === '/reception' ||
            currentView === 'reception-checkin' ||
            currentView === 'reception',
        },
        {
          id: 'appointments',
          path: '/crm/appointments',
          label: 'Appointments',
          icon: Calendar,
          action: () => navigate('/crm/appointments'),
          isActive:
            currentPath === '/crm/appointments' ||
            (currentView === 'appointments' && !currentPath.includes('/')),
        },
        {
          id: 'call-center',
          path: '/crm/followups',
          label: 'Lead Followup',
          icon: PhoneCall,
          action: () => navigate('/crm/followups'),
          isActive: currentPath === '/crm/followups' || currentView === 'call-center',
        },
        {
          id: 'patients',
          path: '/crm/patients',
          label: 'Patient Directory',
          icon: Users,
          action: () => {
            setSelectedPatientId(null);
            navigate('/crm/patients');
          },
          isActive: currentPath === '/crm/patients' || currentView === 'patients',
        },
      ],
    },
    {
      id: 'treatment',
      title: 'Treatment',
      icon: Sparkles,
      badgeGradient: 'from-pink-500 to-rose-400',
      treeBorderClass: 'border-pink-200/80',
      activeRowClass: 'bg-rose-50 text-rose-700 font-bold',
      activeIconClass: 'bg-rose-500 text-white shadow-2xs',
      items: [
        {
          id: 'treatment-list',
          path: '/treatments',
          label: 'Treatment List',
          icon: ListOrdered,
          action: () => navigate('/treatments'),
          isActive:
            (currentPath === '/treatments' ||
              currentPath === '/treatment/list' ||
              currentPath === '/treatment') &&
            !isAddTreatmentOpen &&
            !isAddCategoryOpen,
        },
        {
          id: 'add-treatment',
          path: '/treatments/new',
          label: 'Add Treatment',
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
          label: 'Add Category',
          icon: FolderPlus,
          action: () => navigate('/treatments/categories'),
          isActive:
            currentPath === '/treatments/categories' ||
            currentPath === '/treatment/category' ||
            currentPath === '/treatments/category' ||
            isAddCategoryOpen,
        },
      ],
    },
    {
      id: 'package',
      title: 'Package',
      icon: Package,
      badgeGradient: 'from-purple-600 to-indigo-400',
      treeBorderClass: 'border-purple-200/80',
      activeRowClass: 'bg-purple-50 text-purple-700 font-bold',
      activeIconClass: 'bg-purple-600 text-white shadow-2xs',
      items: [
        {
          id: 'package-list',
          path: '/packages',
          label: 'Package List',
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
          label: 'Patient Sessions',
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
          label: 'Add Package',
          icon: PlusCircle,
          action: () => navigate('/packages/new'),
          isActive:
            currentPath === '/packages/new' ||
            currentPath === '/packages/add-new' ||
            currentPath === '/package/add-new' ||
            isAddPackageOpen ||
            packageActiveTab === 'create',
        },
      ],
    },
    {
      id: 'consultation',
      title: 'Consultation',
      icon: Stethoscope,
      badgeGradient: 'from-teal-500 to-cyan-400',
      treeBorderClass: 'border-teal-200/80',
      activeRowClass: 'bg-teal-50 text-teal-800 font-bold',
      activeIconClass: 'bg-teal-600 text-white shadow-2xs',
      items: [
        {
          id: 'consultation-desk',
          path: '/consultation/desk',
          label: 'Consultation Desk',
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
          label: 'Prescription List',
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
          label: 'Medical Documents',
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
          label: 'Rx Protocols',
          icon: ClipboardList,
          action: () => navigate('/consultation/protocols'),
          isActive:
            currentPath === '/consultation/protocols' ||
            currentPath === '/rx-protocols' ||
            currentView === 'rx-protocols',
        },
      ],
    },
    {
      id: 'billing',
      title: 'Billing & Cashier',
      icon: Receipt,
      badgeGradient: 'from-emerald-600 to-teal-400',
      treeBorderClass: 'border-emerald-200/80',
      activeRowClass: 'bg-emerald-50 text-[#0DA54F] font-bold',
      activeIconClass: 'bg-[#0DA54F] text-white shadow-2xs',
      items: [
        {
          id: 'billing-counter',
          path: '/billing/counter',
          label: 'POS Billing Counter',
          icon: CreditCard,
          action: () => navigate('/billing/counter'),
          isActive:
            currentPath === '/billing/counter' ||
            currentPath === '/billing' ||
            currentView === 'billing-counter',
        },
        {
          id: 'billing-invoices',
          path: '/billing/invoices',
          label: 'Invoices & Receipts',
          icon: Receipt,
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
          label: 'Daily Shift Closing',
          icon: Clock,
          action: () => navigate('/billing/closing'),
          isActive:
            currentPath === '/billing/closing' ||
            currentPath === '/closing' ||
            currentView === 'billing-closing',
        },
        {
          id: 'billing-sales-report',
          path: '/billing/sales-report',
          label: 'Sales Report',
          icon: BarChart3,
          action: () => navigate('/billing/sales-report'),
          isActive:
            currentPath === '/billing/sales-report' ||
            currentPath === '/billing/sales' ||
            currentPath === '/sales-report' ||
            currentView === 'billing-sales-report',
        },
      ],
    },
    {
      id: 'inventory',
      title: 'Inventory & Stock',
      icon: Boxes,
      badgeGradient: 'from-amber-500 to-orange-400',
      treeBorderClass: 'border-amber-200/80',
      activeRowClass: 'bg-amber-50 text-amber-800 font-bold',
      activeIconClass: 'bg-amber-500 text-white shadow-2xs',
      items: [
        {
          id: 'inventory-stock',
          path: '/inventory/stock',
          label: 'Stock Report',
          icon: Boxes,
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
          label: 'Product Catalog',
          icon: Tag,
          action: () => navigate('/inventory/products'),
          isActive:
            currentPath === '/inventory/products' ||
            currentPath === '/inventory/catalog' ||
            currentView === 'inventory-products',
        },
        {
          id: 'inventory-purchases',
          path: '/inventory/purchases',
          label: 'Purchase Report',
          icon: Truck,
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
          label: 'Stock Movements',
          icon: Sliders,
          action: () => navigate('/inventory/adjustments'),
          isActive:
            currentPath === '/inventory/adjustments' ||
            currentPath === '/inventory/logs' ||
            currentView === 'inventory-adjustments',
        },
        {
          id: 'inventory-suppliers',
          path: '/inventory/suppliers',
          label: 'Suppliers & Vendors',
          icon: Building2,
          action: () => navigate('/inventory/suppliers'),
          isActive:
            currentPath === '/inventory/suppliers' ||
            currentPath === '/inventory/vendors' ||
            currentView === 'inventory-suppliers',
        },
      ],
    },
    {
      id: 'store',
      title: 'Clinic Store',
      icon: Archive,
      badgeGradient: 'from-slate-700 to-teal-600',
      treeBorderClass: 'border-teal-200/80',
      activeRowClass: 'bg-teal-50 text-teal-800 font-bold',
      activeIconClass: 'bg-teal-600 text-white shadow-2xs',
      items: [
        {
          id: 'store-stock',
          path: '/store/stock',
          label: 'Store Stock & Catalog',
          icon: Archive,
          action: () => navigate('/store/stock'),
          isActive:
            currentPath === '/store/stock' ||
            currentPath === '/store' ||
            currentView === 'store-stock' ||
            currentView === 'store',
        },
        {
          id: 'store-requisitions',
          path: '/store/requisitions',
          label: 'Requisitions & Issue',
          icon: ClipboardList,
          action: () => navigate('/store/requisitions'),
          isActive: currentPath === '/store/requisitions' || currentView === 'store-requisitions',
        },
        {
          id: 'store-instruments',
          path: '/store/instruments',
          label: 'Instruments & Custody',
          icon: Wrench,
          action: () => navigate('/store/instruments'),
          isActive: currentPath === '/store/instruments' || currentView === 'store-instruments',
        },
        {
          id: 'store-ledger',
          path: '/store/ledger',
          label: 'Store Ledger & Reports',
          icon: BookOpen,
          action: () => navigate('/store/ledger'),
          isActive: currentPath === '/store/ledger' || currentView === 'store-ledger',
        },
      ],
    },
    {
      id: 'referrals',
      title: 'Referrals & Commissions',
      icon: Percent,
      badgeGradient: 'from-emerald-600 to-teal-500',
      treeBorderClass: 'border-emerald-200/80',
      activeRowClass: 'bg-emerald-50 text-[#0DA54F] font-bold',
      activeIconClass: 'bg-[#0DA54F] text-white shadow-2xs',
      items: [
        {
          id: 'referrals-directory',
          path: '/referrals/directory',
          label: 'Referrers Directory',
          icon: Users,
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
          label: 'Commissions Ledger',
          icon: DollarSign,
          action: () => navigate('/referrals/commissions'),
          isActive:
            currentPath === '/referrals/commissions' ||
            currentPath === '/referrals/ledger' ||
            currentView === 'referrals-commissions',
        },
        {
          id: 'referrals-rules',
          path: '/referrals/rules',
          label: 'Commission Rules',
          icon: Scale,
          action: () => navigate('/referrals/rules'),
          isActive: currentPath === '/referrals/rules' || currentView === 'referrals-rules',
        },
        {
          id: 'referrals-payouts',
          path: '/referrals/payouts',
          label: 'Payouts & Settlement',
          icon: CheckSquare,
          action: () => navigate('/referrals/payouts'),
          isActive:
            currentPath === '/referrals/payouts' ||
            currentPath === '/referrals/settlements' ||
            currentView === 'referrals-payouts',
        },
      ],
    },
    {
      id: 'integration',
      title: 'Integration',
      icon: PlugZap,
      badgeGradient: 'from-indigo-600 to-violet-500',
      treeBorderClass: 'border-indigo-200/80',
      activeRowClass: 'bg-indigo-50 text-indigo-700 font-bold',
      activeIconClass: 'bg-indigo-600 text-white shadow-2xs',
      items: [
        {
          id: 'integration-sms',
          path: '/integration/sms',
          label: 'SMS Gateway',
          icon: MessageSquare,
          action: () => navigate('/integration/sms'),
          isActive:
            currentPath === '/integration/sms' ||
            currentPath === '/integration' ||
            currentView === 'integration-sms',
        },
        {
          id: 'integration-email',
          path: '/integration/email',
          label: 'Email Gateway',
          icon: Mail,
          action: () => navigate('/integration/email'),
          isActive: currentPath === '/integration/email' || currentView === 'integration-email',
        },
      ],
    },
    {
      id: 'users',
      title: 'User Management',
      icon: Users,
      badgeGradient: 'from-blue-600 to-cyan-500',
      treeBorderClass: 'border-cyan-200/80',
      activeRowClass: 'bg-cyan-50 text-cyan-800 font-bold',
      activeIconClass: 'bg-cyan-600 text-white shadow-2xs',
      items: [
        {
          id: 'users-staff',
          path: '/users/staff',
          label: 'Staff Directory',
          icon: Users,
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
          label: 'Roles & Permissions',
          icon: ShieldCheck,
          action: () => navigate('/users/roles'),
          isActive:
            currentPath === '/users/roles' ||
            currentPath === '/users/permissions' ||
            currentView === 'users-roles',
        },
        {
          id: 'users-doctors',
          path: '/users/doctors',
          label: 'Doctors & Specialists',
          icon: Stethoscope,
          action: () => navigate('/users/doctors'),
          isActive:
            currentPath === '/users/doctors' ||
            currentPath === '/users/specialists' ||
            currentView === 'users-doctors',
        },
        {
          id: 'users-roster',
          path: '/users/roster',
          label: 'Therapists & Duty Roster',
          icon: Sparkles,
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
          label: 'Login & Security Audit',
          icon: Lock,
          action: () => navigate('/users/security'),
          isActive:
            currentPath === '/users/security' ||
            currentPath === '/users/audit' ||
            currentPath === '/users/logs' ||
            currentView === 'users-security',
        },
      ],
    },
    {
      id: 'settings',
      title: 'Security & System Settings',
      icon: SlidersHorizontal,
      badgeGradient: 'from-slate-800 to-indigo-600',
      treeBorderClass: 'border-indigo-200/80',
      activeRowClass: 'bg-indigo-50 text-indigo-800 font-bold',
      activeIconClass: 'bg-indigo-600 text-white shadow-2xs',
      items: [
        {
          id: 'settings-general',
          path: '/settings/general',
          label: 'General & Branch Setup',
          icon: Building2,
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
          label: 'Access Control & RBAC',
          icon: ShieldCheck,
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
          label: 'Authentication & Security',
          icon: Lock,
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
          label: 'Booking & Clinical Rules',
          icon: Clock,
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
          label: 'Backup & System Audit',
          icon: Database,
          action: () => navigate('/settings/backup'),
          isActive:
            currentPath === '/settings/backup' ||
            currentPath === '/settings/backups' ||
            currentPath === '/settings/recovery' ||
            currentView === 'settings-backup',
        },
      ],
    },
  ];

  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canAccessView(currentUser, item.id)),
    }))
    .filter((section) => section.items.length > 0);

  const showDashboard = canAccessView(currentUser, 'dashboard');
  const showQuickBook = canBookAppointment(currentUser);
  const showPortal = canAccessView(currentUser, 'portal');

  const isDashboardActive =
    currentPath === '/dashboard' || currentPath === '/' || currentView === 'dashboard';
  const isPortalActive =
    currentPath === '/portal' ||
    (currentView === 'portal' &&
      !currentPath.startsWith('/crm') &&
      !currentPath.startsWith('/treatments') &&
      !currentPath.startsWith('/packages') &&
      !currentPath.startsWith('/consultation') &&
      !currentPath.startsWith('/billing') &&
      !currentPath.startsWith('/inventory') &&
      !currentPath.startsWith('/store') &&
      !currentPath.startsWith('/referrals') &&
      !currentPath.startsWith('/integration') &&
      !currentPath.startsWith('/users') &&
      !currentPath.startsWith('/settings'));

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
                Aesthetic &amp; Skin CRM
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

      {/* Quick Action Button (Only for roles allowed to create appointments) */}
      {showQuickBook && (
        <div className="p-3 pb-2">
          <button
            onClick={() => setIsQuickBookOpen(true)}
            className={`w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#0DA54F] to-[#0a8740] hover:from-[#0a8740] hover:to-[#086f34] text-white font-semibold text-xs shadow-xs flex items-center justify-center gap-2 transition-all duration-150 cursor-pointer ${
              isCollapsed ? 'px-0' : ''
            }`}
            title="Quick Book Appointment"
          >
            <Calendar className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span className="truncate">Quick Book</span>}
          </button>
        </div>
      )}

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-1.5 space-y-2">
        {!isCollapsed && (
          <div className="px-2 pt-1 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Menu</span>
          </div>
        )}

        {/* Executive Dashboard */}
        {showDashboard && (
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
                    Dashboard
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
        )}

        {/* Authorized Module Groups */}
        {visibleSections.map((section) => {
          const SectionIcon = section.icon;
          const isOpen = openMenu === section.id || isCollapsed;

          return (
            <div key={section.id} className="space-y-0.5">
              {!isCollapsed ? (
                <button
                  type="button"
                  onClick={() => toggleMenu(section.id)}
                  className="w-full flex items-center justify-between p-1.5 rounded-xl hover:bg-slate-100/70 transition-colors cursor-pointer select-none group"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-8 h-8 rounded-xl bg-gradient-to-tr ${section.badgeGradient} flex items-center justify-center text-white shadow-xs shrink-0 group-hover:scale-105 transition-transform`}
                    >
                      <SectionIcon className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-slate-800 font-semibold text-xs tracking-tight group-hover:text-slate-900 text-left">
                      {section.title}
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-transform duration-200 ${
                      openMenu === section.id ? 'rotate-0' : '-rotate-90'
                    }`}
                  />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={section.items[0].action}
                  className="w-full flex justify-center py-1.5"
                  title={section.title}
                >
                  <div
                    className={`w-8 h-8 rounded-xl bg-gradient-to-tr ${section.badgeGradient} flex items-center justify-center text-white shadow-xs`}
                  >
                    <SectionIcon className="w-4 h-4" />
                  </div>
                </button>
              )}

              {isOpen && (
                <div
                  className={
                    !isCollapsed
                      ? `ml-5 pl-3 border-l-2 ${section.treeBorderClass} my-1 space-y-0.5`
                      : 'space-y-1'
                  }
                >
                  {section.items.map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={item.action}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                          item.isActive
                            ? section.activeRowClass
                            : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                        }`}
                        title={item.label}
                      >
                        <div
                          className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                            item.isActive ? section.activeIconClass : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          <ItemIcon className="w-3.5 h-3.5" />
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
          );
        })}

        {/* Patient Portal Link (only when authorized) */}
        {showPortal && (
          <div className="pt-2">
            {!isCollapsed && (
              <div className="px-2 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Patient Portal
              </div>
            )}

            <div className="space-y-0.5 mt-0.5">
              <button
                type="button"
                onClick={() => navigate('/portal')}
                className={`w-full flex items-center gap-2.5 p-1.5 rounded-xl text-xs font-medium transition-all relative cursor-pointer ${
                  isPortalActive
                    ? 'bg-emerald-50 text-[#0DA54F] font-bold shadow-2xs'
                    : 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900'
                }`}
                title="Patient Portal"
              >
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    isPortalActive ? 'bg-[#0DA54F] text-white shadow-xs' : 'bg-cyan-50 text-cyan-600'
                  }`}
                >
                  <UserCheck className="w-4 h-4" />
                </div>

                {!isCollapsed && (
                  <span className="truncate flex-1 text-left text-xs font-semibold">
                    Patient Portal
                  </span>
                )}
              </button>
            </div>
          </div>
        )}
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
                      <span className="font-mono font-semibold text-slate-700">
                        {currentUser.employeeId}
                      </span>
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
            title="Logout"
            aria-label="Logout"
            className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold text-slate-600 hover:text-rose-600 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition-colors shrink-0 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            {!isCollapsed && <span className="whitespace-nowrap">Logout</span>}
          </button>
        </div>
      </div>
    </aside>
  );
};
