// Password hashing with Node's built-in scrypt (memory-hard KDF).
// Format: scrypt:N:r:p:<salt_b64>:<hash_b64>
// The hash column is never written to logs or audit events.

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const N = 16384; // CPU/memory cost
const R = 8;
const P = 1;
const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt:${N}:${R}:${P}:${salt.toString("base64")}:${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split(":");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [, n, r, p, saltB64, hashB64] = parts;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const actual = scryptSync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** Minimal strength policy (documented, configurable later via settings). */
export function passwordPolicyError(password: string): string | null {
  if (password.length < 8) {
    return "رمز باید حداقل ۸ حرف باشد.";
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "رمز باید حداقل یک حرف و یک عدد داشته باشد.";
  }
  return null;
}
