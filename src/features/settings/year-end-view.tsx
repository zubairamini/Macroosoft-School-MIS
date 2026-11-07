// Year-end rollover view — Phase 5 «سال‌گذرانی»: preview the closing year's
// promotion decisions, override individuals, then apply the repeat-safe
// batch that creates next-year enrollments and closes the year.

"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CalendarClock, Loader2, ShieldAlert, CheckCircle2, RefreshCcw } from "lucide-react";
import { useMe, useAcademicYears, useRolloverPreview, useRolloverDecide, useRolloverApply } from "@/lib/api/hooks";
import { EmptyState, TableSkeleton, Ltr } from "@/components/shared";
import { faNum } from "@/lib/format";
import { hasGrant } from "@/app-shell/shell";
import { apiErrorMessage } from "@/lib/api/hooks";
import { FinBadge, FinHeader } from "@/features/finance/shared";

const DECISIONS = [
  { value: "promote", label: "ارتقا" },
  { value: "repeat", label: "تکرار" },
  { value: "graduate", label: "تخارج" },
  { value: "leave", label: "ترک" },
];

const DECISION_LABELS: Record<string, string> = {
  promote: "ارتقا",
  repeat: "تکرار",
  graduate: "تخارج",
  leave: "ترک",
};

export function YearEndView() {
  const { data: me } = useMe();
  const canManage = hasGrant(me, "year_end.manage");
  const { data: years } = useAcademicYears();
  const [yearId, setYearId] = useState("");
  const [q, setQ] = useState("");
  const [applyOpen, setApplyOpen] = useState(false);

  const { data: preview, isLoading, refetch, isRefetching } = useRolloverPreview(yearId || null);
  const decide = useRolloverDecide();
  const apply = useRolloverApply();

  // Local overrides: studentId → decision (not yet saved).
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const rows = useMemo(() => {
    const list = preview?.rows ?? [];
    if (!q.trim()) return list;
    const needle = q.trim();
    return list.filter(
      (r) => r.studentName.includes(needle) || r.studentNumber.includes(needle) || r.fatherName.includes(needle),
    );
  }, [preview, q]);

  const dirtyCount = Object.keys(overrides).length;

  if (!canManage) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="شما اجازهٔ مدیریت سال‌گذرانی را ندارید"
        body="تنها مدیر سیستم و مدیر عام می‌توانند سال تعلیمی را ببندند و دستهٔ ارتقا را اعمال کنند."
      />
    );
  }

  return (
    <div className="space-y-4">
      <FinHeader
        title="سال‌گذرانی (بستن سال تعلیمی)"
        subtitle="پیش‌نمایش تصمیم‌های ارتقا/تکرار/تخارج، اعمال دسته به‌صورت تکرار-امن، و بستن سال — بدهی‌های مالی هرگز پاک نمی‌شوند."
        action={yearId ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
              <RefreshCcw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} /> تازه‌سازی
            </Button>
            <Button onClick={() => setApplyOpen(true)}>
              <CalendarClock className="h-4 w-4" /> اعمال سال‌گذرانی…
            </Button>
          </div>
        ) : null}
      />

      {!yearId ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={CalendarClock}
              title="سال تعلیمی را برای بستن انتخاب کنید"
              body="ابتدا سال بعدی را در تنظیمات سال تعلیمی ایجاد کنید؛ سپس اینجا سال جاری را انتخاب و پیش‌نمایش را بررسی کنید."
            />
            <div className="mx-auto mt-4 w-72">
              <YearPicker years={years ?? []} value={yearId} onChange={setYearId} />
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiSmall label="شمولیت‌های فعال" value={faNum(preview?.year.activeEnrollments ?? 0)} />
            <KpiSmall label="ارتقا" value={faNum(preview?.counts.promote ?? 0)} tone="ok" />
            <KpiSmall label="تخارج" value={faNum(preview?.counts.graduate ?? 0)} tone="amber" />
            <KpiSmall
              label="وضعیت سال"
              value={preview?.year.status === "closed" ? "بسته‌شده" : preview?.year.status === "active" ? "فعال" : "برنامه‌ریزی‌شده"}
              tone={preview?.year.status === "closed" ? "bad" : "default"}
            />
          </div>

          {preview?.year.status === "closed" ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              این سال بسته شده است. اعمال دوباره «تکرار-امن» است: فقط تصمیم‌های باقی‌مانده پردازش می‌شوند و چیزی دوباره ثبت نمی‌شود.
            </div>
          ) : null}

          <Card>
            <CardContent className="p-0">
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                <div className="w-72 space-y-1">
                  <Label>سال تعلیمی</Label>
                  <YearPicker years={years ?? []} value={yearId} onChange={setYearId} />
                </div>
                <div className="relative w-56">
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی شاگرد…" />
                </div>
                {dirtyCount > 0 ? (
                  <div className="ms-auto flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{faNum(dirtyCount)} تغییر ذخیره‌نشده</span>
                    <Button
                      size="sm"
                      disabled={decide.isPending}
                      onClick={async () => {
                        try {
                          const res = await decide.mutateAsync({
                            yearId,
                            decisions: Object.entries(overrides).map(([studentId, decision]) => ({
                              studentId,
                              decision,
                            })),
                          });
                          toast.success(`${faNum(res.count)} تصمیم ذخیره شد.`);
                          setOverrides({});
                        } catch (err) {
                          toast.error(apiErrorMessage(err));
                        }
                      }}
                    >
                      {decide.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "ذخیرهٔ تصمیم‌ها"}
                    </Button>
                  </div>
                ) : null}
              </div>

              {isLoading ? (
                <div className="p-4"><TableSkeleton rows={8} cols={6} /></div>
              ) : (rows ?? []).length === 0 ? (
                <div className="p-6"><EmptyState icon={CalendarClock} title="شمولیت فعالی برای این سال یافت نشد" /></div>
              ) : (
                <div className="max-h-[28rem] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead>شماره</TableHead>
                        <TableHead>نام</TableHead>
                        <TableHead>ولد</TableHead>
                        <TableHead>صنف</TableHead>
                        <TableHead>شعبهٔ صنفی</TableHead>
                        <TableHead>تصمیم</TableHead>
                        <TableHead>وضعیت</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => {
                        const effective = overrides[r.studentId] ?? r.savedDecision ?? r.defaultDecision;
                        return (
                          <TableRow key={r.studentId}>
                            <TableCell><Ltr className="text-xs font-semibold">{r.studentNumber}</Ltr></TableCell>
                            <TableCell className="font-medium">{r.studentName}</TableCell>
                            <TableCell className="text-muted-foreground">{r.fatherName}</TableCell>
                            <TableCell>{r.gradeName}</TableCell>
                            <TableCell className="text-muted-foreground">{r.sectionLabel ?? "—"}</TableCell>
                            <TableCell>
                              {r.appliedAt ? (
                                <FinBadge status="paid" label={DECISION_LABELS[effective] ?? effective} />
                              ) : (
                                <Select value={effective} onValueChange={(v) => setOverrides((o) => ({ ...o, [r.studentId]: v }))}>
                                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {DECISIONS.filter((d) => !(d.value === "promote" && r.gradeLevel >= 12)).map((d) => (
                                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </TableCell>
                            <TableCell>
                              {r.appliedAt ? (
                                <span className="flex items-center gap-1 text-xs text-emerald-700">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> اعمال‌شده
                                </span>
                              ) : (
                                <FinBadge status="draft" label="در انتظار" />
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {applyOpen && yearId && preview ? (
        <ApplyDialog
          yearId={yearId}
          fromYearName={preview.year.name}
          suggestedNextYearName={preview.suggestedNextYearName}
          nextYears={preview.nextYears}
          pendingCount={preview.counts.pending}
          onClose={() => setApplyOpen(false)}
        />
      ) : null}
    </div>
  );
}

function YearPicker({
  years,
  value,
  onChange,
}: {
  years: Array<{ id: string; name: string; status: string; isCurrent: boolean }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
      <SelectTrigger><SelectValue placeholder="انتخاب سال تعلیمی" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">— انتخاب سال —</SelectItem>
        {years.map((y) => (
          <SelectItem key={y.id} value={y.id}>
            {y.name} {y.isCurrent ? "(جاری)" : y.status === "closed" ? "(بسته)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function KpiSmall({ label, value, tone }: { label: string; value: string; tone?: "ok" | "amber" | "bad" | "default" }) {
  const toneCls =
    tone === "ok" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : tone === "bad" ? "text-red-700" : "";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className={`text-xl font-bold tabular-nums ${toneCls}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function ApplyDialog({
  yearId,
  fromYearName,
  suggestedNextYearName,
  nextYears,
  pendingCount,
  onClose,
}: {
  yearId: string;
  fromYearName: string;
  suggestedNextYearName: string;
  nextYears: Array<{ id: string; name: string; status: string; isCurrent: boolean }>;
  pendingCount: number;
  onClose: () => void;
}) {
  const apply = useRolloverApply();
  const [toAcademicYearId, setToAcademicYearId] = useState(nextYears[0]?.id ?? "");
  const [setAsCurrent, setSetAsCurrent] = useState(true);
  const [confirmText, setConfirmText] = useState("");

  const target = nextYears.find((y) => y.id === toAcademicYearId);
  const confirmed = confirmText.trim() === fromYearName || confirmText.trim() === String(Number(fromYearName));

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>اعمال سال‌گذرانی — بستن {fromYearName}</DialogTitle>
          <DialogDescription>
            شمولیت‌های سال بعد ایجاد می‌شود، شمولیت‌های سال جاری بسته می‌گردد و سال «بسته» علامت می‌خورد.
            این عمل «تکرار-امن» است: اجرای دوباره فقط موارد باقی‌مانده را پردازش می‌کند.
            بدهی‌ها و دوره‌های مالی تغییر نمی‌کنند.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {nextYears.length === 0 ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              سال تعلیمی بعدی ({suggestedNextYearName}) هنوز ایجاد نشده است. ابتدا در «تنظیمات → سال تعلیمی» آن را ایجاد کنید، سپس اینجا برگردید.
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>سال تعلیمی مقصد</Label>
              <Select value={toAcademicYearId} onValueChange={setToAcademicYearId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {nextYears.map((y) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.name} {y.isCurrent ? "(جاری)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={setAsCurrent}
              onChange={(e) => setSetAsCurrent(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            سال مقصد به‌عنوان سال جاری فعال شود
          </label>
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            تصمیم‌های در انتظار: <span className="font-bold">{faNum(pendingCount)}</span>
            {target ? ` → ${target.name}` : ""}
          </div>
          <div className="space-y-1.5">
            <Label>
              برای تایید، نام سال ({fromYearName}) را بنویسید:
            </Label>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} dir="ltr" placeholder={fromYearName} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>لغو</Button>
          <Button
            variant="destructive"
            disabled={!toAcademicYearId || !confirmed || apply.isPending || nextYears.length === 0}
            onClick={async () => {
              try {
                const res = await apply.mutateAsync({ yearId, toAcademicYearId, setAsCurrent });
                toast.success(
                  `سال‌گذرانی انجام شد: ${faNum(res.promoted)} ارتقا، ${faNum(res.repeated)} تکرار، ${faNum(res.graduated)} تخارج، ${faNum(res.left)} ترک، ${faNum(res.skipped)} عبورشده.`,
                );
                onClose();
              } catch (err) {
                toast.error(apiErrorMessage(err));
              }
            }}
          >
            {apply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "اعمال و بستن سال"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
