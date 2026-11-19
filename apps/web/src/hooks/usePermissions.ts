/**
 * SUOXI Skin Care & Aesthetic Center CRM
 * Client-Side Permission Hook (Reads real server-resolved permissions from AuthContext)
 *
 * NOTE: UI-level permission checks are for operational convenience and navigation visibility only.
 * Hard security, RBAC enforcement, and branch scoping are strictly enforced on the SERVER (Node.js API).
 */

import { useAuth } from '../context/AuthContext.js';
import type { SessionUserDto } from '@suoxi/shared-types';

export interface UsePermissionsReturn {
  has: (code: string) => boolean;
  hasAny: (codes: string[]) => boolean;
  canAccessBranch: (branchId: string) => boolean;
  role: string;
  roles: string[];
  user: SessionUserDto | null;
}

export function usePermissions(): UsePermissionsReturn {
  const { user, role, roles, effectivePermissions, allBranches, branches } = useAuth();

  const has = (code: string): boolean => {
    if (!user) return false;
    if (roles.includes('super_admin') || roles.includes('admin_manager')) return true;
    if (effectivePermissions.has(code)) return true;

    // Normalize aliases between nav items and backend permissions
    if (code === 'patients:read' && (effectivePermissions.has('patient.view') || effectivePermissions.has('patient.create'))) return true;
    if (code === 'appointments:read' && (effectivePermissions.has('appointment.create') || effectivePermissions.has('appointment.reschedule'))) return true;
    if (code === 'callcenter:calls' && (effectivePermissions.has('call_center.view') || effectivePermissions.has('call_center.attempt'))) return true;
    if (code === 'overview:read') return true;

    return false;
  };

  const hasAny = (codes: string[]): boolean => {
    if (!user) return false;
    if (roles.includes('super_admin')) return true;
    return codes.some((code) => effectivePermissions.has(code));
  };

  const canAccessBranch = (branchId: string): boolean => {
    if (!user) return false;
    if (allBranches || roles.includes('super_admin')) return true;
    return branches.some((b: SessionUserDto['branches'][0]) => b.id === branchId || b.code === branchId);
  };

  return {
    has,
    hasAny,
    canAccessBranch,
    role,
    roles,
    user,
  };
}
