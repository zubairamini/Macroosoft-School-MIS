// Fees & discounts view — fee structures (شهریه) per grade/branch/period and
// student discounts (تخفیف). Branch-bound roles only see their own branch.

"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Percent, Plus, Wallet, X } from "lucide-react";
import {
  useMe, useAcademicYears, useOrgContext, useGrades,
  useFeeStructures, useCreateFeeStructure, useUpdateFeeStructure,
  useDiscounts, useCreateDiscount, useRevokeDiscount, useStudents,
} from "@/lib/api/hooks";
import { EmptyState, NoResultsState, TableSkeleton, Ltr } from "@/components/shared";
import { faMoney, faNum, afnToDiram, diramToAfnInput, formatInstantJalaliDateTime } from "@/lib/format";
import { hasGrant } from "@/app-shell/shell";
import { FinBadge, FinHeader } from "./shared";

const GRADE_LABELS: Record<number, string> = {
  1: "صنف اول", 2: "صنف دوم", 3: "صنف سوم", 4: "صنف چهارم", 5: "صنف پنجم",
  6: "صنف ششم", 7: "صنف هفتم", 8: "صنف هشتم", 9: "صنف نهم", 10: "صنف دهم",
  11: "صنف یازدهم", 12: "صنف دوازدهم",
};

export function FeesView() {
  const { data: me } = useMe();
  const canManage = hasGrant(me, "fees.manage");
  const { data: years } = useAcademicYears();
  const currentYear = years?.find((y) => y.isCurrent) ?? years?.[0];
  const { data: fees, isLoading } = useFeeStructures({ academicYearId: currentYear?.id });
  const [createOpen, setCreateOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);

  return (
    <div className="space-y-6">
      <FinHeader
        title="فیس‌ها و تخفیف‌ها"
        subtitle="پلان‌های شهریه بر اساس صنف و دوره — مبلغ‌ها به افغانی ثبت و به دیرم ذخیره می‌شوند."
        action={canManage ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDiscountOpen(true)}>
              <Percent className="h-4 w-4" /> تخفیف شاگرد
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> پلان فیس جدید
            </Button>
          </div>
        ) : null}
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><TableSkeleton rows={5} cols={6} /></div>
          ) : (fees ?? []).length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Wallet}
                title="هنوز پلان فیس ثبت نشده است"
                body={canManage ? "برای شروع، یک پلان شهریه (مثلاً «شهریهٔ ماهانهٔ صنف چهارم») ایجاد کنید." : "با مدیر مالی مکتب تماس بگیرید."}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>نام فیس</TableHead>
                  <TableHead>شعبه</TableHead>
                  <TableHead>صنف‌ها</TableHead>
                  <TableHead>دوره</TableHead>
                  <TableHead>مبلغ</TableHead>
                  <TableHead>فاکتورها</TableHead>
                  <TableHead>وضعیت</TableHead>
                  {canManage ? <TableHead className="w-24">عملیات</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(fees ?? []).map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell className="text-muted-foreground">{f.branchName ?? "همه شعبه‌ها"}</TableCell>
                    <TableCell>
                      {f.gradeLevels.length >= 12
                        ? "همه صنف‌ها"
                        : f.gradeLevels.map((g) => GRADE_LABELS[g] ?? g).join("، ")}
                    </TableCell>
                    <TableCell>{f.periodKindLabel}</TableCell>
                    <TableCell className="font-semibold tabular-nums">{faMoney(f.amountDiram)}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{faNum(f.invoiceCount)}</TableCell>
                    <TableCell><FinBadge status={f.isActive ? "active" : "inactive"} label={f.isActive ? "فعال" : "غیرفعال"} /></TableCell>
                    {canManage ? (
                      <TableCell>
                        <ToggleFeeButton id={f.id} active={f.isActive} />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <DiscountsSection />

      {createOpen ? (
        <CreateFeeDialog
          open
          onOpenChange={setCreateOpen}
          academicYearId={currentYear?.id ?? ""}
        />
      ) : null}
      {discountOpen ? (
        <CreateDiscountDialog
          open
          onOpenChange={setDiscountOpen}
          academicYearId={currentYear?.id ?? ""}
        />
      ) : null}
    </div>
  );
}

function ToggleFeeButton({ id, active }: { id: string; active: boolean }) {
  const update = useUpdateFeeStructure();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={update.isPending}
      onClick={() => {
        update.mutate(
          { id, isActive: !active },
          {
            onSuccess: () => toast.success(active ? "پلان فیس غیرفعال شد." : "پلان فیس فعال شد."),
            onError: (err) => toast.error((err as Error).message),
          },
        );
      }}
    >
      {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : active ? "غیرفعال کردن" : "فعال کردن"}
    </Button>
  );
}

function CreateFeeDialog({
  open, onOpenChange, academicYearId,
}: { open: boolean; onOpenChange: (v: boolean) => void; academicYearId: string }) {
  const { data: orgCtx } = useOrgContext();
  const create = useCreateFeeStructure();
  const [name, setName] = useState("");
  const [periodKind, setPeriodKind] = useState("monthly");
  const [amountAfn, setAmountAfn] = useState("");
  const [note, setNote] = useState("");
  const [branchId, setBranchId] = useState<string>("all");
  const [grades, setGrades] = useState<number[]>([]);

  const valid = name.trim().length >= 3 && afnToDiram(amountAfn ?? "") !== null && grades.length > 0 && academicYearId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>پلان فیس جدید</DialogTitle>
          <DialogDescription>
            مبلغ را به افغانی وارد کنید؛ در سیستم به دیرم (۱ افغانی = ۱۰۰ دیرم) ذخیره می‌شود.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>نام فیس</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: شهریهٔ ماهانهٔ صنف چهارم" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>دورهٔ پرداخت</Label>
              <Select value={periodKind} onValueChange={setPeriodKind}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">ماهانه</SelectItem>
                  <SelectItem value="termly">نیم‌سالانه</SelectItem>
                  <SelectItem value="one_time">یک‌بار</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>مبلغ (افغانی)</Label>
              <Input
                dir="ltr"
                inputMode="decimal"
                value={amountAfn}
                onChange={(e) => setAmountAfn(e.target.value)}
                placeholder="مثلاً 1200"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>شعبه</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه شعبه‌ها (سراسری)</SelectItem>
                {(orgCtx?.branches ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>صنف‌های مربوط</Label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(GRADE_LABELS).map(([lvl, label]) => {
                const n = Number(lvl);
                const on = grades.includes(n);
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setGrades((g) => (on ? g.filter((x) => x !== n) : [...g, n]))}
                    className={`rounded-md border px-2.5 py-1 text-xs transition-soft ${
                      on ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>یادداشت (اختیاری)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>لغو</Button>
          <Button
            disabled={!valid || create.isPending}
            onClick={async () => {
              const amountDiram = afnToDiram(amountAfn);
              if (amountDiram === null) return;
              try {
                await create.mutateAsync({
                  academicYearId,
                  name: name.trim(),
                  periodKind,
                  amountDiram,
                  gradeLevels: grades,
                  branchId: branchId === "all" ? null : branchId,
                  note: note.trim() || null,
                  isActive: true,
                });
                toast.success("پلان فیس ایجاد شد.");
                onOpenChange(false);
                setName(""); setAmountAfn(""); setNote(""); setGrades([]);
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "ایجاد"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Discounts ───────────────────────────────────────────────────────────────

function DiscountsSection() {
  const { data: me } = useMe();
  const canManage = hasGrant(me, "fees.manage");
  const { data: years } = useAcademicYears();
  const currentYear = years?.find((y) => y.isCurrent) ?? years?.[0];
  const { data: discounts, isLoading } = useDiscounts({ academicYearId: currentYear?.id });
  const revoke = useRevokeDiscount();

  return (
    <Card>
      <CardContent className="p-0">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-base font-bold">تخفیف‌های شاگردان</h2>
          <p className="text-xs text-muted-foreground">
            تخفیف فعال در زمان صدور فاکتور به‌صورت خودکار اعمال می‌شود (بیشترین تخفیف معتبر).
          </p>
        </div>
        {isLoading ? (
          <div className="p-4"><TableSkeleton rows={4} cols={5} /></div>
        ) : (discounts ?? []).length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Percent}
              title="تخفیفی ثبت نشده است"
              body={canManage ? "برای شاگردان دارای حاکمیت (مثلاً فرزندان کارمندان) تخفیف درصدی یا مبلغی ثبت کنید." : undefined}
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>شاگرد</TableHead>
                <TableHead>شمارهٔ شاگردی</TableHead>
                <TableHead>نوع</TableHead>
                <TableHead>مقدار</TableHead>
                <TableHead>دلیل</TableHead>
                <TableHead>تاریخ</TableHead>
                <TableHead>وضعیت</TableHead>
                {canManage ? <TableHead className="w-24">عملیات</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(discounts ?? []).map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.studentName}</TableCell>
                  <TableCell><Ltr className="text-xs">{d.studentNumber}</Ltr></TableCell>
                  <TableCell>{d.kind === "percent" ? "درصدی" : "مبلغی"}</TableCell>
                  <TableCell className="tabular-nums">
                    {d.kind === "percent" ? faNum(d.value) + "٪" : faMoney(d.value)}
                  </TableCell>
                  <TableCell className="max-w-56 truncate text-muted-foreground">{d.reason}</TableCell>
                  <TableCell className="text-muted-foreground">{formatInstantJalaliDateTime(d.createdAt)}</TableCell>
                  <TableCell>
                    <FinBadge status={d.status} label={d.status === "approved" ? "فعال" : "لغوشده"} />
                  </TableCell>
                  {canManage ? (
                    <TableCell>
                      {d.status === "approved" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={revoke.isPending}
                          onClick={() => {
                            revoke.mutate(d.id, {
                              onSuccess: () => toast.success("تخفیف لغو شد."),
                              onError: (err) => toast.error((err as Error).message),
                            });
                          }}
                        >
                          لغو
                        </Button>
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function CreateDiscountDialog({
  open, onOpenChange, academicYearId,
}: { open: boolean; onOpenChange: (v: boolean) => void; academicYearId: string }) {
  const create = useCreateDiscount();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<{ id: string; studentNumber: string; name: string } | null>(null);
  const [kind, setKind] = useState("percent");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");

  const { data: results } = useStudents({ q: q.trim().length >= 2 ? q : undefined, pageSize: 8 });

  const valid = picked && reason.trim().length >= 3 && academicYearId &&
    Number(value) > 0 && (kind !== "percent" || Number(value) <= 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>ثبت تخفیف شاگرد</DialogTitle>
          <DialogDescription>
            تخفیف درصدی روی مبلغ ناخالص فاکتور و تخفیف مبلغی به افغانی اعمال می‌شود.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {picked ? (
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 px-3 py-2">
              <div>
                <p className="text-sm font-semibold">{picked.name}</p>
                <p className="text-xs text-muted-foreground"><Ltr>{picked.studentNumber}</Ltr></p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setPicked(null)} aria-label="تغییر شاگرد">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>جستجوی شاگرد</Label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="نام یا شمارهٔ شاگردی…" />
              {(results?.items ?? []).length > 0 ? (
                <ul className="max-h-44 overflow-y-auto scroll-area-thin rounded-lg border border-border">
                  {(results?.items ?? []).map((s) => (
                    <li key={s.id}>
                      <button
                        className="flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-muted"
                        onClick={() => setPicked({ id: s.id, studentNumber: s.studentNumber, name: s.personal.firstName ?? "" })}
                      >
                        <span className="font-medium">{s.personal.firstName} ولد: {s.personal.fatherName}</span>
                        <Ltr className="text-xs text-muted-foreground">{s.studentNumber}</Ltr>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>نوع تخفیف</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">درصدی (٪)</SelectItem>
                  <SelectItem value="fixed_diram">مبلغی (افغانی)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{kind === "percent" ? "درصد" : "مبلغ (افغانی)"}</Label>
              <Input dir="ltr" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>دلیل</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="مثلاً: فرزند کارمند مکتب" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>لغو</Button>
          <Button
            disabled={!valid || create.isPending}
            onClick={async () => {
              if (!picked) return;
              const numeric = Number(value);
              try {
                await create.mutateAsync({
                  academicYearId,
                  studentId: picked.id,
                  kind,
                  value: kind === "percent" ? Math.round(numeric) : (afnToDiram(String(numeric)) ?? 0),
                  reason: reason.trim(),
                });
                toast.success("تخفیف ثبت شد.");
                onOpenChange(false);
                setPicked(null); setReason(""); setValue(""); setQ("");
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "ثبت تخفیف"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
