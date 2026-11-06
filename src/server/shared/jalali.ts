// Solar Hijri (Jalali) date utilities with Afghan month names and the
// Asia/Kabul context. Date-only values are ISO "YYYY-MM-DD" strings —
// no timezone conversion is ever applied to them.
//
// Afghan (Solar Hijri) month names:
//   حمل، ثور، جوزا، سرطان، اسد، سنبله، میزان، عقرب، قوس، جدی، دلو، حوت

import { toJalaali, toGregorian, jalaaliMonthLength } from "jalaali-js";
import { isValidIsoDateOnly, toLatinDigits, toPersianDigits } from "./normalization";

export const AFGHAN_MONTHS = [
  "حمل",
  "ثور",
  "جوزا",
  "سرطان",
  "اسد",
  "سنبله",
  "میزان",
  "عقرب",
  "قوس",
  "جدی",
  "دلو",
  "حوت",
] as const;

export const WEEKDAY_NAMES_DARI = [
  "شنبه",
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنجشنبه",
  "جمعه",
] as const;

export interface JalaliDate {
  jy: number;
  jm: number;
  jd: number;
}

/** ISO date-only ("YYYY-MM-DD") → Jalali parts. */
export function isoToJalali(iso: string): JalaliDate {
  if (!isValidIsoDateOnly(iso)) {
    throw new Error(`Invalid date-only value: ${iso}`);
  }
  const [gy, gm, gd] = iso.split("-").map(Number);
  return toJalaali(gy, gm, gd);
}

/** Jalali parts → ISO date-only. */
export function jalaliToIso(j: JalaliDate): string {
  const g = toGregorian(j.jy, j.jm, j.jd);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`;
}

export function jalaliMonthLength(jy: number, jm: number): number {
  return jalaaliMonthLength(jy, jm);
}

/** "۱۴ عقرب ۱۴۰۵" (Persian digits, Afghan month names). */
export function formatJalali(iso: string | null | undefined): string {
  if (!iso) return "—";
  const j = isoToJalali(iso);
  return `${toPersianDigits(j.jd)} ${AFGHAN_MONTHS[j.jm - 1]} ${toPersianDigits(j.jy)}`;
}

/** "۱۴۰۵/۰۸/۱۴" — compact numeric form. */
export function formatJalaliNumeric(iso: string | null | undefined): string {
  if (!iso) return "—";
  const j = isoToJalali(iso);
  const pad = (n: number) => toPersianDigits(String(n).padStart(2, "0"));
  return `${toPersianDigits(j.jy)}/${pad(j.jm)}/${pad(j.jd)}`;
}

/** Instant (UTC) → Jalali date in Asia/Kabul (UTC+04:30, no DST). */
export function instantToJalali(instant: Date): JalaliDate {
  const kabulMs = instant.getTime() + 4.5 * 60 * 60 * 1000;
  const d = new Date(kabulMs);
  const iso = d.toISOString().slice(0, 10);
  return isoToJalali(iso);
}

export function formatInstantJalaliDateTime(
  instant: Date | string | null | undefined,
): string {
  if (!instant) return "—";
  const d0 = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(d0.getTime())) return "—";
  const kabulMs = d0.getTime() + 4.5 * 60 * 60 * 1000;
  const d = new Date(kabulMs);
  const j = instantToJalali(d0);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${toPersianDigits(j.jd)} ${AFGHAN_MONTHS[j.jm - 1]} ${toPersianDigits(j.jy)} — ${toPersianDigits(`${hh}:${mm}`)}`;
}

export function jalaliWeekdayName(iso: string): string {
  // JS getUTCDay: 0=Sunday..6=Saturday → Afghan week starts Saturday (6=شنبه)
  const d = new Date(`${iso}T00:00:00Z`);
  const map = [1, 2, 3, 4, 5, 6, 0]; // Sunday→یکشنبه(1) ... Saturday→شنبه(0)
  return WEEKDAY_NAMES_DARI[map[d.getUTCDay()]];
}

/**
 * Parse user input that may be Latin/Persian digits with / - . separators
 * into {jy, jm, jd}. Throws with a Dari message on invalid input.
 */
export function parseJalaliInput(raw: string): JalaliDate {
  const normalized = toLatinDigits(raw).replace(/[-.]/g, "/").trim();
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length !== 3) {
    throw new Error("تاریخ را به شکل سال/ماه/روز وارد کنید، مثلاً ۱۴۰۵/۰۸/۱۵");
  }
  const [jy, jm, jd] = parts.map(Number);
  if (!jy || !jm || !jd || jm < 1 || jm > 12 || jd < 1 || jd > 31) {
    throw new Error("تاریخ واردشده معتبر نیست.");
  }
  if (jd > jalaliMonthLength(jy, jm)) {
    throw new Error("این ماه روز بیشتری ندارد؛ تاریخ را بررسی کنید.");
  }
  // Round-trip validation catches impossible Gregorian conversions.
  const iso = jalaliToIso({ jy, jm, jd });
  const back = isoToJalali(iso);
  if (back.jy !== jy || back.jm !== jm || back.jd !== jd) {
    throw new Error("تاریخ واردشده معتبر نیست.");
  }
  return { jy, jm, jd };
}

/** Today in Asia/Kabul as ISO date-only. */
export function todayIsoKabul(): string {
  const now = new Date();
  const kabulMs = now.getTime() + 4.5 * 60 * 60 * 1000;
  return new Date(kabulMs).toISOString().slice(0, 10);
}
