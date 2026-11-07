// Shared presentational components: status badges, empty states, KPI cards,
// LTR isolation, Jalali date input, stepper, skeletons.

"use client";

import { forwardRef, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Inbox, SearchX } from "lucide-react";
import { formatJalaliNumeric, toPersianDigits } from "@/lib/format";
import { AFGHAN_MONTHS, isoToJalali } from "@/server/shared/jalali";

// ── Status badge ────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  // applications
  draft: "bg-slate-100 text-slate-700 border-slate-300",
  submitted: "bg-sky-50 text-sky-800 border-sky-200",
  under_review: "bg-amber-50 text-amber-800 border-amber-300",
  approved: "bg-emerald-50 text-emerald-800 border-emerald-300",
  rejected: "bg-red-50 text-red-800 border-red-200",
  enrolled: "bg-emerald-600 text-white border-emerald-700",
  cancelled: "bg-slate-100 text-slate-500 border-slate-300",
  // students
  active: "bg-emerald-50 text-emerald-800 border-emerald-300",
  inactive: "bg-slate-100 text-slate-700 border-slate-300",
  transferred: "bg-amber-50 text-amber-800 border-amber-300",
  withdrawn: "bg-red-50 text-red-800 border-red-200",
  graduated: "bg-indigo-50 text-indigo-800 border-indigo-200",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const cls = STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700 border-slate-300";
  return (
    <Badge variant="outline" className={`${cls} font-medium`}>
      {label ?? status}
    </Badge>
  );
}

// ── LTR isolation for codes/phones/numbers ─────────────────────────────────

export function Ltr({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span dir="ltr" className={`ltr-iso ${className}`}>{children}</span>;
}

// ── Empty state ────────────────────────────────────────────────────────────

export function EmptyState({
  icon: Icon = Inbox,
  title,
  body,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/60 p-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-base font-semibold text-foreground">{title}</p>
      {body ? <p className="mt-1 max-w-md text-sm text-muted-foreground">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function NoResultsState({ query }: { query?: string }) {
  return (
    <EmptyState
      icon={SearchX}
      title="نتیجه‌ای پیدا نشد"
      body={query ? `برای «${query}» هیچ نتیجه‌ای موجود نیست.` : "با فیلترهای فعلی نتیجه‌ای موجود نیست. فیلترها را تغییر دهید."}
    />
  );
}

// ── KPI card ───────────────────────────────────────────────────────────────

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "default" | "primary" | "amber";
}) {
  const toneCls =
    tone === "primary"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-muted text-foreground";
  return (
    <Card className="transition-soft hover:shadow-sm">
      <CardContent className="flex items-center gap-4 p-4">
        {Icon ? (
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border ${toneCls}`}>
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
          {hint ? <p className="truncate text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Loading skeletons ──────────────────────────────────────────────────────

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="در حال بارگذاری">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-9 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

// ── Jalali date input ──────────────────────────────────────────────────────
// Accepts Persian/Arabic/Latin digits; stores ISO date-only; shows a
// formatted Jalali preview. No timezone conversion ever touches the value.

export const JalaliDateInput = forwardRef<
  HTMLInputElement,
  {
    value?: string; // ISO date-only
    onChange: (iso: string) => void;
    placeholder?: string;
    id?: string;
    className?: string;
    disabled?: boolean;
  }
>(function JalaliDateInput({ value, onChange, placeholder, id, className, disabled }, ref) {
  const [typed, setTyped] = useState("");
  const [touched, setTouched] = useState(false);

  const display = useMemo(() => {
    if (!touched && value) return formatJalaliNumeric(value);
    return typed;
  }, [touched, typed, value]);

  const preview = useMemo(() => {
    if (!value) return "";
    try {
      const j = isoToJalali(value);
      return `${toPersianDigits(j.jd)} ${AFGHAN_MONTHS[j.jm - 1]} ${toPersianDigits(j.jy)}`;
    } catch {
      return "";
    }
  }, [value]);

  function commit(raw: string) {
    setTyped(raw);
    setTouched(true);
    // Accept either "1405/08/14" (any digit script) or ISO "2026-11-06".
    const latin = raw.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
    const parts = latin.split(/[-/.]/).filter(Boolean);
    if (parts.length === 3) {
      if (parts[0].length === 4 && parts[0].startsWith("1") && latin.includes("-")) {
        // Looks like ISO already
        const [y, m, d] = parts.map(Number);
        if (y > 1900 && y < 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          onChange(`${parts[0]}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
          return;
        }
      }
      const [jy, jm, jd] = parts.map(Number);
      if (jy >= 1300 && jy <= 1500 && jm >= 1 && jm <= 12 && jd >= 1 && jd <= 31) {
        // Jalali → ISO via API round-trip on the server; here we ask the
        // jalaali-js conversion directly.
        import("@/server/shared/jalali").then(({ jalaliToIso }) => {
          onChange(jalaliToIso({ jy, jm, jd }));
        });
      }
    }
  }

  return (
    <div className="space-y-1">
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          ref={ref}
          dir="ltr"
          className={`ps-9 text-start ${className ?? ""}`}
          value={display}
          disabled={disabled}
          placeholder={placeholder ?? "۱۴۰۵/۰۸/۱۴"}
          inputMode="numeric"
          onChange={(e) => commit(e.target.value)}
          onBlur={() => setTouched(false)}
        />
      </div>
      {preview ? <p className="text-xs text-muted-foreground">{preview}</p> : null}
    </div>
  );
});

// ── Stepper ─────────────────────────────────────────────────────────────────

export function Stepper({
  steps,
  current,
  onGo,
}: {
  steps: string[];
  current: number;
  onGo?: (i: number) => void;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-1" aria-label="مراحل">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center">
            <button
              type="button"
              onClick={() => onGo?.(i)}
              disabled={!onGo || i > current}
              className={`transition-soft flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                active
                  ? "border-primary bg-primary text-primary-foreground font-semibold"
                  : done
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-border bg-card text-muted-foreground"
              } ${onGo && i <= current ? "cursor-pointer hover:border-primary/60" : "cursor-default"}`}
              aria-current={active ? "step" : undefined}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                  active ? "bg-white/20" : done ? "bg-emerald-600 text-white" : "bg-muted"
                }`}
              >
                {done ? <Check className="h-3 w-3" /> : toPersianDigits(i + 1)}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < steps.length - 1 ? (
              <ChevronLeft className="mx-0.5 h-4 w-4 text-border rtl:rotate-0" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

// ── Pagination ──────────────────────────────────────────────────────────────

export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
      <p className="text-sm text-muted-foreground">
        نمایش {toPersianDigits(from)}–{toPersianDigits(to)} از {toPersianDigits(total)} مورد
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          aria-label="صفحهٔ قبلی"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="px-2 text-sm tabular-nums">
          {toPersianDigits(page)} / {toPersianDigits(pages)}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => onPage(Math.min(pages, page + 1))}
          disabled={page >= pages}
          aria-label="صفحهٔ بعد"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
