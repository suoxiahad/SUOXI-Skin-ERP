import { AppError } from '../middleware/errorHandler.js';

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

interface AttemptRecord {
  count: number;
  lastAttemptAt: number;
  lockedUntil: number | null;
}

export class LockoutTracker {
  private userAttempts = new Map<string, AttemptRecord>();
  private ipAttempts = new Map<string, AttemptRecord>();

  private getKey(val: string): string {
    return val.toLowerCase().trim();
  }

  isLocked(username: string, ip: string): { locked: boolean; retryAfterSeconds?: number } {
    const now = Date.now();
    const userKey = this.getKey(username);
    const ipKey = this.getKey(ip);

    const userRec = this.userAttempts.get(userKey);
    if (userRec?.lockedUntil && now < userRec.lockedUntil) {
      return {
        locked: true,
        retryAfterSeconds: Math.ceil((userRec.lockedUntil - now) / 1000),
      };
    }

    const ipRec = this.ipAttempts.get(ipKey);
    if (ipRec?.lockedUntil && now < ipRec.lockedUntil) {
      return {
        locked: true,
        retryAfterSeconds: Math.ceil((ipRec.lockedUntil - now) / 1000),
      };
    }

    return { locked: false };
  }

  recordFailure(username: string, ip: string): void {
    const now = Date.now();
    const userKey = this.getKey(username);
    const ipKey = this.getKey(ip);

    // Update username record
    const userRec = this.userAttempts.get(userKey) || { count: 0, lastAttemptAt: now, lockedUntil: null };
    // Reset count if last attempt was older than lockout window
    if (now - userRec.lastAttemptAt > LOCKOUT_DURATION_MS) {
      userRec.count = 0;
      userRec.lockedUntil = null;
    }
    userRec.count += 1;
    userRec.lastAttemptAt = now;
    if (userRec.count >= MAX_FAILED_ATTEMPTS) {
      userRec.lockedUntil = now + LOCKOUT_DURATION_MS;
    }
    this.userAttempts.set(userKey, userRec);

    // Update IP record
    const ipRec = this.ipAttempts.get(ipKey) || { count: 0, lastAttemptAt: now, lockedUntil: null };
    if (now - ipRec.lastAttemptAt > LOCKOUT_DURATION_MS) {
      ipRec.count = 0;
      ipRec.lockedUntil = null;
    }
    ipRec.count += 1;
    ipRec.lastAttemptAt = now;
    if (ipRec.count >= MAX_FAILED_ATTEMPTS * 2) {
      ipRec.lockedUntil = now + LOCKOUT_DURATION_MS;
    }
    this.ipAttempts.set(ipKey, ipRec);
  }

  recordSuccess(username: string, ip: string): void {
    this.userAttempts.delete(this.getKey(username));
    this.ipAttempts.delete(this.getKey(ip));
  }

  clear(): void {
    this.userAttempts.clear();
    this.ipAttempts.clear();
  }
}

export const lockoutTracker = new LockoutTracker();

export function checkLockout(username: string, ip: string): void {
  const status = lockoutTracker.isLocked(username, ip);
  if (status.locked) {
    throw new AppError(
      423,
      'ACCOUNT_LOCKED',
      `Account temporarily locked due to consecutive failed login attempts. Please try again in ${status.retryAfterSeconds} seconds.`
    );
  }
}
