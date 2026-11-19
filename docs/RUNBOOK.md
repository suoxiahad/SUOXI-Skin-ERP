# Operational Runbook — SUOXI CRM

## Encryption & Key Rotation Procedures (ADR-015)

### 1. Overview
SUOXI CRM stores sensitive external credentials (such as VPS/Hosting SMTP passwords and SMS Gateway API keys) exclusively as `AES-256-GCM` ciphertext with authenticated tags.

The credentials are encrypted using `APP_MASTER_KEY` (a 256-bit / 32-byte hexadecimal key) set in the server environment.

```
Credential Encryption Layout:
- Algorithm: AES-256-GCM
- IV / Nonce: 12-byte cryptographically secure random bytes (unique per encryption)
- Auth Tag: 16-byte integrity tag
- Key Version: Integer tracking master key generation (e.g. 1, 2, 3...)
```

### 2. Environment Variables
- `APP_MASTER_KEY`: 64-character hexadecimal string (e.g. `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`).
- `APP_PREVIOUS_MASTER_KEYS`: Comma-separated list of previous keys during zero-downtime rotation: `version:hex_key,version:hex_key` (e.g. `1:abcdef...`).

### 3. Step-by-Step Key Rotation Runbook

When rotating `APP_MASTER_KEY` (e.g., scheduled quarterly rotation or emergency compromise response):

1. **Generate New 256-bit Key**:
   ```bash
   node -e "console.log(crypto.randomBytes(32).toString('hex'))"
   ```

2. **Update Environment on API Servers**:
   - Set current `APP_MASTER_KEY` to `APP_PREVIOUS_MASTER_KEYS="<old_version>:<old_hex_key>"`.
   - Set `APP_MASTER_KEY="<new_hex_key>"`.
   - Set `APP_MASTER_KEY_VERSION="<new_version>"`.

3. **Run Re-Encryption Maintenance Script**:
   Execute the migration script to re-encrypt all stored credentials in `integration_configurations`:
   ```bash
   npm run rotate-keys
   ```
   The script:
   - Queries all rows in `integration_configurations` where `credential_key_version < CURRENT_VERSION`.
   - Decrypts existing ciphertext using the matching previous key version.
   - Re-encrypts using the new master key, generating a fresh IV and auth tag.
   - Updates `credential_ciphertext`, `credential_iv`, `credential_auth_tag`, and sets `credential_key_version = CURRENT_VERSION`.
   - Logs an audited event in `audit_events`: `system.key_rotation.completed`.

4. **Retire Old Key**:
   Once all rows are migrated, remove `APP_PREVIOUS_MASTER_KEYS` from the server environment.

---

## SSRF Defense Runbook for Webhooks and HTTP Adapters

1. **Protocol Check**: Only `https://` is permitted. `http://`, `ftp://`, and `file://` are strictly rejected.
2. **Pre-Flight DNS Resolution**: The hostname is resolved to IPv4 and IPv6 addresses before connecting.
3. **Blacklisted IP Ranges**:
   - `127.0.0.0/8` (Loopback)
   - `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` (RFC 1918 Private)
   - `169.254.169.254` (Cloud Metadata / Link Local)
   - `::1`, `fc00::/7`, `fe80::/10` (IPv6 loopback & ULA)
   - Hostnames matching `localhost`, `*.internal`, `*.local`.
4. **Timeouts & Limits**: Max timeout 5,000 ms. Max response body 1 MB. Redirects to blacklisted IPs are blocked.
