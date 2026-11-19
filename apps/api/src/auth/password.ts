import argon2 from 'argon2';

// Pre-computed static dummy hash for constant-time verification when user is not found
// Generated with argon2id to ensure identical computational latency
let STATIC_DUMMY_HASH: string | null = null;

async function getDummyHash(): Promise<string> {
  if (!STATIC_DUMMY_HASH) {
    STATIC_DUMMY_HASH = await argon2.hash('__suoxi_static_dummy_timing_defense__', {
      type: argon2.argon2id,
      memoryCost: 19456, // 19 MiB
      timeCost: 2,
      parallelism: 1,
    });
  }
  return STATIC_DUMMY_HASH;
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456, // OWASP recommended minimum for Argon2id
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, plaintext: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plaintext);
  } catch {
    return false;
  }
}

/**
 * Executes a genuine Argon2id verification against a dummy hash
 * to prevent username enumeration via timing attacks.
 */
export async function verifyDummyPassword(plaintext: string): Promise<boolean> {
  const dummyHash = await getDummyHash();
  try {
    await argon2.verify(dummyHash, plaintext);
  } catch {
    // Ignore error
  }
  return false;
}
