// Unit tests: Jalali conversion (incl. year boundaries), Afghan months,
// digit/phone normalization, ی/ک normalization.

import { describe, test, expect } from "bun:test";
import {
  isoToJalali, jalaliToIso, formatJalali, parseJalaliInput, jalaliMonthLength,
  instantToJalali, AFGHAN_MONTHS, todayIsoKabul,
} from "../src/server/shared/jalali";
import {
  toLatinDigits, toPersianDigits, normalizeDariText, normalizePhone,
  isAfghanPhone, formatPhoneDisplay, isValidIsoDateOnly,
} from "../src/server/shared/normalization";

describe("Jalali ↔ Gregorian conversion", () => {
  test("Nowruz 1405 = 2026-03-21 (year boundary start)", () => {
    expect(isoToJalali("2026-03-21")).toEqual({ jy: 1405, jm: 1, jd: 1 });
  });

  test("Last day of 1404 = 2026-03-20 (previous year boundary)", () => {
    // 1404 is a common year: حوت has 29 days.
    expect(isoToJalali("2026-03-20")).toEqual({ jy: 1404, jm: 12, jd: 29 });
  });

  test("Round-trip across all days of a leap year", () => {
    // 1403 is a leap Solar Hijri year (366 days).
    let count = 0;
    for (let jm = 1; jm <= 12; jm++) {
      const len = jalaliMonthLength(1403, jm);
      for (let jd = 1; jd <= len; jd++) {
        const iso = jalaliToIso({ jy: 1403, jm, jd });
        const back = isoToJalali(iso);
        expect(back).toEqual({ jy: 1403, jm, jd });
        count += 1;
      }
    }
    expect(count).toBe(366);
  });

  test("Month lengths: first 6 months = 31, next 5 = 30", () => {
    for (let jm = 1; jm <= 6; jm++) expect(jalaliMonthLength(1405, jm)).toBe(31);
    for (let jm = 7; jm <= 11; jm++) expect(jalaliMonthLength(1405, jm)).toBe(30);
  });

  test("Known date: 2026-11-06 → 1405-08-15 (میزان/عقرب region)", () => {
    const j = isoToJalali("2026-11-06");
    expect(j.jy).toBe(1405);
    expect(j.jm).toBe(8);
    expect(j.jd).toBe(15);
  });

  test("Afghan month names are in Solar Hijri order", () => {
    expect(AFGHAN_MONTHS[0]).toBe("حمل");
    expect(AFGHAN_MONTHS[7]).toBe("عقرب");
    expect(AFGHAN_MONTHS[11]).toBe("حوت");
    expect(AFGHAN_MONTHS).toHaveLength(12);
  });

  test("formatJalali renders Persian digits + Afghan month", () => {
    expect(formatJalali("2026-11-06")).toBe("۱۵ عقرب ۱۴۰۵");
  });

  test("parseJalaliInput accepts Persian digits with slashes", () => {
    expect(parseJalaliInput("۱۴۰۵/۰۸/۱۵")).toEqual({ jy: 1405, jm: 8, jd: 15 });
  });

  test("parseJalaliInput rejects impossible dates", () => {
    expect(() => parseJalaliInput("1405/09/31")).toThrow(); // میزان has 30 days
    expect(() => parseJalaliInput("1405/13/01")).toThrow();
  });

  test("instantToJalali applies Asia/Kabul offset (UTC+4:30)", () => {
    // 2026-11-06 20:00 UTC is already 2026-11-07 00:30 in Kabul.
    const j = instantToJalali(new Date("2026-11-06T20:00:00Z"));
    expect(j.jd).toBe(16);
    // 2026-11-06 18:00 UTC is 2026-11-06 22:30 in Kabul.
    const j2 = instantToJalali(new Date("2026-11-06T18:00:00Z"));
    expect(j2.jd).toBe(15);
  });

  test("todayIsoKabul returns a valid ISO date-only string", () => {
    expect(isValidIsoDateOnly(todayIsoKabul())).toBe(true);
  });
});

describe("Digit and phone normalization", () => {
  test("toLatinDigits converts Persian and Arabic digits", () => {
    expect(toLatinDigits("۱۴۰۵")).toBe("1405");
    expect(toLatinDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(toLatinDigits("S-1405")).toBe("S-1405");
  });

  test("toPersianDigits converts for display", () => {
    expect(toPersianDigits(1405)).toBe("۱۴۰۵");
  });

  test("normalizeDariText unifies ی/ک variants for search only", () => {
    expect(normalizeDariText("كتاب")).toBe(normalizeDariText("کتاب"));
    expect(normalizeDariText("يوسف")).toBe(normalizeDariText("یوسف"));
    // The ORIGINAL string is never mutated by the function:
    const original = "كتاب";
    normalizeDariText(original);
    expect(original).toBe("كتاب");
  });

  test("normalizePhone handles Afghan formats from any digit script", () => {
    expect(normalizePhone("0701234567")).toBe("+93701234567");
    expect(normalizePhone("۰۷۰۱۲۳۴۵۶۷")).toBe("+93701234567");
    expect(normalizePhone("0093701234567")).toBe("+93701234567");
    expect(normalizePhone("+93 70 123 4567")).toBe("+93701234567");
    expect(normalizePhone("93701234567")).toBe("+93701234567");
  });

  test("isAfghanPhone and display formatting", () => {
    expect(isAfghanPhone("+93701234567")).toBe(true);
    expect(isAfghanPhone("0701234567")).toBe(false);
    expect(formatPhoneDisplay("+93701234567")).toBe("+93 70 123 4567");
  });
});
