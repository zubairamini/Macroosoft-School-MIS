// Dari/Persian text and input normalization utilities.
// Preserves user-entered names; normalization is applied only for SEARCH
// and IDENTIFIER comparisons.

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** Convert Persian/Arabic-Indic digits to Latin digits. */
export function toLatinDigits(input: string): string {
  if (!input) return input;
  let out = "";
  for (const ch of input) {
    const p = PERSIAN_DIGITS.indexOf(ch);
    if (p >= 0) { out += String(p); continue; }
    const a = ARABIC_DIGITS.indexOf(ch);
    if (a >= 0) { out += String(a); continue; }
    out += ch;
  }
  return out;
}

/** Convert Latin digits to Persian digits (display only). */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

/**
 * Normalize Arabic/Persian variants of ی and ک (plus common join issues)
 * for search and duplicate-detection comparisons.
 * The original stored value is never modified.
 */
export function normalizeDariText(input: string): string {
  if (!input) return input;
  return input
    .replace(/[\u064A\u0649]/g, "\u06CC") // Arabic yeh / alef maksura → Farsi yeh
    .replace(/\u0643/g, "\u06A9")         // Arabic kaf → Keheh
    .replace(/[\u0629]/g, "\u0647")       // teh marbuta → heh (name search)
    .replace(/\u200c/g, " ")              // ZWNJ → space for fuzzy compare
    .replace(/[\u064B-\u0652\u0670]/g, "")// Arabic diacritics
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Normalize an Afghan phone number to +93XXXXXXXXX where possible.
 * Accepts Persian/Arabic/Latin digits, spaces, dashes, parentheses,
 * 0093 / 93 / 0 prefixes. Non-Afghan-looking values are digit-normalized
 * only and kept as entered otherwise.
 */
export function normalizePhone(raw: string): string {
  if (!raw) return raw;
  let d = toLatinDigits(raw).replace(/[\s\-()‌.]/g, "");
  if (d.startsWith("0093")) d = "+93" + d.slice(4);
  else if (d.startsWith("093") && d.length === 12) d = "+93" + d.slice(3);
  else if (/^0\d{9}$/.test(d)) d = "+93" + d.slice(1); // 0XXXXXXXXX
  else if (/^93\d{9}$/.test(d)) d = "+93" + d.slice(2);
  if (/^\+93\d{9}$/.test(d)) return d;
  return d;
}

/** True when the string looks like a reachable Afghan mobile number. */
export function isAfghanPhone(normalized: string): boolean {
  return /^\+93\d{9}$/.test(normalized);
}

/** Pretty display: +93 70 123 4567 */
export function formatPhoneDisplay(normalized: string): string {
  const m = /^\+93(\d{2})(\d{3})(\d{4})$/.exec(normalized);
  if (!m) return normalized;
  return `+93 ${m[1]} ${m[2]} ${m[3]}`;
}

export function isValidIsoDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
