# SUOXI Skin ERP — Security Audit & Hardening Report

## 1. CRITICAL OWNER ACTION REQUIRED (Secret Rotation)

During the security audit of the legacy codebase, two live/hardcoded external integration credentials were discovered embedded in source files (a hardcoded SMS gateway API key in `server.ts` and `SMSGatewayView.tsx`, and a hardcoded SMTP mail password in `server.ts` and `EmailGatewayView.tsx`).

- **Remediation Completed in Code:** Both hardcoded credentials have been **completely removed** from backend and frontend source code and replaced with server-side AES-256-GCM encrypted storage (`enc:v1:...`) and masked API responses (`••••`).
- **Mandatory Immediate Owner Action:** Because those credentials previously existed in git history and client bundles, the clinic owner **MUST immediately revoke and rotate**:
  1. The SMS gateway API key at the SMS provider dashboard, then enter the new key via Settings → SMS Gateway (stored encrypted in PostgreSQL).
  2. The SMTP email account password / app password at the mail provider, then enter the new password via Settings → Email Gateway (stored encrypted in PostgreSQL).

---

## 2. Production Startup Security Gate (Fail Closed)

Implemented in `server/config/securityConfig.ts` (`assertProductionSecurityOrThrow()`), invoked at startup by both `server.ts` and `server/worker.ts`.

When `NODE_ENV=production`, startup **aborts with non-zero exit** if any of the following fail:
1. `DATABASE_URL` is missing, does not start with `postgres://` or `postgresql://`, or points to MySQL (`mysql://` / `mysql2://`).
2. `SESSION_SECRET` is missing, shorter than 32 characters, or contains weak/placeholder text (`dev`, `changeme`, `default`, `secret`, `test`).
3. `APP_MASTER_KEY` is missing, shorter than 32 characters, or weak/placeholder.
4. `ENABLE_DEMO_ROLE_SWITCHER=true` is set (demo role switching is unconditionally forbidden in production).
5. `PORTAL_TOKEN_SECRET` (if set) is shorter than 32 characters.

---

## 3. Vulnerabilities Identified & Remediated

| # | Severity | Finding | Remediation Implemented | Verification |
|---|---|---|---|---|
| 1 | **Critical** | Hardcoded SMS API key & SMTP password in `server.ts` and frontend React components (`SMSGatewayView.tsx`, `EmailGatewayView.tsx`) | Removed all hardcoded secrets from server & client; encrypted credentials at rest in PostgreSQL via AES-256-GCM (`enc:v1:...`); masked secrets on all GET/PUT responses (`maskSecret()`); masked inputs preserved on update without overwriting ciphertext | Verified via grep (0 matches) + Test 10 in `test:pg` |
| 2 | **Critical** | Unauthenticated `super_admin` fallback in `apps/api/src/middleware/requireAuth.ts` | Removed dev auto-login fallback completely; missing/invalid cookies now strictly throw `UnauthorizedError (401)` | Verified via `portalFlow.test.ts` & `securityHardeningPass.test.ts` (27/27 pass) |
| 3 | **Critical** | Prototype/in-memory routes & demo role switcher reachable in production | Added `NODE_ENV=production` fail-closed 404 barrier after PostgreSQL routes in `server.ts`; blocked `/api/v1/auth/switch-role` with `403` in production; `healthz` reports `allowRoleSwitcher: false` | Verified via Test 4 & Test 11 in `test:pg` |
| 4 | **High** | Process-memory CSRF tokens, Idempotency keys & brute-force login lockout lost on restart and unshared across PM2 workers | Migrated all three to PostgreSQL (`csrf_tokens`, `idempotency_keys`, `login_attempts`) with optional Redis acceleration in `pgSecurityStoreRepo.ts`; removed `'fallback-csrf-token'` in `src/api/client.ts` | Verified via Test 5 & Test 11 in `test:pg` |
| 5 | **High** | Cross-branch IDOR & missing RBAC enforcement on core/ops endpoints | Implemented `server/auth/rbacMiddleware.ts` (`resolveEffectivePermissions`, `canUserAccessBranch`, `resolveAuthorizedBranchScope`, `requireRoles`, `requirePermission`) and applied across `pgCoreRoutes`, `pgOpsRoutes`, `pgExtendedRoutes` | Verified via Test 11 (Dhanmondi receptionist accessing Gulshan patient → `403`; audit log → `403`) |
| 6 | **High** | Patient Portal & Staff session confusion risk | Isolated `patient_portal_accounts` + `patient_portal_sessions` (`portal_sid` cookie) from staff `active_sessions` (`suoxi_sid` cookie); strict mutual rejection (`401`) on cross-realm cookie reuse | Verified via Test 11 in `test:pg` & `portalFlow.test.ts` |
| 7 | **High** | File upload MIME spoofing & path traversal risks | Added binary magic-byte validation (PNG, JPEG, WEBP, PDF) in `localFileStorage.ts`; randomized UUID storage paths; authenticated streaming endpoint `/api/v1/files/view` with branch/confidentiality checks and path containment verification | Verified via Test 10 & Test 11 (`../../etc/passwd` rejected; shell script pretending to be `.png` rejected) |
| 8 | **Medium** | CSV formula injection on exported reports | Implemented `sanitizeCsvCell()` prefixing leading `=`, `+`, `-`, `@`, `\t`, `\r` with `'` and proper RFC 4180 quoting in `securityConfig.ts` and `pgNotificationsReportsRepo.ts` | Verified via Test 10 in `test:pg` |
| 9 | **Medium** | Nested `pgQuery()` inside `withPgTransaction()` causing connection-pool deadlock under concurrency | Audited all repositories; passed active transaction `client` to `findPatientByIdentifier()` in `pgPatientClinicalRepo.ts` and moved pre-read outside transaction in `pgOpsSettingsRepo.ts` | Verified via concurrent Test 8 in `test:pg` |
| 10 | **Medium** | Missing/weak HTTP security headers & permissive CORS | Disabled `x-powered-by`, enabled `trust proxy`, set `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Strict-Transport-Security` (in prod), and strict `CORS_ORIGIN` allowlist | Verified via Test 11 in `test:pg` |

---

## 4. Cryptography & Secret Management

- **Passwords:** Argon2id (`memoryCost: 65536`, `timeCost: 3`, `parallelism: 1`) for both staff (`users`) and patients (`patient_portal_accounts`).
- **Session & Reset Tokens:** 256-bit cryptographically random opaque tokens stored as SHA-256 hashes (or session IDs) in PostgreSQL; HTTP-only, `SameSite=Lax`, `Secure` in production.
- **At-Rest Integration & Payout Secrets:** AES-256-GCM using a 32-byte key derived via SHA-256 from `APP_MASTER_KEY` (12-byte random IV + 16-byte authentication tag, serialized as `enc:v1:<iv>:<tag>:<ciphertext>`).
- **Webhook Verification:** Constant-time HMAC-SHA256 verification via `crypto.timingSafeEqual` (`verifyHmacSignature()`).
- **Log Redaction:** `redactSensitiveObject()` scrubs `password`, `token`, `secret`, `apiKey`, `smtpPass`, `cookie`, and `authorization` keys before structured logging.
