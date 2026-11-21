/**
 * SUOXI Skin Care & Aesthetic Center CRM
 * PostgreSQL Repository: Branches, Users/Staff, Roles, Duty Rosters & Security Logs
 */

import argon2 from 'argon2';
import crypto from 'node:crypto';
import type {
  Branch,
  ClinicRoleDefinition,
  StaffDutyRoster,
  User,
  UserRole,
  UserSecurityLog,
} from '../../src/types/index.ts';
import { pgQuery, withPgTransaction } from '../db/pgPool.ts';
import { pgLogAuditEvent, pgLogSecurityEvent, toDateOnly, toIsoString, toNumber } from './pgHelpers.ts';

function mapBranchRow(row: Record<string, unknown>): Branch {
  return {
    id: String(row.id),
    name: String(row.name),
    nameBn: String(row.name_bn || row.name),
    code: String(row.code),
    address: String(row.address || ''),
    city: String(row.city || 'Dhaka'),
    phone: String(row.phone || ''),
    email: row.email ? String(row.email) : undefined,
    managerName: row.manager_name ? String(row.manager_name) : undefined,
    managerPhone: row.manager_phone ? String(row.manager_phone) : undefined,
    operatingHours: row.operating_hours ? String(row.operating_hours) : undefined,
    isActive: row.is_active !== false,
    createdAt: toIsoString(row.created_at),
  };
}

function mapUserRow(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    employeeId: row.employee_id ? String(row.employee_id) : undefined,
    name: String(row.name),
    nameBn: row.name_bn ? String(row.name_bn) : undefined,
    email: String(row.email),
    role: row.role as UserRole,
    phone: String(row.phone || ''),
    branchId: String(row.branch_id),
    branchName: String(row.branch_name || ''),
    specialization: row.specialization ? String(row.specialization) : undefined,
    bmdcRegNo: row.bmdc_reg_no ? String(row.bmdc_reg_no) : undefined,
    avatarUrl: row.avatar_url ? String(row.avatar_url) : undefined,
    consultationFeeBDT:
      row.consultation_fee_bdt !== null && row.consultation_fee_bdt !== undefined
        ? toNumber(row.consultation_fee_bdt)
        : undefined,
    followUpFeeBDT:
      row.follow_up_fee_bdt !== null && row.follow_up_fee_bdt !== undefined
        ? toNumber(row.follow_up_fee_bdt)
        : undefined,
    roomNumber: row.room_number ? String(row.room_number) : undefined,
    signatureUrl: row.signature_url ? String(row.signature_url) : undefined,
    certifications: Array.isArray(row.certifications) ? (row.certifications as string[]) : undefined,
    shift: (row.shift as User['shift']) || 'full_day',
    status: (row.status as User['status']) || 'active',
    lastLoginAt: row.last_login_at ? toIsoString(row.last_login_at) : undefined,
    createdAt: toIsoString(row.created_at),
    permissions: Array.isArray(row.permissions) ? (row.permissions as string[]) : undefined,
    designation: row.designation ? String(row.designation) : undefined,
  };
}

export const pgOrgRepo = {
  // ---------------------------------------------------------------------------
  // Branches
  // ---------------------------------------------------------------------------
  async listBranches(): Promise<Branch[]> {
    const res = await pgQuery('SELECT * FROM branches ORDER BY created_at ASC');
    return res.rows.map(mapBranchRow);
  },

  async createBranch(
    input: {
      name: string;
      nameBn?: string;
      code: string;
      address?: string;
      city?: string;
      phone: string;
      email?: string;
      managerName?: string;
      managerPhone?: string;
      operatingHours?: string;
    },
    actor: User,
    ipAddress: string
  ): Promise<Branch> {
    const codeUpper = input.code.trim().toUpperCase();
    const id = `br-${codeUpper.toLowerCase()}`;
    return withPgTransaction(async (client) => {
      const existing = await client.query('SELECT id FROM branches WHERE UPPER(code) = $1', [codeUpper]);
      if (existing.rows.length > 0) {
        const err = new Error('A branch with this code already exists') as Error & {
          statusCode?: number;
          code?: string;
        };
        err.statusCode = 400;
        err.code = 'DUPLICATE_CODE';
        throw err;
      }

      const res = await client.query(
        `
        INSERT INTO branches (
          id, code, name, name_bn, address, city, phone, email,
          manager_name, manager_phone, operating_hours, is_active, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE, NOW(), NOW())
        RETURNING *
        `,
        [
          id,
          codeUpper,
          input.name,
          input.nameBn || input.name,
          input.address || '',
          input.city || 'Dhaka',
          input.phone,
          input.email || null,
          input.managerName || null,
          input.managerPhone || null,
          input.operatingHours || '09:00 AM - 08:00 PM (Sat - Thu)',
        ]
      );
      const branch = mapBranchRow(res.rows[0]);
      await pgLogAuditEvent(
        actor,
        'BRANCH_CREATED',
        'branch',
        branch.id,
        `Created new branch center: ${branch.name} (${branch.code})`,
        ipAddress,
        client
      );
      return branch;
    });
  },

  async updateBranch(
    id: string,
    patch: Partial<Branch>,
    actor: User,
    ipAddress: string
  ): Promise<Branch | null> {
    return withPgTransaction(async (client) => {
      const currentRes = await client.query('SELECT * FROM branches WHERE id = $1 FOR UPDATE', [id]);
      if (currentRes.rows.length === 0) return null;
      const cur = mapBranchRow(currentRes.rows[0]);

      const res = await client.query(
        `
        UPDATE branches SET
          name = $2,
          name_bn = $3,
          code = $4,
          address = $5,
          city = $6,
          phone = $7,
          email = $8,
          manager_name = $9,
          manager_phone = $10,
          operating_hours = $11,
          is_active = $12,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [
          id,
          patch.name ?? cur.name,
          patch.nameBn ?? cur.nameBn,
          patch.code ? patch.code.toUpperCase() : cur.code,
          patch.address ?? cur.address,
          patch.city ?? cur.city,
          patch.phone ?? cur.phone,
          patch.email ?? cur.email ?? null,
          patch.managerName ?? cur.managerName ?? null,
          patch.managerPhone ?? cur.managerPhone ?? null,
          patch.operatingHours ?? cur.operatingHours ?? null,
          patch.isActive !== undefined ? patch.isActive : cur.isActive !== false,
        ]
      );
      const updated = mapBranchRow(res.rows[0]);
      await pgLogAuditEvent(
        actor,
        'BRANCH_UPDATED',
        'branch',
        updated.id,
        `Updated branch details for ${updated.name}`,
        ipAddress,
        client
      );
      return updated;
    });
  },

  async toggleBranchStatus(id: string, actor: User, ipAddress: string): Promise<Branch | null> {
    return withPgTransaction(async (client) => {
      const res = await client.query(
        `
        UPDATE branches
        SET is_active = NOT is_active, updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [id]
      );
      if (res.rows.length === 0) return null;
      const branch = mapBranchRow(res.rows[0]);
      await pgLogAuditEvent(
        actor,
        'BRANCH_STATUS_TOGGLED',
        'branch',
        branch.id,
        `Branch ${branch.name} status changed to ${branch.isActive ? 'ACTIVE' : 'INACTIVE'}`,
        ipAddress,
        client
      );
      return branch;
    });
  },

  // ---------------------------------------------------------------------------
  // Users / Staff
  // ---------------------------------------------------------------------------
  async listUsers(filters: {
    branchId?: string;
    role?: string;
    status?: string;
    search?: string;
  }): Promise<User[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.branchId && filters.branchId !== 'all') {
      params.push(filters.branchId);
      conditions.push(`branch_id = $${params.length}`);
    }
    if (filters.role && filters.role !== 'all') {
      params.push(filters.role);
      conditions.push(`role = $${params.length}`);
    }
    if (filters.status && filters.status !== 'all') {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }
    if (filters.search && filters.search.trim()) {
      params.push(`%${filters.search.trim().toLowerCase()}%`);
      const p = `$${params.length}`;
      conditions.push(
        `(LOWER(name) LIKE ${p} OR LOWER(COALESCE(employee_id, '')) LIKE ${p} OR LOWER(COALESCE(name_bn, '')) LIKE ${p} OR LOWER(email) LIKE ${p} OR phone LIKE ${p} OR LOWER(COALESCE(specialization, '')) LIKE ${p} OR LOWER(COALESCE(bmdc_reg_no, '')) LIKE ${p})`
      );
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const res = await pgQuery(`SELECT * FROM users ${where} ORDER BY created_at DESC`, params);
    return res.rows.map(mapUserRow);
  },

  async getUserById(id: string): Promise<User | null> {
    const res = await pgQuery('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows[0] ? mapUserRow(res.rows[0]) : null;
  },

  async createUser(
    input: Partial<User> & { name: string; email: string; role: UserRole; phone: string; password?: string },
    actor: User,
    ipAddress: string
  ): Promise<User> {
    return withPgTransaction(async (client) => {
      const brRes = input.branchId
        ? await client.query('SELECT id, name FROM branches WHERE id = $1', [input.branchId])
        : await client.query('SELECT id, name FROM branches ORDER BY created_at ASC LIMIT 1');
      const branch = brRes.rows[0] || { id: 'br-dhanmondi', name: 'Dhanmondi Main Center' };

      const id = `usr-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex')}`;
      const rawPassword = input.password || `Suoxi@${crypto.randomInt(1000, 9999)}`;
      const passwordHash = await argon2.hash(rawPassword);

      let employeeId = input.employeeId ? input.employeeId.trim().toUpperCase() : '';
      if (!employeeId) {
        const maxRes = await client.query<{ max_num: string | null }>(
          "SELECT MAX(CAST(employee_id AS INTEGER))::text AS max_num FROM users WHERE employee_id ~ '^[0-9]+$'"
        );
        const countRes = await client.query<{ cnt: string }>('SELECT COUNT(*)::text AS cnt FROM users');
        const nextNum = Math.max(Number(maxRes.rows[0]?.max_num || 0), Number(countRes.rows[0]?.cnt || 0)) + 1;
        employeeId = String(nextNum).padStart(4, '0');
      }

      const dupEmp = await client.query('SELECT id FROM users WHERE UPPER(employee_id) = $1 LIMIT 1', [employeeId]);
      if (dupEmp.rows.length > 0) {
        const err = new Error(`Employee ID '${employeeId}' is already assigned to another staff member`) as Error & {
          statusCode?: number;
          code?: string;
        };
        err.statusCode = 409;
        err.code = 'DUPLICATE_EMPLOYEE_ID';
        throw err;
      }

      const res = await client.query(
        `
        INSERT INTO users (
          id, employee_id, name, name_bn, email, password_hash, must_change_password, role, phone,
          branch_id, branch_name, specialization, bmdc_reg_no, consultation_fee_bdt,
          follow_up_fee_bdt, room_number, certifications, shift, status, designation,
          created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14,
          $15, $16, $17::jsonb, $18, 'active', $19,
          NOW(), NOW()
        )
        RETURNING *
        `,
        [
          id,
          employeeId,
          input.name,
          input.nameBn || null,
          input.email.trim().toLowerCase(),
          passwordHash,
          !input.password,
          input.role,
          input.phone,
          branch.id,
          branch.name,
          input.specialization || null,
          input.bmdcRegNo || null,
          input.consultationFeeBDT !== undefined ? Number(input.consultationFeeBDT) : null,
          input.followUpFeeBDT !== undefined ? Number(input.followUpFeeBDT) : null,
          input.roomNumber || null,
          JSON.stringify(Array.isArray(input.certifications) ? input.certifications : []),
          input.shift || 'morning',
          input.designation || null,
        ]
      );

      const created = mapUserRow(res.rows[0]);
      await pgLogSecurityEvent(
        actor,
        'STATUS_CHANGED',
        `Created new staff profile for ${created.name} with role ${created.role}`,
        'success',
        ipAddress,
        'Clinical CRM Console',
        client
      );
      await pgLogAuditEvent(
        actor,
        'USER_CREATED',
        'user',
        created.id,
        `Created staff member ${created.name} (${created.role}) in ${branch.name}`,
        ipAddress,
        client
      );
      return created;
    });
  },

  async updateUser(
    id: string,
    patch: Partial<User>,
    actor: User,
    ipAddress: string
  ): Promise<User | null> {
    return withPgTransaction(async (client) => {
      const existingRes = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [id]);
      if (existingRes.rows.length === 0) return null;
      const cur = mapUserRow(existingRes.rows[0]);

      let branchId = patch.branchId ?? cur.branchId;
      let branchName = cur.branchName;
      if (patch.branchId && patch.branchId !== cur.branchId) {
        const brRes = await client.query('SELECT id, name FROM branches WHERE id = $1', [patch.branchId]);
        if (brRes.rows[0]) {
          branchId = String(brRes.rows[0].id);
          branchName = String(brRes.rows[0].name);
        }
      }

      const nextEmployeeId =
        patch.employeeId !== undefined
          ? patch.employeeId.trim().toUpperCase() || null
          : cur.employeeId ?? null;

      if (nextEmployeeId && nextEmployeeId !== cur.employeeId) {
        const dupEmp = await client.query(
          'SELECT id FROM users WHERE UPPER(employee_id) = $1 AND id <> $2 LIMIT 1',
          [nextEmployeeId, id]
        );
        if (dupEmp.rows.length > 0) {
          const err = new Error(`Employee ID '${nextEmployeeId}' is already assigned to another staff member`) as Error & {
            statusCode?: number;
            code?: string;
          };
          err.statusCode = 409;
          err.code = 'DUPLICATE_EMPLOYEE_ID';
          throw err;
        }
      }

      const nextRole = patch.role ?? cur.role;
      const res = await client.query(
        `
        UPDATE users SET
          employee_id = $2,
          name = $3,
          name_bn = $4,
          email = $5,
          role = $6,
          phone = $7,
          branch_id = $8,
          branch_name = $9,
          specialization = $10,
          bmdc_reg_no = $11,
          consultation_fee_bdt = $12,
          follow_up_fee_bdt = $13,
          room_number = $14,
          certifications = $15::jsonb,
          shift = $16,
          status = $17,
          designation = $18,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [
          id,
          nextEmployeeId,
          patch.name ?? cur.name,
          patch.nameBn !== undefined ? patch.nameBn || null : cur.nameBn || null,
          patch.email ? patch.email.trim().toLowerCase() : cur.email,
          nextRole,
          patch.phone ?? cur.phone,
          branchId,
          branchName,
          patch.specialization !== undefined ? patch.specialization || null : cur.specialization || null,
          patch.bmdcRegNo !== undefined ? patch.bmdcRegNo || null : cur.bmdcRegNo || null,
          patch.consultationFeeBDT !== undefined
            ? Number(patch.consultationFeeBDT)
            : cur.consultationFeeBDT ?? null,
          patch.followUpFeeBDT !== undefined
            ? Number(patch.followUpFeeBDT)
            : cur.followUpFeeBDT ?? null,
          patch.roomNumber !== undefined ? patch.roomNumber || null : cur.roomNumber || null,
          JSON.stringify(
            patch.certifications !== undefined
              ? patch.certifications
              : cur.certifications || []
          ),
          patch.shift ?? cur.shift ?? 'full_day',
          patch.status ?? cur.status ?? 'active',
          patch.designation !== undefined ? patch.designation || null : cur.designation || null,
        ]
      );

      const updated = mapUserRow(res.rows[0]);
      if (cur.role !== updated.role) {
        await pgLogSecurityEvent(
          actor,
          'ROLE_CHANGED',
          `Changed role of ${updated.name} from ${cur.role} to ${updated.role}`,
          'success',
          ipAddress,
          'Clinical CRM Console',
          client
        );
      }
      await pgLogAuditEvent(
        actor,
        'USER_UPDATED',
        'user',
        updated.id,
        `Updated staff profile for ${updated.name}`,
        ipAddress,
        client
      );
      return updated;
    });
  },

  async toggleUserStatus(
    id: string,
    status: 'active' | 'inactive' | 'suspended',
    reason: string | undefined,
    actor: User,
    ipAddress: string
  ): Promise<User | null> {
    return withPgTransaction(async (client) => {
      const res = await client.query(
        'UPDATE users SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *',
        [id, status]
      );
      if (res.rows.length === 0) return null;
      const updated = mapUserRow(res.rows[0]);
      await pgLogSecurityEvent(
        actor,
        'STATUS_CHANGED',
        `Updated account status for ${updated.name} to ${status.toUpperCase()}${reason ? ` (${reason})` : ''}`,
        'success',
        ipAddress,
        'Clinical CRM Console',
        client
      );
      await pgLogAuditEvent(
        actor,
        'USER_STATUS_TOGGLED',
        'user',
        updated.id,
        `Status of ${updated.name} changed to ${status}`,
        ipAddress,
        client
      );
      return updated;
    });
  },

  async resetUserPassword(
    id: string,
    requestedTempPassword: string | undefined,
    actor: User,
    ipAddress: string
  ): Promise<{ user: User; tempPassword: string } | null> {
    return withPgTransaction(async (client) => {
      const tempPassword = requestedTempPassword || `Suoxi@${crypto.randomInt(1000, 9999)}`;
      const hash = await argon2.hash(tempPassword);
      const res = await client.query(
        `
        UPDATE users
        SET password_hash = $2, must_change_password = TRUE, updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [id, hash]
      );
      if (res.rows.length === 0) return null;
      const user = mapUserRow(res.rows[0]);
      await pgLogSecurityEvent(
        actor,
        'PASSWORD_RESET',
        `Administrative temporary password reset issued for ${user.name}`,
        'success',
        ipAddress,
        'Clinical CRM Console',
        client
      );
      await pgLogAuditEvent(
        actor,
        'USER_PASSWORD_RESET',
        'user',
        user.id,
        `Issued administrative password reset for ${user.name}`,
        ipAddress,
        client
      );
      return { user, tempPassword };
    });
  },

  // ---------------------------------------------------------------------------
  // Clinic Roles, Duty Rosters & Security Logs
  // ---------------------------------------------------------------------------
  async listRoles(): Promise<ClinicRoleDefinition[]> {
    const res = await pgQuery(`
      SELECT r.*, COALESCE(u.cnt, 0) AS user_count
      FROM clinic_roles r
      LEFT JOIN (
        SELECT role, COUNT(*)::int AS cnt FROM users GROUP BY role
      ) u ON u.role = r.id
      ORDER BY r.name ASC
    `);
    return res.rows.map((row) => ({
      id: row.id as UserRole,
      name: String(row.name),
      nameBn: row.name_bn ? String(row.name_bn) : undefined,
      description: String(row.description || ''),
      userCount: toNumber(row.user_count, 0),
      permissions: Array.isArray(row.permissions) ? (row.permissions as string[]) : [],
      isSystemRole: row.is_system_role !== false,
    }));
  },

  async updateRole(
    id: string,
    patch: { permissions?: string[]; description?: string },
    actor: User,
    ipAddress: string
  ): Promise<ClinicRoleDefinition | null> {
    return withPgTransaction(async (client) => {
      const existing = await client.query('SELECT * FROM clinic_roles WHERE id = $1 FOR UPDATE', [id]);
      if (existing.rows.length === 0) return null;
      const cur = existing.rows[0];

      const res = await client.query(
        `
        UPDATE clinic_roles
        SET permissions = $2::jsonb, description = $3, updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [
          id,
          JSON.stringify(Array.isArray(patch.permissions) ? patch.permissions : cur.permissions || []),
          patch.description !== undefined ? patch.description : cur.description || '',
        ]
      );

      const cntRes = await client.query('SELECT COUNT(*)::int AS cnt FROM users WHERE role = $1', [id]);
      const row = res.rows[0];
      await pgLogSecurityEvent(
        actor,
        'PERMISSION_OVERRIDE',
        `Updated RBAC permission schema for role ${row.name}`,
        'success',
        ipAddress,
        'Clinical CRM Console',
        client
      );
      await pgLogAuditEvent(
        actor,
        'ROLE_PERMISSIONS_UPDATED',
        'role',
        id,
        `Updated permissions for ${row.name}`,
        ipAddress,
        client
      );

      return {
        id: row.id as UserRole,
        name: String(row.name),
        nameBn: row.name_bn ? String(row.name_bn) : undefined,
        description: String(row.description || ''),
        userCount: toNumber(cntRes.rows[0]?.cnt, 0),
        permissions: Array.isArray(row.permissions) ? (row.permissions as string[]) : [],
        isSystemRole: row.is_system_role !== false,
      };
    });
  },

  async listRosters(filters: { branchId?: string; date?: string; role?: string }): Promise<StaffDutyRoster[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.branchId && filters.branchId !== 'all') {
      params.push(filters.branchId);
      conditions.push(`branch_id = $${params.length}`);
    }
    if (filters.date) {
      params.push(filters.date);
      conditions.push(`duty_date = $${params.length}::date`);
    }
    if (filters.role && filters.role !== 'all') {
      params.push(filters.role);
      conditions.push(`role = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const res = await pgQuery(`SELECT * FROM staff_duty_roster ${where} ORDER BY duty_date DESC, created_at DESC`, params);
    return res.rows.map((r) => ({
      id: String(r.id),
      staffId: String(r.staff_id),
      staffName: String(r.staff_name),
      role: r.role as UserRole,
      branchId: String(r.branch_id),
      branchName: String(r.branch_name || ''),
      date: toDateOnly(r.duty_date),
      shift: r.shift as StaffDutyRoster['shift'],
      roomNumber: r.room_number ? String(r.room_number) : undefined,
      assignedDoctorName: r.assigned_doctor_name ? String(r.assigned_doctor_name) : undefined,
      notes: r.notes ? String(r.notes) : undefined,
    }));
  },

  async upsertRoster(input: {
    staffId: string;
    branchId?: string;
    date: string;
    shift: StaffDutyRoster['shift'];
    roomNumber?: string;
    notes?: string;
    assignedDoctorName?: string;
  }): Promise<{ roster: StaffDutyRoster; created: boolean }> {
    return withPgTransaction(async (client) => {
      const staffRes = await client.query('SELECT id, name, role FROM users WHERE id = $1', [input.staffId]);
      const staff = staffRes.rows[0];
      const brRes = input.branchId
        ? await client.query('SELECT id, name FROM branches WHERE id = $1', [input.branchId])
        : await client.query('SELECT id, name FROM branches ORDER BY created_at ASC LIMIT 1');
      const branch = brRes.rows[0] || { id: 'br-dhanmondi', name: 'Dhanmondi Main Center' };

      const existingRes = await client.query(
        'SELECT * FROM staff_duty_roster WHERE staff_id = $1 AND duty_date = $2::date FOR UPDATE',
        [input.staffId, input.date]
      );

      if (existingRes.rows.length > 0) {
        const cur = existingRes.rows[0];
        const upd = await client.query(
          `
          UPDATE staff_duty_roster
          SET shift = $2, room_number = $3, notes = $4, assigned_doctor_name = $5,
              branch_id = $6, branch_name = $7
          WHERE id = $1
          RETURNING *
          `,
          [
            cur.id,
            input.shift,
            input.roomNumber ?? cur.room_number,
            input.notes ?? cur.notes,
            input.assignedDoctorName ?? cur.assigned_doctor_name,
            branch.id,
            branch.name,
          ]
        );
        const r = upd.rows[0];
        return {
          created: false,
          roster: {
            id: String(r.id),
            staffId: String(r.staff_id),
            staffName: String(r.staff_name),
            role: r.role as UserRole,
            branchId: String(r.branch_id),
            branchName: String(r.branch_name),
            date: toDateOnly(r.duty_date),
            shift: r.shift as StaffDutyRoster['shift'],
            roomNumber: r.room_number ? String(r.room_number) : undefined,
            assignedDoctorName: r.assigned_doctor_name ? String(r.assigned_doctor_name) : undefined,
            notes: r.notes ? String(r.notes) : undefined,
          },
        };
      }

      const id = `rst-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex')}`;
      const ins = await client.query(
        `
        INSERT INTO staff_duty_roster (
          id, staff_id, staff_name, role, branch_id, branch_name, duty_date,
          shift, room_number, assigned_doctor_name, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, $11)
        RETURNING *
        `,
        [
          id,
          input.staffId,
          staff ? String(staff.name) : 'Staff Member',
          staff ? String(staff.role) : 'therapist',
          branch.id,
          branch.name,
          input.date,
          input.shift,
          input.roomNumber || null,
          input.assignedDoctorName || null,
          input.notes || null,
        ]
      );
      const r = ins.rows[0];
      return {
        created: true,
        roster: {
          id: String(r.id),
          staffId: String(r.staff_id),
          staffName: String(r.staff_name),
          role: r.role as UserRole,
          branchId: String(r.branch_id),
          branchName: String(r.branch_name),
          date: toDateOnly(r.duty_date),
          shift: r.shift as StaffDutyRoster['shift'],
          roomNumber: r.room_number ? String(r.room_number) : undefined,
          assignedDoctorName: r.assigned_doctor_name ? String(r.assigned_doctor_name) : undefined,
          notes: r.notes ? String(r.notes) : undefined,
        },
      };
    });
  },

  async listSecurityLogs(filters: { action?: string; status?: string; search?: string }): Promise<UserSecurityLog[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.action && filters.action !== 'all') {
      params.push(filters.action);
      conditions.push(`action = $${params.length}`);
    }
    if (filters.status && filters.status !== 'all') {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }
    if (filters.search && filters.search.trim()) {
      params.push(`%${filters.search.trim().toLowerCase()}%`);
      const p = `$${params.length}`;
      conditions.push(`(LOWER(user_name) LIKE ${p} OR LOWER(details) LIKE ${p} OR ip_address LIKE ${p})`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const res = await pgQuery(
      `SELECT * FROM user_security_logs ${where} ORDER BY occurred_at DESC LIMIT 250`,
      params
    );
    return res.rows.map((r) => ({
      id: String(r.id),
      userId: String(r.user_id),
      userName: String(r.user_name),
      role: r.role as UserRole,
      action: r.action as UserSecurityLog['action'],
      ipAddress: String(r.ip_address || ''),
      deviceInfo: String(r.device_info || ''),
      status: r.status as UserSecurityLog['status'],
      details: String(r.details || ''),
      timestamp: toIsoString(r.occurred_at),
    }));
  },
};
