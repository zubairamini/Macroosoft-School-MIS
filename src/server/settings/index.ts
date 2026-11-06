// Application settings: module toggles and policy placeholders.
// Business rules (passing marks, holidays, official formats) are NEVER
// hardcoded as Ministry requirements — they live here as configurable,
// versioned settings.

import { z } from "zod";
import { db } from "@/lib/db";
import { writeAudit } from "@/server/shared/audit";
import type { AuthContext } from "@/server/auth/context";

export interface AppSettings {
  modules: {
    fees: boolean;          // فیس و وصولی‌ها
    accounting: boolean;    // حسابداری
    payroll: boolean;       // معاشات
    library: boolean;       // کتابخانه
    textbooks: boolean;     // توزیع کتاب‌های درسی
    transport: boolean;     // خدمات ترانسپورت
    inventory: boolean;     // انبار و جنس‌ها
    hr: boolean;            // منابع بشری
    communications: boolean;// ارتباطات و اعلانات
    portals: boolean;       // پورتال شاگرد و ولی
  };
  locale: {
    defaultCurrency: "AFN";
    timezone: "Asia/Kabul";
    calendar: "solar-hijri";
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  modules: {
    fees: true,
    accounting: true,
    payroll: false,
    library: true,
    textbooks: true,
    transport: false,
    inventory: false,
    hr: true,
    communications: true,
    portals: true,
  },
  locale: { defaultCurrency: "AFN", timezone: "Asia/Kabul", calendar: "solar-hijri" },
};

export const settingsDto = z.object({
  modules: z.object({
    fees: z.boolean(),
    accounting: z.boolean(),
    payroll: z.boolean(),
    library: z.boolean(),
    textbooks: z.boolean(),
    transport: z.boolean(),
    inventory: z.boolean(),
    hr: z.boolean(),
    communications: z.boolean(),
    portals: z.boolean(),
  }),
});

const KEY = "app";

export async function getSettings(): Promise<AppSettings> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  if (!row) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(row.value);
    return {
      modules: { ...DEFAULT_SETTINGS.modules, ...(parsed.modules ?? {}) },
      locale: DEFAULT_SETTINGS.locale,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function updateSettings(ctx: AuthContext, dto: z.infer<typeof settingsDto>) {
  const current = await getSettings();
  const next: AppSettings = { ...current, modules: dto.modules };
  await db.$transaction(async (tx) => {
    await tx.setting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: JSON.stringify(next) },
      update: { value: JSON.stringify(next) },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "settings.update",
      entity: "Setting",
      entityId: KEY,
      before: current,
      after: next,
      ip: ctx.ip,
    });
  });
  return next;
}
