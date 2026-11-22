/**
 * SUOXI Skin Care & Aesthetic Center CRM
 * Global Application Context & State Provider
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, ApiClientError } from '../api/client.ts';
import type { User, UserRole, Branch } from '../types/index.ts';

export type Language = 'en' | 'bn';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  description?: string;
  message?: string;
}

interface AppContextType {
  currentUser: User | null;
  setCurrentUser: (u: User) => void;
  userRole: UserRole;
  authRequired: boolean;
  mustChangePassword: boolean;
  clearMustChangePassword: () => void;
  login: (identifier: string, password: string) => Promise<{ mustChangePassword?: boolean }>;
  logout: () => Promise<void>;
  branches: Branch[];
  activeBranchId: string;
  setActiveBranchId: (id: string) => void;
  refreshBranches: () => Promise<void>;
  language: Language;
  setLanguage: (lang: Language) => void;
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
  isQuickBookOpen: boolean;
  setIsQuickBookOpen: (open: boolean) => void;
  isPatientRegistrationOpen: boolean;
  setIsPatientRegistrationOpen: (open: boolean) => void;
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  currentView: string;
  setCurrentView: (view: string) => void;
  selectedPatientId: string | null;
  setSelectedPatientId: (id: string | null) => void;
  activePrescriptionPrintId: string | null;
  setActivePrescriptionPrintId: (id: string | null) => void;
  currentPath: string;
  navigate: (path: string, replace?: boolean) => void;
  isAddTreatmentOpen: boolean;
  setIsAddTreatmentOpen: (open: boolean) => void;
  isAddCategoryOpen: boolean;
  setIsAddCategoryOpen: (open: boolean) => void;
  packageActiveTab: 'list' | 'sessions' | 'create';
  setPackageActiveTab: (tab: 'list' | 'sessions' | 'create') => void;
  isAddPackageOpen: boolean;
  setIsAddPackageOpen: (open: boolean) => void;
}

// Canonical Option 'খ' (Standard RESTful Aesthetic CRM Slugs) Resolver
export function resolveRouteFromPath(rawPath: string): {
  view: string;
  packageTab: 'list' | 'sessions' | 'create';
  addTreatment: boolean;
  addCategory: boolean;
  addPackage: boolean;
  canonicalPath: string;
} {
  const clean = (rawPath || '/').toLowerCase().split('?')[0].replace(/\/+$/, '') || '/';

  // 0. Executive Dashboard (SmartDesk styled)
  if (clean === '/dashboard' || clean === '/' || clean === '') {
    return { view: 'dashboard', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/dashboard' };
  }

  // 1. CRM
  if (clean === '/crm/reception' || clean === '/crm/check-in' || clean === '/reception') {
    return { view: 'reception-checkin', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/crm/reception' };
  }
  if (clean === '/crm/appointments') {
    return { view: 'appointments', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/crm/appointments' };
  }
  if (clean === '/crm/followups' || clean === '/crm/followup') {
    return { view: 'call-center', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/crm/followups' };
  }
  if (clean === '/crm/patients' || clean === '/crm/patient-list' || clean === '/patients') {
    return { view: 'patients', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/crm/patients' };
  }

  // 2. Treatment
  if (
    clean === '/treatments/new' ||
    clean === '/treatments/add-new' ||
    clean === '/treatment/add-new' ||
    clean === '/treatments/create'
  ) {
    return { view: 'treatments', packageTab: 'list', addTreatment: true, addCategory: false, addPackage: false, canonicalPath: '/treatments/new' };
  }
  if (
    clean === '/treatments/categories' ||
    clean === '/treatments/category' ||
    clean === '/treatment/category' ||
    clean === '/treatment/categories'
  ) {
    return { view: 'treatments', packageTab: 'list', addTreatment: false, addCategory: true, addPackage: false, canonicalPath: '/treatments/categories' };
  }
  if (clean === '/treatments' || clean === '/treatments/list' || clean === '/treatment/list' || clean === '/treatment') {
    return { view: 'treatments', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/treatments' };
  }

  // 3. Package
  if (
    clean === '/packages/new' ||
    clean === '/packages/add-new' ||
    clean === '/package/add-new' ||
    clean === '/packages/create'
  ) {
    return { view: 'sessions', packageTab: 'create', addTreatment: false, addCategory: false, addPackage: true, canonicalPath: '/packages/new' };
  }
  if (clean === '/packages/sessions' || clean === '/package/sessions') {
    return { view: 'sessions', packageTab: 'sessions', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/packages/sessions' };
  }
  if (clean === '/packages' || clean === '/packages/list' || clean === '/package/list' || clean === '/package') {
    return { view: 'sessions', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/packages' };
  }

  // 4. Consultation & Medical Records (EMR)
  if (
    clean === '/consultation' ||
    clean === '/consultation/desk' ||
    clean === '/doctor' ||
    clean === '/consultations'
  ) {
    return { view: 'consultation-desk', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/consultation/desk' };
  }
  if (
    clean === '/consultation/prescriptions' ||
    clean === '/prescriptions' ||
    clean === '/prescription-list' ||
    clean === '/prescription'
  ) {
    return { view: 'prescription-list', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/consultation/prescriptions' };
  }
  if (
    clean === '/consultation/documents' ||
    clean === '/consultation/attachments' ||
    clean === '/medical-documents' ||
    clean === '/medical-records' ||
    clean === '/documents'
  ) {
    return { view: 'medical-documents', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/consultation/documents' };
  }
  if (
    clean === '/consultation/protocols' ||
    clean === '/rx-protocols' ||
    clean === '/protocols'
  ) {
    return { view: 'rx-protocols', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/consultation/protocols' };
  }

  // 5. Clinical & Operations
  if (clean === '/calendar') {
    return { view: 'calendar', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/calendar' };
  }
  if (clean === '/lifestyle' || clean === '/guidance') {
    return { view: 'guidance', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/lifestyle' };
  }
  // 5. Billing & Cashier Counter
  if (clean === '/billing/counter' || clean === '/billing' || clean === '/pos') {
    return { view: 'billing-counter', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/billing/counter' };
  }
  if (clean === '/billing/invoices' || clean === '/invoices') {
    return { view: 'billing-invoices', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/billing/invoices' };
  }
  if (clean === '/billing/closing' || clean === '/billing/daily-closing') {
    return { view: 'billing-closing', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/billing/closing' };
  }
  if (clean === '/billing/sales-report' || clean === '/billing/sales' || clean === '/sales-report' || clean === '/reports/sales') {
    return { view: 'billing-sales-report', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/billing/sales-report' };
  }
  // 6. Inventory & Pharmacy
  if (clean === '/inventory/stock' || clean === '/inventory') {
    return { view: 'inventory-stock', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/inventory/stock' };
  }
  if (clean === '/inventory/products' || clean === '/inventory/catalog') {
    return { view: 'inventory-products', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/inventory/products' };
  }
  if (clean === '/inventory/purchases' || clean === '/inventory/po' || clean === '/inventory/grn') {
    return { view: 'inventory-purchases', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/inventory/purchases' };
  }
  if (clean === '/inventory/adjustments' || clean === '/inventory/logs' || clean === '/inventory/movements') {
    return { view: 'inventory-adjustments', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/inventory/adjustments' };
  }
  if (clean === '/inventory/suppliers' || clean === '/inventory/vendors') {
    return { view: 'inventory-suppliers', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/inventory/suppliers' };
  }
  // 6.2 Referrals & Commissions Sub-routes
  if (clean === '/referrals' || clean === '/referrals/directory') {
    return { view: 'referrals-directory', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/referrals/directory' };
  }
  if (clean === '/referrals/commissions' || clean === '/referrals/ledger') {
    return { view: 'referrals-commissions', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/referrals/commissions' };
  }
  if (clean === '/referrals/rules') {
    return { view: 'referrals-rules', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/referrals/rules' };
  }
  if (clean === '/referrals/payouts' || clean === '/referrals/settlements') {
    return { view: 'referrals-payouts', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/referrals/payouts' };
  }
  // 7. Integration: SMS & Email Gateways
  if (clean === '/integration/sms' || clean === '/integration' || clean === '/integrations') {
    return { view: 'integration-sms', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/integration/sms' };
  }
  if (clean === '/integration/email') {
    return { view: 'integration-email', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/integration/email' };
  }
  if (clean.startsWith('/portal')) {
    return { view: 'portal', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/portal' };
  }
  // 8. User Management & Access Control
  if (clean === '/users/staff' || clean === '/users' || clean === '/user' || clean === '/users/directory') {
    return { view: 'users-staff', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/users/staff' };
  }
  if (clean === '/users/roles' || clean === '/users/permissions') {
    return { view: 'users-roles', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/users/roles' };
  }
  if (clean === '/users/doctors' || clean === '/users/specialists') {
    return { view: 'users-doctors', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/users/doctors' };
  }
  if (clean === '/users/roster' || clean === '/users/rosters' || clean === '/users/therapists') {
    return { view: 'users-roster', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/users/roster' };
  }
  if (clean === '/users/security' || clean === '/users/audit' || clean === '/users/logs') {
    return { view: 'users-security', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/users/security' };
  }

  // 9. Security & System Settings
  if (clean === '/settings/general' || clean === '/settings' || clean === '/setting' || clean === '/settings/branches') {
    return { view: 'settings-general', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/settings/general' };
  }
  if (clean === '/settings/access-control' || clean === '/settings/rbac' || clean === '/settings/permissions') {
    return { view: 'settings-access-control', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/settings/access-control' };
  }
  if (clean === '/settings/security' || clean === '/settings/auth' || clean === '/settings/sessions') {
    return { view: 'settings-security', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/settings/security' };
  }
  if (clean === '/settings/scheduling' || clean === '/settings/slots' || clean === '/settings/timing') {
    return { view: 'settings-scheduling', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/settings/scheduling' };
  }
  if (clean === '/settings/backup' || clean === '/settings/backups' || clean === '/settings/recovery') {
    return { view: 'settings-backup', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/settings/backup' };
  }

  // Default to CRM Appointments
  return { view: 'appointments', packageTab: 'list', addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/crm/appointments' };
}

export function getCanonicalPathFromState(
  view: string,
  packageTab: 'list' | 'sessions' | 'create',
  addTreatment: boolean,
  addCategory: boolean,
  addPackage: boolean
): string {
  switch (view) {
    case 'appointments':
      return '/crm/appointments';
    case 'call-center':
      return '/crm/followups';
    case 'patients':
      return '/crm/patients';
    case 'treatments':
      if (addTreatment) return '/treatments/new';
      if (addCategory) return '/treatments/categories';
      return '/treatments';
    case 'sessions':
      if (addPackage || packageTab === 'create') return '/packages/new';
      if (packageTab === 'sessions') return '/packages/sessions';
      return '/packages';
    case 'calendar':
      return '/calendar';
    case 'guidance':
    case 'lifestyle':
      return '/lifestyle';
    case 'consultation-desk':
    case 'doctor':
      return '/consultation/desk';
    case 'prescription-list':
    case 'prescriptions':
      return '/consultation/prescriptions';
    case 'medical-documents':
    case 'documents':
      return '/consultation/documents';
    case 'rx-protocols':
      return '/consultation/protocols';
    case 'reception-checkin':
    case 'reception':
      return '/crm/reception';
    case 'billing-counter':
    case 'billing':
      return '/billing/counter';
    case 'billing-invoices':
    case 'invoices':
      return '/billing/invoices';
    case 'billing-closing':
      return '/billing/closing';
    case 'inventory-stock':
    case 'inventory':
      return '/inventory/stock';
    case 'inventory-products':
      return '/inventory/products';
    case 'inventory-purchases':
      return '/inventory/purchases';
    case 'inventory-adjustments':
      return '/inventory/adjustments';
    case 'inventory-suppliers':
      return '/inventory/suppliers';
    case 'referrals-directory':
    case 'referrals':
      return '/referrals/directory';
    case 'referrals-commissions':
      return '/referrals/commissions';
    case 'referrals-rules':
      return '/referrals/rules';
    case 'referrals-payouts':
      return '/referrals/payouts';
    case 'integration-sms':
      return '/integration/sms';
    case 'integration-email':
      return '/integration/email';
    case 'portal':
      return '/portal';
    case 'audit':
      return '/audit';
    case 'users-staff':
    case 'users':
      return '/users/staff';
    case 'users-roles':
      return '/users/roles';
    case 'users-doctors':
      return '/users/doctors';
    case 'users-roster':
      return '/users/roster';
    case 'users-security':
      return '/users/security';
    case 'settings-general':
    case 'settings':
      return '/settings/general';
    case 'settings-access-control':
      return '/settings/access-control';
    case 'settings-security':
      return '/settings/security';
    case 'settings-scheduling':
      return '/settings/scheduling';
    case 'settings-backup':
      return '/settings/backup';
    default:
      return '/crm/appointments';
  }
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authRequired, setAuthRequired] = useState<boolean>(false);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string>('');
  const [language, setLanguage] = useState<Language>('en');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isQuickBookOpen, setIsQuickBookOpen] = useState(false);
  const [isPatientRegistrationOpen, setIsPatientRegistrationOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Initialize initial route from browser URL
  const initialResolved = typeof window !== 'undefined'
    ? resolveRouteFromPath(window.location.pathname)
    : { view: 'appointments', packageTab: 'list' as const, addTreatment: false, addCategory: false, addPackage: false, canonicalPath: '/crm/appointments' };

  const [currentView, setCurrentView] = useState<string>(initialResolved.view);
  const [currentPath, setCurrentPath] = useState<string>(initialResolved.canonicalPath);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [activePrescriptionPrintId, setActivePrescriptionPrintId] = useState<string | null>(null);
  const [isAddTreatmentOpen, setIsAddTreatmentOpen] = useState(initialResolved.addTreatment);
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(initialResolved.addCategory);
  const [packageActiveTab, setPackageActiveTab] = useState<'list' | 'sessions' | 'create'>(initialResolved.packageTab);
  const [isAddPackageOpen, setIsAddPackageOpen] = useState(initialResolved.addPackage);

  // Deep-link initial route sync & back/forward browser navigation
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Normalize URL to Option B canonical slug if initial path is root or alias
    if (window.location.pathname !== initialResolved.canonicalPath) {
      window.history.replaceState({ path: initialResolved.canonicalPath }, '', initialResolved.canonicalPath);
    }

    const handlePopState = () => {
      const resolved = resolveRouteFromPath(window.location.pathname);
      if (resolved.view === 'patients' && !window.location.pathname.includes('/patients/')) {
        setSelectedPatientId(null);
      }
      setCurrentView(resolved.view);
      setPackageActiveTab(resolved.packageTab);
      setIsAddTreatmentOpen(resolved.addTreatment);
      setIsAddCategoryOpen(resolved.addCategory);
      setIsAddPackageOpen(resolved.addPackage);
      setCurrentPath(resolved.canonicalPath);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Central Navigate function for Option 'খ' slugs
  const navigate = (targetPath: string, replace = false) => {
    const resolved = resolveRouteFromPath(targetPath);
    if (resolved.view === 'patients' && !targetPath.includes('/patients/')) {
      setSelectedPatientId(null);
    }
    setCurrentView(resolved.view);
    setPackageActiveTab(resolved.packageTab);
    setIsAddTreatmentOpen(resolved.addTreatment);
    setIsAddCategoryOpen(resolved.addCategory);
    setIsAddPackageOpen(resolved.addPackage);
    setCurrentPath(resolved.canonicalPath);

    if (typeof window !== 'undefined') {
      if (replace) {
        window.history.replaceState({ path: resolved.canonicalPath }, '', resolved.canonicalPath);
      } else {
        window.history.pushState({ path: resolved.canonicalPath }, '', resolved.canonicalPath);
      }
    }
  };

  // Sync URL when direct view setters are called
  const setViewWithSync = (newView: string) => {
    if (newView === 'patients') {
      setSelectedPatientId(null);
    }
    setCurrentView(newView);
    const newPath = getCanonicalPathFromState(newView, packageActiveTab, false, false, false);
    setIsAddTreatmentOpen(false);
    setIsAddCategoryOpen(false);
    setIsAddPackageOpen(false);
    setCurrentPath(newPath);
    if (typeof window !== 'undefined' && window.location.pathname !== newPath) {
      window.history.pushState({ path: newPath }, '', newPath);
    }
  };

  const setPackageTabWithSync = (tab: 'list' | 'sessions' | 'create') => {
    setPackageActiveTab(tab);
    const addPkg = tab === 'create';
    setIsAddPackageOpen(addPkg);
    const newPath = getCanonicalPathFromState('sessions', tab, false, false, addPkg);
    setCurrentPath(newPath);
    if (typeof window !== 'undefined' && window.location.pathname !== newPath) {
      window.history.pushState({ path: newPath }, '', newPath);
    }
  };

  const setAddTreatmentWithSync = (open: boolean) => {
    setIsAddTreatmentOpen(open);
    if (open) setIsAddCategoryOpen(false);
    const newPath = getCanonicalPathFromState('treatments', packageActiveTab, open, false, false);
    setCurrentPath(newPath);
    if (typeof window !== 'undefined' && window.location.pathname !== newPath) {
      window.history.pushState({ path: newPath }, '', newPath);
    }
  };

  const setAddCategoryWithSync = (open: boolean) => {
    setIsAddCategoryOpen(open);
    if (open) setIsAddTreatmentOpen(false);
    const newPath = getCanonicalPathFromState('treatments', packageActiveTab, false, open, false);
    setCurrentPath(newPath);
    if (typeof window !== 'undefined' && window.location.pathname !== newPath) {
      window.history.pushState({ path: newPath }, '', newPath);
    }
  };

  const setAddPackageWithSync = (open: boolean) => {
    setIsAddPackageOpen(open);
    const tab = open ? 'create' : packageActiveTab === 'create' ? 'list' : packageActiveTab;
    setPackageActiveTab(tab);
    const newPath = getCanonicalPathFromState('sessions', tab, false, false, open);
    setCurrentPath(newPath);
    if (typeof window !== 'undefined' && window.location.pathname !== newPath) {
      window.history.pushState({ path: newPath }, '', newPath);
    }
  };

  const syncBranchesSelection = (branchList: Branch[], preferredBranchId?: string) => {
    setBranches(branchList);
    setActiveBranchId((currentId) => {
      if (currentId && branchList.some((b) => b.id === currentId)) {
        return currentId;
      }
      if (preferredBranchId && branchList.some((b) => b.id === preferredBranchId)) {
        return preferredBranchId;
      }
      const firstActive = branchList.find((b) => b.isActive !== false);
      return firstActive?.id || branchList[0]?.id || preferredBranchId || '';
    });
  };

  const refreshBranches = async () => {
    const branchList = await api.branches.list();
    syncBranchesSelection(branchList, currentUser?.branchId);
  };

  const loadAuthenticatedContext = async () => {
    const [mePayload, branchList] = await Promise.all([api.auth.meWithMeta(), api.branches.list()]);
    setCurrentUser(mePayload.user);
    setAuthRequired(false);
    syncBranchesSelection(branchList, mePayload.user.branchId);
  };

  // Initialize initial user and branches
  useEffect(() => {
    async function init() {
      try {
        await loadAuthenticatedContext();
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 401) {
          setAuthRequired(true);
          setCurrentUser(null);
        } else {
          console.error('Initialization error:', err);
        }
      }
    }
    init();
  }, []);

  const login = async (identifier: string, password: string) => {
    const result = await api.auth.login(identifier, password);
    setCurrentUser(result.user);
    const needsPwdReset = Boolean(result.mustChangePassword);
    setMustChangePassword(needsPwdReset);
    setAuthRequired(needsPwdReset);
    try {
      const branchList = await api.branches.list();
      syncBranchesSelection(branchList, result.user.branchId);
    } catch {
      if (result.user.branchId) {
        setActiveBranchId(result.user.branchId);
      }
    }
    return { mustChangePassword: needsPwdReset };
  };

  const clearMustChangePassword = () => {
    setMustChangePassword(false);
    setAuthRequired(false);
  };

  const logout = async () => {
    try {
      await api.auth.logout();
    } finally {
      setCurrentUser(null);
      setMustChangePassword(false);
      setAuthRequired(true);
      setBranches([]);
      setActiveBranchId('');
    }
  };

  // Keyboard shortcut Ctrl+K / Cmd+K for patient search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const addToast = (toast: Omit<ToastMessage, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const description = toast.description || toast.message;
    setToasts((prev) => [...prev, { ...toast, id, description }]);
    setTimeout(() => {
      removeToast(id);
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const userRole = currentUser?.role || 'doctor';

  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        userRole,
        authRequired,
        mustChangePassword,
        clearMustChangePassword,
        login,
        logout,
        branches,
        activeBranchId,
        setActiveBranchId,
        refreshBranches,
        language,
        setLanguage,
        toasts,
        addToast,
        removeToast,
        isQuickBookOpen,
        setIsQuickBookOpen,
        isPatientRegistrationOpen,
        setIsPatientRegistrationOpen,
        isSearchOpen,
        setIsSearchOpen,
        currentView,
        setCurrentView: setViewWithSync,
        currentPath,
        navigate,
        selectedPatientId,
        setSelectedPatientId,
        activePrescriptionPrintId,
        setActivePrescriptionPrintId,
        isAddTreatmentOpen,
        setIsAddTreatmentOpen: setAddTreatmentWithSync,
        isAddCategoryOpen,
        setIsAddCategoryOpen: setAddCategoryWithSync,
        packageActiveTab,
        setPackageActiveTab: setPackageTabWithSync,
        isAddPackageOpen,
        setIsAddPackageOpen: setAddPackageWithSync,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
