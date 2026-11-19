import crypto from 'node:crypto';
import type { Response } from 'express';
import { getConfig } from '../config/env.js';
import { getCookieName } from './csrf.js';

export const SESSION_COOKIE_NAME = 'suoxi_session';
export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes idle timeout
export const SESSION_ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000; // 12 hours max lifetime

export interface StaffSession {
  id: string;
  sessionHash: string;
  staffUserId: string;
  createdIp: string;
  userAgent: string;
  lastActivityAt: number;
  expiresAt: number;
  revokedAt: number | null;
}

export function hashSessionId(sessionId: string): string {
  return crypto.createHash('sha256').update(sessionId, 'utf8').digest('hex');
}

export interface SessionStore {
  createSession(staffUserId: string, ip: string, userAgent?: string): Promise<{ sessionId: string; session: StaffSession }>;
  getSessionByHash(hash: string): Promise<StaffSession | null>;
  touchSession(hash: string): Promise<void>;
  revokeSession(hash: string): Promise<void>;
  revokeAllUserSessions(staffUserId: string): Promise<void>;
}

/**
 * Isolated in-memory session store double.
 * Note: Persistent MySQL storage requires approval of PACK-PROPOSED staff_sessions table.
 */
export class InMemorySessionStore implements SessionStore {
  private sessions = new Map<string, StaffSession>();

  async createSession(staffUserId: string, ip: string, userAgent = ''): Promise<{ sessionId: string; session: StaffSession }> {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const sessionHash = hashSessionId(sessionId);
    const now = Date.now();

    const session: StaffSession = {
      id: crypto.randomUUID(),
      sessionHash,
      staffUserId,
      createdIp: ip,
      userAgent,
      lastActivityAt: now,
      expiresAt: now + SESSION_ABSOLUTE_TIMEOUT_MS,
      revokedAt: null,
    };

    this.sessions.set(sessionHash, session);
    return { sessionId, session };
  }

  async getSessionByHash(hash: string): Promise<StaffSession | null> {
    const session = this.sessions.get(hash);
    if (!session) return null;
    if (session.revokedAt) return null;

    const now = Date.now();
    // Absolute expiration check
    if (now > session.expiresAt) return null;
    // Idle timeout check
    if (now - session.lastActivityAt > SESSION_IDLE_TIMEOUT_MS) return null;

    return { ...session };
  }

  async touchSession(hash: string): Promise<void> {
    const session = this.sessions.get(hash);
    if (session && !session.revokedAt) {
      session.lastActivityAt = Date.now();
    }
  }

  async revokeSession(hash: string): Promise<void> {
    const session = this.sessions.get(hash);
    if (session) {
      session.revokedAt = Date.now();
    }
  }

  async revokeAllUserSessions(staffUserId: string): Promise<void> {
    const now = Date.now();
    for (const session of this.sessions.values()) {
      if (session.staffUserId === staffUserId) {
        session.revokedAt = now;
      }
    }
  }

  clear(): void {
    this.sessions.clear();
  }
}

let activeSessionStore: SessionStore = new InMemorySessionStore();

export function setSessionStore(store: SessionStore): void {
  activeSessionStore = store;
}

export function getSessionStore(): SessionStore {
  return activeSessionStore;
}

export function setSessionCookie(res: Response, sessionId: string): void {
  const isProd = getConfig().NODE_ENV === 'production';
  const cookieName = getCookieName(SESSION_COOKIE_NAME);

  res.cookie(cookieName, sessionId, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_ABSOLUTE_TIMEOUT_MS,
  });
}
