/**
 * SUOXI Skin Care & Aesthetic Center CRM
 * Client-side RBAC helpers aligned with server/auth/rbacMiddleware.ts
 */

import type { User, UserRole } from '../types/index.ts';

export const CLIENT_ROLE_DEFAULT_PERMISSIONS: Record<UserRole, string[]> = {
  super_admin: ['*'],
  admin_manager: [
    'patients:*',
    'appointments:*',
    'catalog:*',
    'consultations:read',
    'prescriptions:read',
    'sessions:*',
    'billing:*',
    'invoices:*',
    'payments:*',
    'refunds:*',
    'packages:*',
    'inventory:*',
    'suppliers:*',
    'purchase_orders:*',
    'referrals:*',
    'call_center:*',
    'notifications:*',
    'reports:*',
    'users:read',
    'users:update',
    'settings:read',
    'audit:read',
    'files:*',
    'portal_accounts:*',
    'store:*',
  ],
  doctor: [
    'patients:read',
    'patients:update',
    'appointments:read',
    'appointments:update',
    'catalog:read',
    'consultations:*',
    'prescriptions:*',
    'rx_protocols:*',
    'sessions:*',
    'packages:read',
    'files:read',
    'files:upload',
    'reports:read',
    'store:read',
    'store:request',
  ],
  receptionist: [
    'patients:read',
    'patients:create',
    'patients:update',
    'appointments:*',
    'catalog:read',
    'packages:read',
    'invoices:read',
    'call_center:read',
    'call_center:update',
    'files:read',
    'files:upload',
    'portal_accounts:*',
    'store:request',
  ],
  therapist: [
    'patients:read',
    'appointments:read',
    'catalog:read',
    'sessions:*',
    'packages:read',
    'packages:deduct',
    'inventory:read',
    'files:read',
    'files:upload',
    'store:read',
    'store:request',
  ],
  cashier: [
    'patients:read',
    'appointments:read',
    'catalog:read',
    'billing:*',
    'invoices:*',
    'payments:*',
    'refunds:request',
    'packages:read',
    'packages:create',
    'packages:payment',
    'daily_closing:*',
    'referrals:read',
    'referrals:payout',
    'reports:read',
    'store:request',
  ],
  inventory_manager: [
    'inventory:*',
    'suppliers:*',
    'purchase_orders:*',
    'reports:read',
    'store:*',
  ],
  call_center: [
    'patients:read',
    'appointments:read',
    'appointments:create',
    'appointments:update',
    'call_center:*',
    'notifications:read',
    'notifications:send',
    'store:request',
  ],
  patient: [],
};

export function getEffectivePermissions(user: User | null | undefined): string[] {
  if (!user) return [];
  if (user.role === 'super_admin') return ['*'];
  if (Array.isArray(user.permissions) && user.permissions.length > 0) {
    return user.permissions;
  }
  return CLIENT_ROLE_DEFAULT_PERMISSIONS[user.role] || [];
}

export function hasPermission(user: User | null | undefined, required: string): boolean {
  if (!user) return false;
  const granted = getEffectivePermissions(user);
  if (granted.includes('*')) return true;
  if (granted.includes(required)) return true;
  const [domain] = required.split(':');
  if (domain && granted.includes(`${domain}:*`)) return true;
  return false;
}

export function hasAnyPermission(user: User | null | undefined, codes: string[]): boolean {
  if (!user) return false;
  return codes.some((code) => hasPermission(user, code));
}

export function canAccessView(user: User | null | undefined, viewId: string): boolean {
  if (viewId === 'login') return true;
  if (!user) return false;
  if (user.role === 'super_admin') return true;

  switch (viewId) {
    case 'dashboard':
      return (
        user.role !== 'patient' &&
        hasPermission(user, 'reports:read') &&
        hasAnyPermission(user, ['appointments:read', 'billing:read', 'consultations:read'])
      );

    case 'reception-checkin':
    case 'reception':
      return hasPermission(user, 'patients:create') && hasPermission(user, 'appointments:update');

    case 'appointments':
    case 'calendar':
      return hasPermission(user, 'appointments:read');

    case 'call-center':
      return hasAnyPermission(user, ['call_center:read', 'call_center:*']);

    case 'patients':
      return hasPermission(user, 'patients:read');

    case 'treatments':
    case 'treatment-list':
    case 'guidance':
    case 'lifestyle':
      return hasPermission(user, 'catalog:read');

    case 'add-treatment':
    case 'add-category':
      return hasAnyPermission(user, ['catalog:create', 'catalog:*']);

    case 'sessions':
    case 'packages':
    case 'package-list':
      return hasAnyPermission(user, ['packages:read', 'packages:*', 'sessions:*']);

    case 'patient-sessions':
      return hasAnyPermission(user, ['sessions:*', 'sessions:create', 'sessions:update', 'packages:deduct']);

    case 'add-package':
      return hasAnyPermission(user, ['packages:create', 'packages:*']);

    case 'consultation-desk':
    case 'doctor':
    case 'consultations':
      return hasAnyPermission(user, ['consultations:read', 'consultations:create', 'consultations:*']);

    case 'prescription-list':
    case 'prescriptions':
      return hasAnyPermission(user, ['prescriptions:read', 'prescriptions:create', 'prescriptions:*']);

    case 'medical-documents':
    case 'documents':
      return hasAnyPermission(user, ['files:read', 'files:*']);

    case 'rx-protocols':
      return hasAnyPermission(user, ['rx_protocols:*', 'rx_protocols:read', 'rx_protocols:create']);

    case 'billing-counter':
    case 'billing':
    case 'billing-closing':
    case 'billing-sales-report':
    case 'sales-report':
      return hasAnyPermission(user, ['billing:*', 'billing:create', 'daily_closing:*']);

    case 'billing-invoices':
    case 'invoices':
      return hasAnyPermission(user, ['invoices:read', 'invoices:*', 'billing:*']);

    case 'inventory-stock':
    case 'inventory':
      return hasAnyPermission(user, ['inventory:read', 'inventory:*']);

    case 'inventory-products':
    case 'inventory-purchases':
    case 'inventory-adjustments':
    case 'inventory-suppliers':
      return hasAnyPermission(user, ['inventory:*', 'suppliers:*', 'purchase_orders:*']);

    case 'store-stock':
    case 'store':
      return hasAnyPermission(user, ['store:manage', 'store:*']);

    case 'store-requisitions':
      return hasAnyPermission(user, ['store:request', 'store:manage', 'store:*']);

    case 'store-instruments':
      return hasAnyPermission(user, ['store:read', 'store:manage', 'store:*']);

    case 'store-ledger':
      return hasAnyPermission(user, ['store:reports', 'store:manage', 'store:*']);

    case 'referrals':
    case 'referrals-directory':
    case 'referrals-commissions':
      return hasAnyPermission(user, ['referrals:read', 'referrals:*']);

    case 'referrals-rules':
      return hasAnyPermission(user, ['referrals:*', 'referrals:update']);

    case 'referrals-payouts':
      return hasAnyPermission(user, ['referrals:payout', 'referrals:*']);

    case 'integration-sms':
      return hasAnyPermission(user, ['notifications:read', 'notifications:send', 'notifications:*']);

    case 'integration-email':
      return hasPermission(user, 'notifications:*');

    case 'users-staff':
    case 'users':
    case 'users-roles':
    case 'users-security':
      return hasAnyPermission(user, ['users:read', 'users:update', 'users:*']);

    case 'users-doctors':
      return hasAnyPermission(user, ['users:read', 'users:*', 'consultations:*']);

    case 'users-roster':
      return hasAnyPermission(user, ['users:read', 'users:*', 'sessions:*']);

    case 'settings-general':
    case 'settings-access-control':
    case 'settings-security':
    case 'settings-scheduling':
    case 'settings-backup':
    case 'settings':
    case 'audit':
      return hasAnyPermission(user, ['settings:read', 'settings:*', 'audit:read']);

    case 'portal':
      return user.role === 'patient' || hasAnyPermission(user, ['portal_accounts:*', 'portal_accounts:read']);

    default:
      return false;
  }
}

export function resolveEffectiveViewId(params: {
  view: string;
  packageTab?: 'list' | 'sessions' | 'create';
  addTreatment?: boolean;
  addCategory?: boolean;
  addPackage?: boolean;
}): string {
  if (params.view === 'treatments') {
    if (params.addTreatment) return 'add-treatment';
    if (params.addCategory) return 'add-category';
    return 'treatment-list';
  }
  if (params.view === 'sessions') {
    if (params.addPackage || params.packageTab === 'create') return 'add-package';
    if (params.packageTab === 'sessions') return 'patient-sessions';
    return 'package-list';
  }
  return params.view;
}

export function canAccessRouteState(
  user: User | null | undefined,
  params: {
    view: string;
    packageTab?: 'list' | 'sessions' | 'create';
    addTreatment?: boolean;
    addCategory?: boolean;
    addPackage?: boolean;
  }
): boolean {
  return canAccessView(user, resolveEffectiveViewId(params));
}

export function getDefaultHomePathForUser(user: User | null | undefined): string {
  if (!user) return '/login';
  switch (user.role) {
    case 'super_admin':
    case 'admin_manager':
      return '/dashboard';
    case 'doctor':
      return '/consultation/desk';
    case 'receptionist':
      return '/crm/reception';
    case 'therapist':
      return '/packages/sessions';
    case 'cashier':
      return '/billing/counter';
    case 'inventory_manager':
      return '/inventory/stock';
    case 'call_center':
      return '/crm/followups';
    case 'patient':
      return '/portal';
    default:
      return '/crm/appointments';
  }
}

export function canSearchPatients(user: User | null | undefined): boolean {
  return hasPermission(user, 'patients:read');
}

export function canCreatePatient(user: User | null | undefined): boolean {
  return hasPermission(user, 'patients:create');
}

export function canEditPatient(user: User | null | undefined): boolean {
  return hasPermission(user, 'patients:update');
}

export function canBookAppointment(user: User | null | undefined): boolean {
  return hasPermission(user, 'appointments:create');
}

export function canManageBilling(user: User | null | undefined): boolean {
  return hasAnyPermission(user, ['billing:create', 'billing:*']);
}

export function canManageReferrals(user: User | null | undefined): boolean {
  return hasAnyPermission(user, ['referrals:update', 'referrals:*']);
}

export function canManagePortalAccount(user: User | null | undefined): boolean {
  return hasAnyPermission(user, ['portal_accounts:create', 'portal_accounts:*']);
}

export function canManageClinicStore(user: User | null | undefined): boolean {
  return hasAnyPermission(user, ['store:manage', 'store:*']);
}

export function canRequestClinicStore(user: User | null | undefined): boolean {
  return hasAnyPermission(user, ['store:request', 'store:manage', 'store:*']);
}

export function canViewClinicStoreCosts(user: User | null | undefined): boolean {
  return hasAnyPermission(user, ['store:reports', 'store:manage', 'store:*']);
}
