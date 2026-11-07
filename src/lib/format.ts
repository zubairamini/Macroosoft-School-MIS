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
