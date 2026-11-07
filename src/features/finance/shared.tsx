// Shared helpers for the Phase 3 finance views: status badges, Solar Hijri
// month picker options, and money-input field.

"use client";

import { Badge } from "@/components/ui/badge";
import { toPersianDigits } from "@/lib/format";
import { isoToJalali, AFGHAN_MONTHS } from "@/server/shared/jalali";
import type { ReactNode } from "react";

// ── Finance status badges ───────────────────────────────────────────────────

const FIN_STATUS_STYLES: Record<string, string> = {
  issued: "bg-amber-50 text-amber-800 border-amber-300",
  partially_paid: "bg-sky-50 text-sky-800 border-sky-300",
  paid: "bg-emerald-50 text-emerald-800 border-emerald-300",
  void: "bg-red-50 text-red-800 border-red-200",
  draft: "bg-slate-100 text-slate-700 border-slate-300",
  approved: "bg-sky-50 text-sky-800 border-sky-300",
  active: "bg-emerald-50 text-emerald-800 border-emerald-300",
  inactive: "bg-slate-100 text-slate-600 border-slate-300",
  revoked: "bg-red-50 text-red-800 border-red-200",
};

export function FinBadge({ status, label }: { status: string; label?: string }) {
  const cls = FIN_STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700 border-slate-300";
  return (
    <Badge variant="outline" className={`${cls} font-medium`}>
      {label ?? status}
    </Badge>
  );
}

// ── Solar Hijri month options ───────────────────────────────────────────────

/** Today's date-only string in Asia/Kabul. */
export function todayIsoKabulClient(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kabul" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function jalaliMonthKeyOf(iso: string): string {
  const j = isoToJalali(iso);
  return `${j.jy}-${String(j.jm).padStart(2, "0")}`;
}

export function monthLabelOf(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${AFGHAN_MONTHS[m - 1] ?? key} ${toPersianDigits(String(y))}`;
}

/** Month-key options for the last `n` months ending this month. */
export function recentMonthOptions(n = 12): Array<{ key: string; label: string }> {
  const now = jalaliMonthKeyOf(todayIsoKabulClient());
  let [y, m] = now.split("-").map(Number);
  const out: Array<{ key: string; label: string }> = [];
  for (let i = 0; i < n; i++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.unshift({ key, label: monthLabelOf(key) });
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}

// ── Section header ──────────────────────────────────────────────────────────

export function FinHeader({
  title, subtitle, action,
}: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </header>
  );
}
