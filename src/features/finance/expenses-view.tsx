// Expenses view — school expenditures per branch with categories, creation
// and void-with-reason corrections. Payroll payments appear here as
// «معاشات» expenses automatically.

"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Ban, Landmark, Loader2, Plus } from "lucide-react";
import { useMe, useExpenses, useCreateExpense, useVoidExpense } from "@/lib/api/hooks";
import { EmptyState, NoResultsState, TableSkeleton, Ltr, KpiCard, JalaliDateInput } from "@/components/shared";
import { faMoney, faMoneyNum, afnToDiram, faDate, faNum } from "@/lib/format";
import { hasGrant } from "@/app-shell/shell";
import { FinBadge, FinHeader } from "./shared";

const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "utilities", label: "برق و آب" },
  { value: "maintenance", label: "ترمیم و نگهداری" },
  { value: "supplies", label: "لوازم تعلیمی" },
  { value: "transport", label: "ترانسپورت" },
  { value: "salaries", label: "معاشات" },
  { value: "other", label: "مصارف دیگر" },
];

export function ExpensesView() {
  const { data: me } = useMe();
  const canManage = hasGrant(me, "expenses.manage");
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const { data: expenses, isLoading } = useExpenses({
    category: category || undefined,
    from: from || undefined,
    to: to || undefined,
  });

  const totals = useMemo(() => {
    const live = (expenses ?? []).filter((e) => !e.voidedAt);
    return {
      count: live.length,
      total: live.reduce((s, e) => s + e.amountDiram, 0),
    };
  }, [expenses]);

  return (
    <div className="space-y-4">
      <FinHeader
        title="مصارف مکتب"
        subtitle="مصارف به افغانی ثبت و به دیرم ذخیره می‌شوند؛ پرداخت معاشات خودکار اینجا ثبت می‌شود."
        action={canManage ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> مصرف جدید
          </Button>
        ) : null}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <KpiCard label="تعداد مصارف معتبر" value={faNum(totals.count)} icon={Landmark} />
        <KpiCard label="مجموع مصارف" value={faMoneyNum(totals.total)} tone="amber" icon={Landmark} />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <Select value={category || "all"} onValueChange={(v) => setCategory(v === "all" ? "" : v)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه دسته‌ها</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <div className="w-36">
                <JalaliDateInput value={from} onChange={setFrom} placeholder="از تاریخ…" />
              </div>
              <div className="w-36">
                <JalaliDateInput value={to} onChange={setTo} placeholder="تا تاریخ…" />
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="p-4"><TableSkeleton rows={8} cols={6} /></div>
          ) : (expenses ?? []).length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Landmark}
                title="مصرفی ثبت نشده است"
                body={canManage ? "اولین مصرف مکتب (برق، آب، ترمیم…) را ثبت کنید." : undefined}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>شماره</TableHead>
                    <TableHead>تاریخ</TableHead>
                    <TableHead>دسته</TableHead>
                    <TableHead>دریافت‌کننده</TableHead>
                    <TableHead>مبلغ</TableHead>
                    <TableHead>شعبه</TableHead>
                    <TableHead>وضعیت</TableHead>
                    {canManage ? <TableHead className="w-20">عملیات</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(expenses ?? []).map((e) => (
                    <TableRow key={e.id} className={e.voidedAt ? "opacity-60" : ""}>
                      <TableCell><Ltr className="text-xs font-semibold">{e.expenseNumber}</Ltr></TableCell>
                      <TableCell className="text-muted-foreground">{faDate(e.date)}</TableCell>
                      <TableCell>{e.categoryLabel}</TableCell>
                      <TableCell className="text-muted-foreground">{e.payee ?? "—"}</TableCell>
                      <TableCell className="tabular-nums font-semibold">{faMoneyNum(e.amountDiram)}</TableCell>
                      <TableCell className="text-muted-foreground">{e.branchName ?? "—"}</TableCell>
                      <TableCell>
                        {e.voidedAt ? <FinBadge status="void" label="باطل‌شده" /> : <FinBadge status="active" label="معتبر" />}
                      </TableCell>
                      {canManage ? (
                        <TableCell>
                          {!e.voidedAt ? <VoidExpenseButton id={e.id} /> : null}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {createOpen ? <CreateExpenseDialog open onOpenChange={setCreateOpen} /> : null}
    </div>
  );
}

function CreateExpenseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreateExpense();
  const [date, setDate] = useState("");
  const [category, setCategory] = useState("utilities");
  const [payee, setPayee] = useState("");
  const [amountAfn, setAmountAfn] = useState("");
  const [note, setNote] = useState("");

  const amountDiram = afnToDiram(amountAfn ?? "");
  const valid = amountDiram !== null && amountDiram > 0 && date.length >= 8;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>ثبت مصرف جدید</DialogTitle>
          <DialogDescription>
            مصرف در شعبهٔ فعال شما ثبت می‌شود؛ مدیر عام و مدیر سیستم می‌توانند برای هر شعبه ثبت کنند.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>تاریخ</Label>
              <JalaliDateInput value={date} onChange={setDate} placeholder="۱۴۰۵/۰۸/۱۵" />
            </div>
            <div className="space-y-1.5">
              <Label>دسته</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>مبلغ (افغانی)</Label>
              <Input dir="ltr" inputMode="decimal" value={amountAfn} onChange={(e) => setAmountAfn(e.target.value)} placeholder="مثلاً 4500" />
            </div>
            <div className="space-y-1.5">
              <Label>دریافت‌کننده (اختیاری)</Label>
              <Input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="مثلاً: شرکت برق کابل" />
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
              if (amountDiram === null) return;
              try {
                await create.mutateAsync({
                  date,
                  category,
                  payee: payee.trim() || null,
                  amountDiram,
                  note: note.trim() || null,
                });
                toast.success("مصرف ثبت شد.");
                onOpenChange(false);
                setDate(""); setPayee(""); setAmountAfn(""); setNote("");
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "ثبت"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VoidExpenseButton({ id }: { id: string }) {
  const voidExpense = useVoidExpense();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Ban className="h-3.5 w-3.5" /> باطل
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>باطل‌کردن مصرف</DialogTitle>
            <DialogDescription>دلیل الزامی است و در ریکارود نظارتی ثبت می‌شود.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>دلیل</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>لغو</Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 3 || voidExpense.isPending}
              onClick={async () => {
                try {
                  await voidExpense.mutateAsync({ id, reason: reason.trim() });
                  toast.success("مصرف باطل شد.");
                  setOpen(false);
                } catch (err) {
                  toast.error((err as Error).message);
                }
              }}
            >
              {voidExpense.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "باطل کردن"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
