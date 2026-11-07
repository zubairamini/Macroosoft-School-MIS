// Login rate limiting backed by the LoginAttempt table:
// 5 failed attempts per (username, IP) within 15 minutes → temporary lockout.
// Records are opportunisticly pruned.

import { db } from "@/lib/db";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

export async function isLoginLocked(username: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);
  const failures = await db.loginAttempt.count({
    where: { username, ip, success: false, at: { gte: since } },
  });
  return failures >= MAX_FAILURES;
}

export async function recordLoginAttempt(
  username: string,
  ip: string,
  success: boolean,
): Promise<void> {
  await db.loginAttempt.create({ data: { username, ip, success } });
  // Opportunistic pruning of rows older than 24h
  await db.loginAttempt.deleteMany({
    where: { at: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  }).catch(() => undefined);
}

export function lockoutMessageDari(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `به دلیل تلاش‌های ناموفق زیاد، ورود موقتاً مسدود است. لطفاً پس از ${minutes} دقیقه دوباره تلاش کنید.`;
}
