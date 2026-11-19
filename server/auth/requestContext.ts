/**
 * SUOXI Skin Care & Aesthetic Center CRM
 * Per-Request Auth Context via Node.js AsyncLocalStorage
 *
 * Ensures concurrent staff users (Doctor, Receptionist, Cashier, Admin) on VPS
 * always resolve their own authenticated `User` across all repositories and audit logs.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { User } from '../../src/types/index.ts';

interface RequestAuthStore {
  user?: User;
  sessionId?: string;
}

const authStorage = new AsyncLocalStorage<RequestAuthStore>();

export function runWithAuthContext<T>(store: RequestAuthStore, fn: () => T): T {
  return authStorage.run(store, fn);
}

export function getRequestAuthUser(): User | undefined {
  return authStorage.getStore()?.user;
}

export function getRequestSessionId(): string | undefined {
  return authStorage.getStore()?.sessionId;
}
