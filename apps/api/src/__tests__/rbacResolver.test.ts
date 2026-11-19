import {
  resolvePermissions,
  InMemoryRbacRepository,
  setRbacRepository,
} from '../services/permissionResolver.js';
import { requirePermission } from '../middleware/requirePermission.js';
import express from 'express';
import type { Server } from 'node:http';
import { errorHandlerMiddleware } from '../middleware/errorHandler.js';

export async function runRbacTests(): Promise<void> {
  console.log('[TEST-SUITE] Running RBAC & Branch Scope Tests...');

  const repo = new InMemoryRbacRepository();
  setRbacRepository(repo);

  const now = Date.now();
  const futureExpiry = new Date(now + 24 * 60 * 60 * 1000).toISOString();
  const pastExpiry = new Date(now - 1000).toISOString();

  // 1. Setup doctor user with overrides
  repo.setUser({
    userId: 'doc-01',
    username: 'dr_karim',
    primaryBranchId: 'SKC-01',
    allBranches: false,
    allowedBranchIds: ['SKC-01'],
    mustChangePassword: false,
    roles: ['doctor'],
    rolePermissions: [
      'medical_history.view',
      'medical_history.edit',
      'prescription.finalize',
      'billing.discount', // standard doctor has discount in role baseline for this test
    ],
    permissionOverrides: [
      // 1. Unexpired ALLOW override
      {
        permissionCode: 'inventory.adjust',
        isAllow: true,
        expiresAt: futureExpiry,
      },
      // 2. Unexpired DENY override on billing.discount (DENY WINS over role grant)
      {
        permissionCode: 'billing.discount',
        isAllow: false,
        expiresAt: futureExpiry,
      },
      // 3. Expired DENY override on prescription.finalize (should be IGNORED because expired)
      {
        permissionCode: 'prescription.finalize',
        isAllow: false,
        expiresAt: pastExpiry,
      },
    ],
  });

  const context = await resolvePermissions('doc-01', repo);
  if (!context) {
    throw new Error('Failed to resolve context for doc-01');
  }

  // Verification 1: Baseline permission
  if (!context.hasPermission('medical_history.view')) {
    throw new Error('Expected role baseline permission medical_history.view to be granted');
  }
  console.log('  ✓ Role baseline permissions granted');

  // Verification 2: Unexpired allow override
  if (!context.hasPermission('inventory.adjust')) {
    throw new Error('Expected unexpired ALLOW override inventory.adjust to be granted');
  }
  console.log('  ✓ Unexpired ALLOW override grants permission not in base role');

  // Verification 3: DENY WINS over role grant
  if (context.hasPermission('billing.discount')) {
    throw new Error('DENY WINS violation! User has unexpired deny override for billing.discount');
  }
  console.log('  ✓ DENY WINS: Unexpired deny override successfully revoked role permission');

  // Verification 4: Expired override is ignored
  if (!context.hasPermission('prescription.finalize')) {
    throw new Error('Expired DENY override was not ignored!');
  }
  console.log('  ✓ Expired override is safely ignored');

  // Verification 5: Branch scoping (SKC-01 allowed, SKC-02 denied -> 404)
  if (!context.canAccessBranch('SKC-01')) {
    throw new Error('Expected SKC-01 branch to be accessible');
  }
  if (context.canAccessBranch('SKC-02')) {
    throw new Error('SKC-02 branch should not be accessible for non-allBranches user');
  }

  // Test branch-scoped middleware returning HTTP 404 (Rule 2)
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.accessContext = context;
    next();
  });

  app.get(
    '/api/v1/branches/:branchId/records',
    requirePermission('medical_history.view', { branchFrom: 'params', branchKey: 'branchId' }),
    (_req, res) => {
      res.json({ success: true });
    }
  );
  app.use(errorHandlerMiddleware);

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${(address as any).port}`;

  try {
    // Accessible branch returns 200
    const okRes = await fetch(`${baseUrl}/api/v1/branches/SKC-01/records`);
    if (okRes.status !== 200) {
      throw new Error(`Expected 200 for allowed branch, got ${okRes.status}`);
    }

    // Out-of-scope branch returns 404 (Rule 2)
    const deniedRes = await fetch(`${baseUrl}/api/v1/branches/SKC-02/records`);
    if (deniedRes.status !== 404) {
      throw new Error(`Expected 404 for out-of-scope branch, got ${deniedRes.status}`);
    }
    console.log('  ✓ Branch isolation verified: Out-of-scope branch access returns HTTP 404');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
