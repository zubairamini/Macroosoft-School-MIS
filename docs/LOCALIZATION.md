# Localization — دری، RTL و تقویم افغانی

## Dari terminology (as used in UI & docs)

| Term | Used for |
|---|---|
| مکتب / شعبهٔ مکتب | school / school branch (campus) |
| شاگردان / استادان / اولیا | students / teachers / guardians |
| صنف / شعبهٔ صنف | grade (1–12) / class section (الف، ب…) — **distinct concepts** |
| مضمون / سال تعلیمی | subject / academic year |
| حاضری / امتحانات / نمرات / نتایج | attendance / exams / marks / results |
| فیس / رسید / مصارف / معاشات | fees / receipts / expenses / salaries |
| کتابخانه / گزارش‌ها / تنظیمات | library / reports / settings |
| شمولیت / مسجل | admission (enrollment process) / registrar |

Dictionary: `src/lib/i18n/fa.ts` — all UI strings centralized, structured for
future `ps` (Pashto) and `en` dictionaries.

## Direction & fonts

- `<html lang="fa-AF" dir="rtl">` — whole app RTL.
- Layout uses CSS **logical properties** (`ps-`, `pe-`, `ms-`, `me-`,
  `start-`, `end-`, `text-start`) — no scattered left/right fixes.
- Vazirmatn self-hosted via `@fontsource/vazirmatn` (400/500/600/700) with
  Segoe UI/Tahoma fallbacks.
- Codes, phone numbers, usernames and technical identifiers render in
  `.ltr-iso` (`direction:ltr; unicode-bidi:isolate`) so they stay readable.

## Calendar: Solar Hijri with Afghan months

`src/server/shared/jalali.ts` (wraps jalaali-js):

- Months: حمل، ثور، جوزا، سرطان، اسد، سنبله، میزان، عقرب، قوس، جدی، دلو، حوت
- Week starts شنبه; instants displayed in **Asia/Kabul (UTC+04:30, no DST)**.
- Display examples: «۱۵ عقرب ۱۴۰۵», «۵ حمل ۱۳۹۳», numeric «۱۴۰۵/۰۸/۱۵».

### Date handling invariants (tested)

- **Date-only values** (birth dates, enrollment dates, year boundaries) are
  ISO `YYYY-MM-DD` strings — never `DateTime`. No timezone can shift a
  birthday or attendance date.
- **Instants** (audit, sessions, timestamps) are UTC `DateTime`; converted
  to Kabul only at display time.
- Input accepts Persian/Arabic/Latin digits and `YYYY/MM/DD`,
  `YYYY-MM-DD`, or `YYYY.MM.DD`; validated by round-trip (Jalali → ISO →
  Jalali must match) and month-length checks («این ماه روز بیشتری ندارد»).
- Year-boundary tests: Nowruz 1405 = 2026-03-21; 1404-12-29 = 2026-03-20
  (1404 common year); full 366-day round-trip of leap year 1403.

## Numbers, phones, text

- **Digits:** input accepts ۰۱۲۳۴۵۶۷۸۹ / ٠١٢٣٤٥٦٧٨٩ / 0-9 (normalized to
  Latin for storage); display converts to Persian digits (`faNum`).
- **Phones:** normalized to `+93XXXXXXXXX` from `0…`, `0093…`, `93…`,
  `+93 …` in any digit script; displayed as `+93 70 123 4567` in LTR
  isolation.
- **ی/ک normalization:** Arabic yeh/kaf variants are unified ONLY for search
  and duplicate-scoring comparisons (`normalizeDariText`); the originally
  entered name is always preserved in storage.
- **Email:** optional everywhere — students and guardians never require an
  email address.

## Currency & region (ready for Phase 3)

- Default currency AFN; money will be stored as integer minor units
  (diram, 100 = 1 AFN) — never binary floating point.
- Provinces list (34 Afghan provinces) ships in the setup wizard.

## What is NOT localized away

- Permission codes, endpoint paths, and error codes (`VALIDATION_ERROR`,
  etc.) remain machine-readable Latin; human messages are Dari.
- The dictionary is prepared for future Pashto/English: switching means
  adding `ps.ts`/`en.ts` and a locale picker — no string is hardcoded in
  components (audit labels and status labels are mapped centrally).
