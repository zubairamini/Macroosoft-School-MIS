// Payments ledger — every receipt across the accessible branches, with
// filters by date range / method / search and void (correction) support.

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
import { Ban, Banknote, Coins, Loader2, Search } from "lucide-react";
import { useMe, usePayments, useVoidPayment } from "@/lib/api/hooks";
import { EmptyState, NoResultsState, TableSkeleton, Ltr, KpiCard, JalaliDateInput } from "@/components/shared";
import { faMoney, faMoneyNum, faDate, faNum } from "@/lib/format";
import { hasGrant } from "@/app-shell/shell";
import { FinBadge, FinHeader } from "./shared";

export function PaymentsView() {
  const { data: me } = useMe();
  const canVoid = hasGrant(me, "payments.void");
  const [q, setQ] = useState("");
  const [method, setMethod] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: payments, isLoading } = usePayments({
    q: q.trim() || undefined,
    method: method || undefined,
    from: from || undefined,
    to: to || undefined,
  });

  const totals = useMemo(() => {
    const live = (payments ?? []).filter((p) => !p.voidedAt);
    return {
      count: live.length,
      total: live.reduce((s, p) => s + p.amountDiram, 0),
      voided: (payments ?? []).length - live.length,
    };
  }, [payments]);

  return (
    <div className="space-y-4">
      <FinHeader
        title="رسیدهای پرداخت"
        subtitle="هر پرداخت یک رسید ترتیبی دارد؛ اصلاح به‌جای حذف، باطل‌کردن با دلیل است."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="رسیدهای معتبر" value={faNum(totals.count)} icon={Coins} />
        <KpiCard label="مجموع وصولی" value={faMoneyNum(totals.total)} tone="primary" icon={Banknote} />
        <KpiCard label="باطل‌شده" value={faNum(totals.voided)} tone="amber" icon={Ban} />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="جستجو — شمارهٔ رسید یا شاگرد…"
                className="bg-card ps-9"
              />
            </div>
            <Select value={method || "all"} onValueChange={(v) => setMethod(v === "all" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه طریقه‌ها</SelectItem>
                <SelectItem value="cash">نقدی</SelectItem>
                <SelectItem value="bank">حساب بانکی</SelectItem>
                <SelectItem value="hawala">حواله</SelectItem>
                <SelectItem value="cheque">چک</SelectItem>
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
          ) : (payments ?? []).length === 0 ? (
            <div className="p-6">
              <NoResultsState query={q} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>رسید</TableHead>
                    <TableHead>تاریخ</TableHead>
                    <TableHead>شاگرد</TableHead>
                    <TableHead>فاکتور / دوره</TableHead>
                    <TableHead>مبلغ</TableHead>
                    <TableHead>طریقه</TableHead>
                    <TableHead>شعبه</TableHead>
                    <TableHead>وضعیت</TableHead>
                    {canVoid ? <TableHead className="w-20">عملیات</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(payments ?? []).map((p) => (
                    <TableRow key={p.id} className={p.voidedAt ? "opacity-60" : ""}>
                      <TableCell><Ltr className="text-xs font-semibold">{p.receiptNumber}</Ltr></TableCell>
                      <TableCell className="text-muted-foreground">{faDate(p.date)}</TableCell>
                      <TableCell>
                        <p className="font-medium">{p.studentName}</p>
                        <p className="text-xs text-muted-foreground"><Ltr>{p.studentNumber}</Ltr></p>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <Ltr className="text-xs">{p.invoiceNumber}</Ltr>
                        <p className="text-xs">{p.periodLabel}</p>
                      </TableCell>
                      <TableCell className="tabular-nums font-semibold">{faMoneyNum(p.amountDiram)}</TableCell>
                      <TableCell>{p.methodLabel}</TableCell>
                      <TableCell className="text-muted-foreground">{p.branchName ?? "—"}</TableCell>
                      <TableCell>
                        {p.voidedAt ? <FinBadge status="void" label="باطل‌شده" /> : <FinBadge status="paid" label="معتبر" />}
                      </TableCell>
                      {canVoid ? (
                        <TableCell>
                          {!p.voidedAt ? <VoidPaymentButton id={p.id} /> : null}
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
    </div>
  );
}

function VoidPaymentButton({ id }: { id: string }) {
  const voidPayment = useVoidPayment();
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
            <DialogTitle>باطل‌کردن رسید</DialogTitle>
            <DialogDescription>
              مبلغ این رسید به بدهی شاگرد برمی‌گردد؛ عملیات با دلیل شما در ریکارود نظارتی ثبت می‌شود.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>دلیل (الزامی)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>لغو</Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 3 || voidPayment.isPending}
              onClick={async () => {
                try {
                  await voidPayment.mutateAsync({ id, reason: reason.trim() });
                  toast.success("رسید باطل شد.");
                  setOpen(false);
                } catch (err) {
                  toast.error((err as Error).message);
                }
              }}
            >
              {voidPayment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "باطل کردن"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
