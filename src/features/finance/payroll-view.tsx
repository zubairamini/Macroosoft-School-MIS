// Payroll view — monthly salary runs per branch: generate from staff base
// salaries, adjust allowances/bonuses/deductions while draft, approve, then
// pay (which books a «معاشات» expense automatically). Payslip dialog per item.

"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { BadgeDollarSign, Check, Loader2, Plus, Printer, Wallet } from "lucide-react";
import {
  useMe, usePayrollRuns, usePayrollRun, useCreatePayrollRun,
  useUpdatePayrollItems, usePayrollAction,
} from "@/lib/api/hooks";
import type { PayrollRunDto } from "@/lib/api/client";
import { EmptyState, NoResultsState, TableSkeleton, Ltr } from "@/components/shared";
import { faMoney, faMoneyNum, formatInstantJalaliDateTime, faNum, diramToAfnInput } from "@/lib/format";
import { hasGrant } from "@/app-shell/shell";
import { FinBadge, FinHeader, recentMonthOptions, monthLabelOf } from "./shared";

export function PayrollView() {
  const { data: me } = useMe();
  const canManage = hasGrant(me, "payroll.manage");
  const [status, setStatus] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: runs, isLoading } = usePayrollRuns({ status: status || undefined });

  return (
    <div className="space-y-4">
      <FinHeader
        title="معاشات کارمندان"
        subtitle="معاش پایه در پروفایل کارمند ثبت می‌شود؛ هر ماه یک سیشن معاشات ساخته، تعدیل، تایید و پرداخت می‌شود."
        action={canManage ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> سیشن ماهانهٔ جدید
          </Button>
        ) : null}
      />

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                <SelectItem value="draft">پیش‌نویس</SelectItem>
                <SelectItem value="approved">تاییدشده</SelectItem>
                <SelectItem value="paid">پرداخت‌شده</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="p-4"><TableSkeleton rows={5} cols={6} /></div>
          ) : (runs ?? []).length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={BadgeDollarSign}
                title="هنوز سیشن معاشاتی ساخته نشده است"
                body={canManage ? "برای ماه جاری، سیشن معاشات شعبهٔ خود را ایجاد کنید (معاش پایهٔ کارمندان باید از قبل در «کادر مکتب» ثبت شده باشد)." : undefined}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>دوره</TableHead>
                  <TableHead>شعبه</TableHead>
                  <TableHead>کارمندان</TableHead>
                  <TableHead>مجموع خالص</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>تایید / پرداخت</TableHead>
                  <TableHead className="w-24">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(runs ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.periodLabel}</TableCell>
                    <TableCell className="text-muted-foreground">{r.branchName ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{faNum(r.staffCount)}</TableCell>
                    <TableCell className="tabular-nums font-semibold">{faMoneyNum(r.totalsDiram)}</TableCell>
                    <TableCell><FinBadge status={r.status} label={r.statusLabel} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <p>{r.approvedAt ? `تایید: ${formatInstantJalaliDateTime(r.approvedAt)}` : "—"}</p>
                      <p>{r.paidAt ? `پرداخت: ${formatInstantJalaliDateTime(r.paidAt)}` : "—"}</p>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => setOpenId(r.id)}>
                        جزئیات
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {createOpen ? <CreatePayrollDialog open onOpenChange={setCreateOpen} /> : null}
      {openId ? <RunDetailDialog id={openId} onClose={() => setOpenId(null)} canManage={canManage} /> : null}
    </div>
  );
}

function CreatePayrollDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreatePayrollRun();
  const months = recentMonthOptions(12);
  const [periodKey, setPeriodKey] = useState(months[0]?.key ?? "");
  const [note, setNote] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>سیشن معاشات جدید</DialogTitle>
          <DialogDescription>
            برای همهٔ کارمندان فعالِ شعبهٔ فعال شما با معاش ثبت‌شده، قلم معاش ایجاد می‌شود.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>ماه</Label>
            <Select value={periodKey} onValueChange={setPeriodKey}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>یادداشت (اختیاری)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>لغو</Button>
          <Button
            disabled={!periodKey || create.isPending}
            onClick={async () => {
              try {
                await create.mutateAsync({
                  periodKey,
                  periodLabel: `معاشات ${monthLabelOf(periodKey)}`,
                  note: note.trim() || null,
                });
                toast.success("سیشن معاشات ایجاد شد.");
                onOpenChange(false);
                setNote("");
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

function RunDetailDialog({ id, onClose, canManage }: { id: string; onClose: () => void; canManage: boolean }) {
  const { data: run } = usePayrollRun(id);
  const updateItems = useUpdatePayrollItems();
  const action = usePayrollAction();
  const [draft, setDraft] = useState<Record<string, { allowance: string; bonus: string; deduction: string }>>({});
  const [payslipFor, setPayslipFor] = useState<string | null>(null);

  // Editing is derived (not stateful): only drafts of managers are editable.
  const editing = Boolean(run && run.status === "draft" && canManage);

  if (!run) {
    return (
      <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent dir="rtl" className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>جزئیات سیشن معاشات</DialogTitle>
            <DialogDescription className="sr-only">در حال بارگذاری…</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const diramOf = (v: string): number => {
    const n = Number(v.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  };

  // Form values for an item: seeded from the server value until edited.
  const draftOf = (it: { id: string; allowanceDiram: number; bonusDiram: number; deductionDiram: number }) =>
    draft[it.id] ?? {
      allowance: diramToAfnInput(it.allowanceDiram),
      bonus: diramToAfnInput(it.bonusDiram),
      deduction: diramToAfnInput(it.deductionDiram),
    };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <BadgeDollarSign className="h-5 w-5 text-primary" />
            {run.periodLabel}
            <FinBadge status={run.status} label={run.statusLabel} />
          </DialogTitle>
          <DialogDescription>
            {run.branchName ?? "—"} · {faNum(run.staffCount)} کارمند · مجموع خالص {faMoney(run.totalsDiram)}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto scroll-area-thin">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>کارمند</TableHead>
                <TableHead>شمارهٔ رسید</TableHead>
                <TableHead>معاش پایه</TableHead>
                <TableHead>افزودنی</TableHead>
                <TableHead>پاداش</TableHead>
                <TableHead>کسری</TableHead>
                <TableHead>خالص</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {run.items.map((it) => {
                const d = draftOf(it);
                const net = editing
                  ? it.baseDiram + diramOf(d.allowance) + diramOf(d.bonus) - diramOf(d.deduction)
                  : it.netDiram;
                return (
                  <TableRow key={it.id}>
                    <TableCell>
                      <p className="font-medium">{it.staffName}</p>
                      <p className="text-xs text-muted-foreground">{it.position === "teacher" ? "استاد" : it.position === "admin_staff" ? "کارمند اداری" : "کارمند خدمات"}</p>
                    </TableCell>
                    <TableCell><Ltr className="text-xs">{it.payslipNumber}</Ltr></TableCell>
                    <TableCell className="tabular-nums">{faMoneyNum(it.baseDiram)}</TableCell>
                    {editing ? (
                      <>
                        <TableCell><Input dir="ltr" className="h-8 w-20" value={d.allowance} onChange={(e) => setDraft((prev) => ({ ...prev, [it.id]: { ...d, allowance: e.target.value } }))} /></TableCell>
                        <TableCell><Input dir="ltr" className="h-8 w-20" value={d.bonus} onChange={(e) => setDraft((prev) => ({ ...prev, [it.id]: { ...d, bonus: e.target.value } }))} /></TableCell>
                        <TableCell><Input dir="ltr" className="h-8 w-20" value={d.deduction} onChange={(e) => setDraft((prev) => ({ ...prev, [it.id]: { ...d, deduction: e.target.value } }))} /></TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="tabular-nums">{faMoneyNum(it.allowanceDiram)}</TableCell>
                        <TableCell className="tabular-nums">{faMoneyNum(it.bonusDiram)}</TableCell>
                        <TableCell className="tabular-nums">{faMoneyNum(it.deductionDiram)}</TableCell>
                      </>
                    )}
                    <TableCell className="tabular-nums font-semibold">{faMoneyNum(net)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => setPayslipFor(it.id)}>
                        رسید
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {canManage ? (
          <DialogFooter className="gap-2">
            {run.status === "draft" ? (
              <>
                <Button
                  disabled={updateItems.isPending}
                  onClick={async () => {
                    try {
                      await updateItems.mutateAsync({
                        id: run.id,
                        items: run.items.map((it) => {
                          const d = draftOf(it);
                          return {
                            id: it.id,
                            allowanceDiram: diramOf(d.allowance),
                            bonusDiram: diramOf(d.bonus),
                            deductionDiram: diramOf(d.deduction),
                          };
                        }),
                      });
                      toast.success("قلم‌های معاشات ذخیره شد.");
                    } catch (err) {
                      toast.error((err as Error).message);
                    }
                  }}
                >
                  {updateItems.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "ذخیرهٔ تعدیل‌ها"}
                </Button>
                <Button
                  variant="outline"
                  disabled={action.isPending}
                  onClick={async () => {
                    try {
                      await action.mutateAsync({ id: run.id, action: "approve" });
                      toast.success("سیشن تایید شد؛ اکنون قابل پرداخت است.");
                    } catch (err) {
                      toast.error((err as Error).message);
                    }
                  }}
                >
                  <Check className="h-4 w-4" /> تایید
                </Button>
              </>
            ) : null}
            {run.status === "approved" ? (
              <Button
                disabled={action.isPending}
                onClick={async () => {
                  try {
                    const res = await action.mutateAsync({ id: run.id, action: "pay" });
                    toast.success(`معاشات پرداخت شد و مصرف «${res.expenseNumber}» ثبت گردید.`);
                  } catch (err) {
                    toast.error((err as Error).message);
                  }
                }}
              >
                <Wallet className="h-4 w-4" /> ثبت پرداخت
              </Button>
            ) : null}
            <Button variant="ghost" onClick={onClose}>بستن</Button>
          </DialogFooter>
        ) : (
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>بستن</Button>
          </DialogFooter>
        )}

        {payslipFor ? <PayslipDialog run={run} itemId={payslipFor} onClose={() => setPayslipFor(null)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function PayslipDialog({ run, itemId, onClose }: { run: PayrollRunDto; itemId: string; onClose: () => void }) {
  const item = run.items.find((i) => i.id === itemId);
  if (!item) return null;
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-primary" /> رسید معاش
          </DialogTitle>
          <DialogDescription>
            {run.periodLabel} · شعبهٔ {run.branchName ?? "—"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between border-b border-dashed border-border pb-2">
            <div>
              <p className="font-bold">{item.staffName}</p>
              <p className="text-xs text-muted-foreground"><Ltr>{item.payslipNumber}</Ltr></p>
            </div>
            <FinBadge status={run.status} label={run.statusLabel} />
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">معاش پایه</span><span className="tabular-nums">{faMoney(item.baseDiram)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">افزودنی</span><span className="tabular-nums">{faMoney(item.allowanceDiram)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">پاداش</span><span className="tabular-nums">{faMoney(item.bonusDiram)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">کسری</span><span className="tabular-nums">−{faMoney(item.deductionDiram)}</span></div>
            <div className="flex justify-between border-t border-dashed border-border pt-2 text-base font-bold">
              <span>خالص پرداختی</span>
              <span className="tabular-nums">{faMoney(item.netDiram)}</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> چاپ</Button>
          <Button onClick={onClose}>بستن</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
