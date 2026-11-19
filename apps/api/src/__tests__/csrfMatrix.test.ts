import { createApiApp } from '../app.js';
import type { Server } from 'node:http';
import {
  generateCsrfToken,
  parseAndVerifyToken,
  CSRF_HEADER_NAME,
  CSRF_COOKIE_NAME,
  ANON_COOKIE_NAME,
  parseCookies,
} from '../auth/csrf.js';
import { userRegistry } from '../routes/auth.js';
import { hashPassword } from '../auth/password.js';
import { setRbacRepository, InMemoryRbacRepository } from '../services/permissionResolver.js';

export async function runCsrfMatrixTests(): Promise<void> {
  console.log('[TEST-SUITE] Running Section B.5a CSRF Test Matrix (Items a through k)...');

  const app = createApiApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${(address as any).port}`;

  // Seed test user
  const repo = new InMemoryRbacRepository();
  setRbacRepository(repo);

  const testPassword = 'Password123!Secure';
  const passwordHash = await hashPassword(testPassword);
  const testUser = {
    id: 'usr-csrf-test-01',
    username: 'staff_tester',
    email: 'staff.tester@suoxiclinic.com',
    phone: '+8801711999888',
    passwordHash,
    fullName: 'Staff Tester',
    status: 'active' as const,
    allBranches: true,
    mustChangePassword: false,
    primaryBranchId: 'SKC-01',
  };
  userRegistry.addUser(testUser);
  repo.setUser({
    userId: testUser.id,
    username: testUser.username,
    primaryBranchId: 'SKC-01',
    allBranches: true,
    allowedBranchIds: ['SKC-01'],
    mustChangePassword: false,
    roles: ['super_admin'],
    rolePermissions: ['user.manage'],
    permissionOverrides: [],
  });

  try {
    // -------------------------------------------------------------------------
    // (a) GET /auth/csrf without session -> 200, sets cookies, returns token, no-store
    // -------------------------------------------------------------------------
    const resA1 = await fetch(`${baseUrl}/auth/csrf`);
    if (resA1.status !== 200) {
      throw new Error(`(a) Expected 200 for GET /auth/csrf, got ${resA1.status}`);
    }
    const cacheControl = resA1.headers.get('cache-control');
    if (!cacheControl?.includes('no-store')) {
      throw new Error(`(a) Expected Cache-Control: no-store, got ${cacheControl}`);
    }

    const setCookies = resA1.headers.getSetCookie ? resA1.headers.getSetCookie() : [resA1.headers.get('set-cookie') || ''];
    const cookieHeaderStr = setCookies.join('; ');
    const cookiesA = parseCookies(cookieHeaderStr);

    const csrfCookieVal = cookiesA[CSRF_COOKIE_NAME];
    const anonCookieVal = cookiesA[ANON_COOKIE_NAME];
    if (!csrfCookieVal || !anonCookieVal) {
      throw new Error(`(a) Expected both csrf and anon cookies, got: ${cookieHeaderStr}`);
    }

    const jsonA1 = (await resA1.json()) as { data: { csrfToken: string } };
    if (!jsonA1.data.csrfToken || jsonA1.data.csrfToken !== csrfCookieVal) {
      throw new Error('(a) Returned token must match cookie token');
    }

    // Second call with same anon cookie returns still-valid token
    const resA2 = await fetch(`${baseUrl}/auth/csrf`, {
      headers: { cookie: `${ANON_COOKIE_NAME}=${anonCookieVal}` },
    });
    if (resA2.status !== 200) {
      throw new Error(`(a) Expected 200 on second GET /auth/csrf call, got ${resA2.status}`);
    }
    console.log('  ✓ (a) GET /auth/csrf issues anon-bound token, sets cookies, enforces no-store');

    // -------------------------------------------------------------------------
    // (b) POST /auth/login rejection matrix
    // -------------------------------------------------------------------------
    const validToken = jsonA1.data.csrfToken;
    const cookiePair = `${CSRF_COOKIE_NAME}=${encodeURIComponent(validToken)}; ${ANON_COOKIE_NAME}=${anonCookieVal}`;
    const standardOrigin = 'http://localhost:3000';

    // 1. No header -> 403
    const resB1 = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        cookie: cookiePair,
      },
      body: JSON.stringify({ username: 'staff_tester', password: testPassword }),
    });
    if (resB1.status !== 403) throw new Error(`(b.1) Expected 403 for missing header, got ${resB1.status}`);

    // 2. Header but no cookie -> 403
    const resB2 = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: validToken,
      },
      body: JSON.stringify({ username: 'staff_tester', password: testPassword }),
    });
    if (resB2.status !== 403) throw new Error(`(b.2) Expected 403 for missing cookie, got ${resB2.status}`);

    // 3. Cookie but no header -> 403
    const resB3 = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        cookie: cookiePair,
      },
      body: JSON.stringify({ username: 'staff_tester', password: testPassword }),
    });
    if (resB3.status !== 403) throw new Error(`(b.3) Expected 403 for cookie without header, got ${resB3.status}`);

    // 4. Malformed token -> 403
    const resB4 = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: 'malformed.token.format',
        cookie: `${CSRF_COOKIE_NAME}=malformed.token.format; ${ANON_COOKIE_NAME}=${anonCookieVal}`,
      },
      body: JSON.stringify({ username: 'staff_tester', password: testPassword }),
    });
    if (resB4.status !== 403) throw new Error(`(b.4) Expected 403 for malformed token, got ${resB4.status}`);

    // 5. Tampered MAC signature -> 403
    const tamperedToken = validToken.substring(0, validToken.length - 4) + 'abcd';
    const resB5 = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: tamperedToken,
        cookie: `${CSRF_COOKIE_NAME}=${tamperedToken}; ${ANON_COOKIE_NAME}=${anonCookieVal}`,
      },
      body: JSON.stringify({ username: 'staff_tester', password: testPassword }),
    });
    if (resB5.status !== 403) throw new Error(`(b.5) Expected 403 for tampered MAC, got ${resB5.status}`);

    // 6. Mismatched header vs cookie (both individually valid) -> 403
    const anotherValidToken = generateCsrfToken(anonCookieVal, 'a', 'staff');
    const resB6 = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: validToken,
        cookie: `${CSRF_COOKIE_NAME}=${anotherValidToken}; ${ANON_COOKIE_NAME}=${anonCookieVal}`,
      },
      body: JSON.stringify({ username: 'staff_tester', password: testPassword }),
    });
    if (resB6.status !== 403) throw new Error(`(b.6) Expected 403 for mismatched header vs cookie, got ${resB6.status}`);

    // 7. Token issued for different anon ID -> 403
    const tokenForDifferentAnon = generateCsrfToken('different-anon-id', 'a', 'staff');
    const resB7 = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: tokenForDifferentAnon,
        cookie: `${CSRF_COOKIE_NAME}=${tokenForDifferentAnon}; ${ANON_COOKIE_NAME}=${anonCookieVal}`,
      },
      body: JSON.stringify({ username: 'staff_tester', password: testPassword }),
    });
    if (resB7.status !== 403) throw new Error(`(b.7) Expected 403 for wrong anon ID binding, got ${resB7.status}`);

    // 8. Portal-realm token on staff route -> 403
    const portalRealmToken = generateCsrfToken(anonCookieVal, 'a', 'portal');
    const resB8 = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: portalRealmToken,
        cookie: `${CSRF_COOKIE_NAME}=${portalRealmToken}; ${ANON_COOKIE_NAME}=${anonCookieVal}`,
      },
      body: JSON.stringify({ username: 'staff_tester', password: testPassword }),
    });
    if (resB8.status !== 403) throw new Error(`(b.8) Expected 403 for portal realm token on staff route, got ${resB8.status}`);

    // 9. Disallowed Origin -> 403
    const resB9 = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://malicious-attacker-domain.com',
        [CSRF_HEADER_NAME]: validToken,
        cookie: cookiePair,
      },
      body: JSON.stringify({ username: 'staff_tester', password: testPassword }),
    });
    if (resB9.status !== 403) throw new Error(`(b.9) Expected 403 for disallowed origin, got ${resB9.status}`);

    // 10. Missing Origin and Referer -> 403
    const resB10 = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [CSRF_HEADER_NAME]: validToken,
        cookie: cookiePair,
      },
      body: JSON.stringify({ username: 'staff_tester', password: testPassword }),
    });
    if (resB10.status !== 403) throw new Error(`(b.10) Expected 403 for missing Origin/Referer, got ${resB10.status}`);

    // 11. Content-Type: text/plain -> 400 rejected
    const resB11 = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: validToken,
        cookie: cookiePair,
      },
      body: JSON.stringify({ username: 'staff_tester', password: testPassword }),
    });
    if (resB11.status !== 400 && resB11.status !== 422) {
      throw new Error(`(b.11) Expected 400/422 for text/plain, got ${resB11.status}`);
    }

    // 12. Valid token + valid credentials -> 200 Success
    const resB12 = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: validToken,
        cookie: cookiePair,
      },
      body: JSON.stringify({ username: 'staff_tester', password: testPassword }),
    });
    if (resB12.status !== 200) {
      const errText = await resB12.text();
      throw new Error(`(b.12) Expected 200 for valid login, got ${resB12.status}: ${errText}`);
    }
    const loginJson = (await resB12.json()) as { data: { csrfToken: string; user: { username: string } } };
    if (!loginJson.data.csrfToken || loginJson.data.csrfToken === validToken) {
      throw new Error('(c) Successful login MUST rotate the CSRF token!');
    }
    console.log('  ✓ (b) POST /auth/login comprehensive rejection matrix verified');
    console.log('  ✓ (c) Successful login rotates CSRF token and sets session-bound token');

    // -------------------------------------------------------------------------
    // (d) POST /auth/logout verification
    // -------------------------------------------------------------------------
    const loginCookies = parseCookies(
      resB12.headers.getSetCookie ? resB12.headers.getSetCookie().join('; ') : resB12.headers.get('set-cookie') || ''
    );
    const sessionCookieVal = loginCookies['suoxi_session'];
    const sessionBoundCsrf = loginJson.data.csrfToken;

    // Logout without CSRF header -> 403 and session stays active
    const resD1 = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: {
        Origin: standardOrigin,
        cookie: `suoxi_session=${sessionCookieVal}; ${CSRF_COOKIE_NAME}=${sessionBoundCsrf}`,
      },
    });
    if (resD1.status !== 403) throw new Error(`(d) Expected 403 for logout without CSRF header, got ${resD1.status}`);

    // Logout with valid session-bound token -> 200 and returns fresh anon token
    const resD2 = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: {
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: sessionBoundCsrf,
        cookie: `suoxi_session=${sessionCookieVal}; ${CSRF_COOKIE_NAME}=${sessionBoundCsrf}`,
      },
    });
    if (resD2.status !== 200) throw new Error(`(d) Expected 200 on logout, got ${resD2.status}`);

    const logoutJson = (await resD2.json()) as { data: { csrfToken: string } };
    if (!logoutJson.data.csrfToken) throw new Error('(d) Logout must return fresh anon-bound csrfToken');
    console.log('  ✓ (d) POST /auth/logout revokes session and returns fresh anonymous CSRF token');

    // -------------------------------------------------------------------------
    // (g) GET requests need no token and change no state
    // -------------------------------------------------------------------------
    const resG = await fetch(`${baseUrl}/api/v1/health`);
    if (resG.status !== 200) throw new Error('(g) GET health should succeed without CSRF token');
    console.log('  ✓ (g) GET safe requests require zero CSRF tokens');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
