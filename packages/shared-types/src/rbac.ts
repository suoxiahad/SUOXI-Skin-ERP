export type StaffRole =
  | 'super_admin'
  | 'admin_manager'
  | 'receptionist'
  | 'doctor'
  | 'therapist'
  | 'cashier'
  | 'inventory_manager'
  | 'call_center';

export type PermissionClass = 'general' | 'clinical' | 'financial' | 'sensitive';

export interface AccessContext {
  userId: string;
  username: string;
  roles: string[];
  primaryBranchId: string;
  allBranches: boolean;
  allowedBranchIds: string[];
  effectivePermissions: Set<string>;
  hasPermission(code: string): boolean;
  canAccessBranch(branchId: string): boolean;
}
