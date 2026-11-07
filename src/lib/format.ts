// Client-safe formatting helpers: Jalali dates with Afghan month names,
// Persian digits, LTR isolation classes.

import {
  isoToJalali, formatJalali, formatJalaliNumeric, formatInstantJalaliDateTime,
  AFGHAN_MONTHS, WEEKDAY_NAMES_DARI,
} from "@/server/shared/jalali";
import { toPersianDigits } from "@/server/shared/normalization";

export {
  isoToJalali, formatJalali, formatJalaliNumeric, formatInstantJalaliDateTime,
  AFGHAN_MONTHS, WEEKDAY_NAMES_DARI, toPersianDigits,
};

export function faNum(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return toPersianDigits(String(n));
}

/** Gender label in Dari. */
export function genderLabel(g: string | null | undefined): string {
  if (g === "male") return "مل";
  if (g === "female") return "زن";
  return "—";
}

export function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0] ?? "").join(" ");
}

// ── Phase 2 labels ──────────────────────────────────────────────────────────

export function staffPositionLabel(p: string): string {
  if (p === "teacher") return "استاد";
  if (p === "admin_staff") return "کارمند اداری";
  if (p === "support") return "کارمند خدمات";
  return p;
}

export function employmentTypeLabel(t: string): string {
  if (t === "full_time") return "تمام‌وقت";
  if (t === "part_time") return "نیمه‌وقت";
  if (t === "contract") return "قراردادی";
  return t;
}

export function staffStatusLabel(s: string): string {
  if (s === "active") return "فعال";
  if (s === "inactive") return "غیرفعال";
  if (s === "terminated") return "ختم‌شده";
  return s;
}

export function attendanceStatusLabel(s: string): string {
  if (s === "present") return "حاضر";
  if (s === "absent") return "غیرحاضر";
  if (s === "late") return "ناوقت";
  if (s === "excused") return "رخصت";
  if (s === "not_recorded") return "نا-ثبت";
  return s;
}

export function assessmentTypeLabel(t: string): string {
  if (t === "quiz") return "کوئیز";
  if (t === "assignment") return "مشق";
  if (t === "midterm") return "امتحان میان‌ترم";
  if (t === "final") return "امتحان نهایی";
  if (t === "project") return "پروژه";
  return t;
}

export function assessmentStatusLabel(s: string): string {
  if (s === "grading") return "در حال ثبت نمرات";
  if (s === "published") return "منتشرشده";
  return "پیش‌نویس";
}

export function sessionStatusLabel(s: string): string {
  if (s === "open") return "باز";
  if (s === "submitted") return "قطعی‌شده";
  return s;
}

/** ISO date (YYYY-MM-DD) → "۱۴۰۵/۰۸/۱۵" for compact display. */
export function faDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatJalaliNumeric(iso);
}

/** Percent display: 82.5 → «۸۲٫۵٪» (null → «—»). */
export function faPercent(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return toPersianDigits(String(v)).replace(".", "٫") + "٪";
}

// ── Phase 3: money (diram → AFN display) ────────────────────────────────────

/** Diram (integer minor units) → «۱٬۲۵۰ افغانی»; 125000 → "۱٬۲۵۰ افغانی".
 *  Non-integer AFN keeps two decimals: 12550 → «۱۲۵٫۵۰ افغانی». */
export function faMoney(diram: number | null | undefined): string {
  if (diram === null || diram === undefined) return "—";
  const afn = diram / 100;
  const isInt = Number.isInteger(afn);
  const s = isInt ? String(afn) : afn.toFixed(2);
  // group thousands with the Arabic thousands separator «٬»
  const [intPart, decPart] = s.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "٬");
  const persian = toPersianDigits(decPart ? `${grouped}.${decPart}` : grouped).replace(".", "٫");
  return `${persian} افغانی`;
}

/** Compact money for table cells: «۱٬۲۵۰» without the currency word. */
export function faMoneyNum(diram: number | null | undefined): string {
  if (diram === null || diram === undefined) return "—";
  return faMoney(diram).replace(" افغانی", "");
}

/** AFN input (string from a form) → diram integer; null when invalid/empty. */
export function afnToDiram(input: string): number | null {
  const cleaned = input.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[,٬،\s]/g, "")
    .replace(/٫|\./g, ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Diram → AFN string for form inputs (e.g. 125000 → "1250"). */
export function diramToAfnInput(diram: number | null | undefined): string {
  if (diram === null || diram === undefined) return "";
  const afn = diram / 100;
  return Number.isInteger(afn) ? String(afn) : afn.toFixed(2);
}
