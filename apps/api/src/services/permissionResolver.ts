import type { AccessContext, StaffRole } from '@suoxi/shared-types';

export interface UserPermissionOverride {
  permissionCode: string;
  isAllow: boolean;
  expiresAt: Date | string | null;
}

export interface UserRbacData {
  userId: string;
  username: string;
  primaryBranchId: string;
  allBranches: boolean;
  allowedBranchIds: string[];
  mustChangePassword: boolean;
  roles: StaffRole[];
  rolePermissions: string[];
  permissionOverrides: UserPermissionOverride[];
}

export interface RbacRepository {
  getUserRbacData(userId: string): Promise<UserRbacData | null>;
}

export class InMemoryRbacRepository implements RbacRepository {
  private users = new Map<string, UserRbacData>();

  setUser(data: UserRbacData): void {
    this.users.set(data.userId, data);
  }

  async getUserRbacData(userId: string): Promise<UserRbacData | null> {
    const user = this.users.get(userId);
    return user ? JSON.parse(JSON.stringify(user)) : null;
  }
}

let activeRbacRepo: RbacRepository = new InMemoryRbacRepository();

export function setRbacRepository(repo: RbacRepository): void {
  activeRbacRepo = repo;
}

export function getRbacRepository(): RbacRepository {
  return activeRbacRepo;
}

/**
 * Resolves active permissions, user allow/deny overrides, and branch scoping.
 * 
 * Rules:
 * 1. Role permissions form the baseline.
 * 2. Unexpired allow overrides grant permissions not in roles.
 * 3. Unexpired deny overrides strictly revoke permissions ("DENY WINS").
 * 4. Expired overrides are ignored.
 * 5. Branch scoping restricts queries to allowed branches unless allBranches is true.
 */
export async function resolvePermissions(
  userId: string,
  repo: RbacRepository = activeRbacRepo
): Promise<AccessContext | null> {
  const data = await repo.getUserRbacData(userId);
  if (!data) return null;

  const effective = new Set<string>();
  const now = new Date().getTime();

  // 1. Add role-based permissions
  for (const perm of data.rolePermissions) {
    effective.add(perm);
  }

  // 2. Separate allow and deny overrides
  const allows: string[] = [];
  const denies: string[] = [];

  for (const override of data.permissionOverrides) {
    if (override.expiresAt) {
      const expTime = new Date(override.expiresAt).getTime();
      if (expTime <= now) {
        // Expired override is ignored
        continue;
      }
    }

    if (override.isAllow) {
      allows.push(override.permissionCode);
    } else {
      denies.push(override.permissionCode);
    }
  }

  // 3. Apply allows
  for (const code of allows) {
    effective.add(code);
  }

  // 4. Apply denies: DENY ALWAYS WINS
  for (const code of denies) {
    effective.delete(code);
  }

  const allowedBranchSet = new Set(data.allowedBranchIds);
  if (data.primaryBranchId) {
    allowedBranchSet.add(data.primaryBranchId);
  }

  return {
    userId: data.userId,
    username: data.username,
    roles: data.roles,
    primaryBranchId: data.primaryBranchId,
    allBranches: data.allBranches,
    allowedBranchIds: Array.from(allowedBranchSet),
    effectivePermissions: effective,
    hasPermission(code: string): boolean {
      if (data.roles.includes('super_admin') && !denies.includes(code)) {
        return true;
      }
      return effective.has(code);
    },
    canAccessBranch(branchId: string): boolean {
      if (data.allBranches || data.roles.includes('super_admin')) {
        return true;
      }
      return allowedBranchSet.has(branchId);
    },
  };
}
