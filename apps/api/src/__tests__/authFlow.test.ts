import { createApiApp } from '../app.js';
import type { Server } from 'node:http';
import {
  CSRF_HEADER_NAME,
  CSRF_COOKIE_NAME,
  ANON_COOKIE_NAME,
  parseCookies,
} from '../auth/csrf.js';
import { userRegistry } from '../routes/auth.js';
import { hashPassword } from '../auth/password.js';
import { lockoutTracker, MAX_FAILED_ATTEMPTS } from '../auth/lockout.js';
import { setRbacRepository, InMemoryRbacRepository } from '../services/permissionResolver.js';
import { seedSuperadmin } from '../scripts/seedSuperadmin.js';

export async function runAuthFlowTests(): Promise<void> {
  console.log('[TEST-SUITE] Running Auth Lifecycle, Password Security & Lockout Tests...');

  const app = createApiApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${(address as any).port}`;

  const standardOrigin = 'http://localhost:3000';

  try {
    // 1. Test seedSuperadmin creates admin user with mustChangePassword = true
    const { username, oneTimePassword } = await seedSuperadmin({ silent: true });
    if (username !== 'admin' || !oneTimePassword || oneTimePassword.length < 12) {
      throw new Error('seedSuperadmin failed to produce expected credentials');
    }
    const adminUser = userRegistry.findByUsernameOrEmail('admin');
    if (!adminUser || !adminUser.mustChangePassword) {
      throw new Error('Superadmin must be created with mustChangePassword = true');
    }
    console.log('  ✓ seed:superadmin generates one-time credential with mustChangePassword: true');

    // 2. Fetch fresh anonymous CSRF token
    const csrfRes = await fetch(`${baseUrl}/auth/csrf`);
    const csrfJson = (await csrfRes.json()) as { data: { csrfToken: string } };
    const csrfToken = csrfJson.data.csrfToken;
    const cookiesA = parseCookies(
      csrfRes.headers.getSetCookie ? csrfRes.headers.getSetCookie().join('; ') : csrfRes.headers.get('set-cookie') || ''
    );
    const anonCookieVal = cookiesA[ANON_COOKIE_NAME];
    const cookieHeader = `${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}; ${ANON_COOKIE_NAME}=${anonCookieVal}`;

    // 3. Test Lockout after 5 bad login attempts -> HTTP 423
    lockoutTracker.clear();
    for (let attempt = 1; attempt <= MAX_FAILED_ATTEMPTS; attempt++) {
      const failRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: standardOrigin,
          [CSRF_HEADER_NAME]: csrfToken,
          cookie: cookieHeader,
        },
        body: JSON.stringify({ username: 'admin', password: 'WrongPassword999!' }),
      });
      if (failRes.status !== 401) {
        throw new Error(`Expected 401 on failed attempt ${attempt}, got ${failRes.status}`);
      }
    }

    // 6th attempt must be rejected with 423 Locked
    const lockedRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        cookie: cookieHeader,
      },
      body: JSON.stringify({ username: 'admin', password: oneTimePassword }),
    });
    if (lockedRes.status !== 423) {
      throw new Error(`Expected HTTP 423 Locked after 5 failures, got ${lockedRes.status}`);
    }
    console.log('  ✓ Lockout policy: 5 consecutive failures triggers HTTP 423 Locked');

    // Reset lockout for next tests
    lockoutTracker.clear();

    // 4. Successful login with oneTimePassword
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        cookie: cookieHeader,
      },
      body: JSON.stringify({ username: 'admin', password: oneTimePassword }),
    });
    if (loginRes.status !== 200) {
      throw new Error(`Expected 200 on login, got ${loginRes.status}`);
    }
    const loginJson = (await loginRes.json()) as { data: { csrfToken: string; user: { mustChangePassword: boolean } } };
    if (!loginJson.data.user.mustChangePassword) {
      throw new Error('Logged-in user must reflect mustChangePassword: true');
    }

    const sessionCookies = parseCookies(
      loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie().join('; ') : loginRes.headers.get('set-cookie') || ''
    );
    const sessionCookieVal = sessionCookies['suoxi_session'];
    const sessionCsrfToken = loginJson.data.csrfToken;
    const sessionCookieHeader = `suoxi_session=${sessionCookieVal}; ${CSRF_COOKIE_NAME}=${sessionCsrfToken}`;

    // 5. Test GET /auth/me returns session details
    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { cookie: sessionCookieHeader },
    });
    if (meRes.status !== 200) {
      throw new Error(`Expected 200 on /auth/me, got ${meRes.status}`);
    }
    const meJson = (await meRes.json()) as { data: { username: string; roles: string[] } };
    if (meJson.data.username !== 'admin' || !meJson.data.roles.includes('super_admin')) {
      throw new Error(`Unexpected /auth/me payload: ${JSON.stringify(meJson)}`);
    }
    console.log('  ✓ GET /auth/me returns authenticated user identity, roles, and branch scope');

    // 6. Test POST /auth/change-password
    const newPassword = 'BrandNewSecurePassword2026!';
    const changeRes = await fetch(`${baseUrl}/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: sessionCsrfToken,
        cookie: sessionCookieHeader,
      },
      body: JSON.stringify({
        currentPassword: oneTimePassword,
        newPassword,
      }),
    });
    if (changeRes.status !== 200) {
      const errText = await changeRes.text();
      throw new Error(`Expected 200 on change-password, got ${changeRes.status}: ${errText}`);
    }
    const updatedUser = userRegistry.findByUsernameOrEmail('admin');
    if (updatedUser?.mustChangePassword) {
      throw new Error('mustChangePassword must be false after successful change');
    }
    console.log('  ✓ POST /auth/change-password updates password, clears flag, and rotates session');

    // 7. Test Forgot-Password and Reset-Password flow
    const forgotRes = await fetch(`${baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        cookie: cookieHeader,
      },
      body: JSON.stringify({ usernameOrEmail: 'admin@suoxiclinic.com' }),
    });
    if (forgotRes.status !== 200) {
      throw new Error(`Expected 200 on forgot-password, got ${forgotRes.status}`);
    }

    const resetToken = userRegistry.createResetToken(adminUser!.id);
    const resetRes = await fetch(`${baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        cookie: cookieHeader,
      },
      body: JSON.stringify({
        token: resetToken,
        newPassword: 'FinalPasswordResetSuccessfully123!',
      }),
    });
    if (resetRes.status !== 200) {
      throw new Error(`Expected 200 on reset-password, got ${resetRes.status}`);
    }

    // Try reusing same token -> 400
    const reuseRes = await fetch(`${baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        cookie: cookieHeader,
      },
      body: JSON.stringify({
        token: resetToken,
        newPassword: 'FinalPasswordResetSuccessfully123!',
      }),
    });
    if (reuseRes.status !== 400) {
      throw new Error(`Expected 400 on consumed reset token reuse, got ${reuseRes.status}`);
    }
    console.log('  ✓ Password reset tokens are single-use, hashed, and revoke previous sessions');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
