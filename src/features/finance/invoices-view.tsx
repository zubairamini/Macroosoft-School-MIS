// Invoices view — issue fee invoices (bulk or single), record payments,
// void, and inspect payment history. Parents see their children's invoices
// read-only; branch-bound staff see only their own branch.

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
import { Banknote, Ban, Loader2, Plus, ReceiptText, Search } from "lucide-react";
import {
  useMe, useAcademicYears, useFeeStructures,
  useInvoices, useInvoice, useIssueInvoices, useVoidInvoice,
  useCollectPayment, useVoidPayment,
} from "@/lib/api/hooks";
import type { InvoiceDto } from "@/lib/api/client";
import { EmptyState, NoResultsState, TableSkeleton, Ltr, JalaliDateInput, KpiCard } from "@/components/shared";
import { faMoney, faMoneyNum, afnToDiram, diramToAfnInput, faDate, faNum } from "@/lib/format";
import { hasGrant } from "@/app-shell/shell";
import { FinBadge, FinHeader, recentMonthOptions } from "./shared";

export function InvoicesView() {
  const { data: me } = useMe();
  const canManage = hasGrant(me, "invoices.manage");
  const canCollect = hasGrant(me, "payments.collect");
  const canVoidPayments = hasGrant(me, "payments.void");
  const [status, setStatus] = useState("");
  const [outstanding, setOutstanding] = useState(false);
  const [periodKey, setPeriodKey] = useState("");
  const [q, setQ] = useState("");
  const [issueOpen, setIssueOpen] = useState(false);
  const [payFor, setPayFor] = useState<InvoiceDto | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: invoices, isLoading } = useInvoices({
    status: status || undefined,
    outstanding: outstanding ? "true" : undefined,
    periodKey: periodKey || undefined,
    q: q.trim() || undefined,
  });

  const totals = useMemo(() => {
    const list = invoices ?? [];
    return {
      count: list.length,
      net: list.reduce((s, r) => s + (r.status === "void" ? 0 : r.netDiram), 0),
      paid: list.reduce((s, r) => s + (r.status === "void" ? 0 : r.paidDiram), 0),
      balance: list.reduce((s, r) => s + r.balanceDiram, 0),
    };
  }, [invoices]);

  return (
    <div className="space-y-4">
      <FinHeader
        title="فاکتورهای شهریه"
        subtitle="فاکتور بدون پرداخت «صادرشده» می‌ماند — بدهی هرگز صفر شمرده نمی‌شود."
        action={canManage ? (
          <Button onClick={() => setIssueOpen(true)}>
            <Plus className="h-4 w-4" /> صدور فاکتور
          </Button>
        ) : null}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="فاکتورها" value={faNum(totals.count)} icon={ReceiptText} />
        <KpiCard label="مبلغ خالص" value={faMoneyNum(totals.net)} icon={ReceiptText} />
        <KpiCard label="پرداخت‌شده" value={faMoneyNum(totals.paid)} tone="primary" icon={Banknote} />
        <KpiCard label="باقی‌مانده" value={faMoneyNum(totals.balance)} tone="amber" icon={Banknote} />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="جستجو — شمارهٔ فاکتور یا شاگرد…"
                className="bg-card ps-9"
              />
            </div>
            <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                <SelectItem value="issued">صادرشده</SelectItem>
                <SelectItem value="partially_paid">بخشی پرداخت‌شده</SelectItem>
                <SelectItem value="paid">پرداخت‌شده</SelectItem>
                <SelectItem value="void">باطل‌شده</SelectItem>
              </SelectContent>
            </Select>
            <Select value={periodKey || "all"} onValueChange={(v) => setPeriodKey(v === "all" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه دوره‌ها</SelectItem>
                {recentMonthOptions(12).map((m) => (
                  <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={outstanding ? "default" : "outline"}
              onClick={() => setOutstanding((v) => !v)}
            >
              فقط بدهکاران
            </Button>
          </div>

          {isLoading ? (
            <div className="p-4"><TableSkeleton rows={6} cols={7} /></div>
          ) : (invoices ?? []).length === 0 ? (
            <div className="p-6">
              <NoResultsState query={q} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>شماره</TableHead>
                    <TableHead>شاگرد</TableHead>
                    <TableHead>دوره</TableHead>
                    <TableHead>خالص</TableHead>
                    <TableHead>پرداخت‌شده</TableHead>
                    <TableHead>باقی‌مانده</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>سررسید</TableHead>
                    <TableHead className="w-40">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(invoices ?? []).map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell><Ltr className="text-xs font-semibold">{inv.invoiceNumber}</Ltr></TableCell>
                      <TableCell>
                        <p className="font-medium">{inv.studentName}</p>
                        <p className="text-xs text-muted-foreground"><Ltr>{inv.studentNumber}</Ltr>{inv.branchName ? ` · ${inv.branchName}` : ""}</p>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{inv.periodLabel}</TableCell>
                      <TableCell className="tabular-nums">
                        {faMoneyNum(inv.netDiram)}
                        {inv.discountDiram > 0 ? (
                          <p className="text-[10px] text-emerald-700">تخفیف {faMoneyNum(inv.discountDiram)}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="tabular-nums">{faMoneyNum(inv.paidDiram)}</TableCell>
                      <TableCell className="tabular-nums font-semibold">
                        {inv.status === "void" ? "—" : faMoneyNum(inv.balanceDiram)}
                      </TableCell>
                      <TableCell><FinBadge status={inv.status} label={inv.statusLabel} /></TableCell>
                      <TableCell className="text-muted-foreground">{faDate(inv.dueDate)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setDetailId(inv.id)}>
                            جزئیات
                          </Button>
                          {canCollect && inv.balanceDiram > 0 && inv.status !== "void" ? (
                            <Button variant="outline" size="sm" onClick={() => setPayFor(inv)}>
                              <Banknote className="h-3.5 w-3.5" /> پرداخت
                            </Button>
                          ) : null}
                          {canManage && inv.status === "issued" && inv.paidDiram === 0 ? (
                            <VoidInvoiceButton invoice={inv} />
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {issueOpen ? <IssueInvoicesDialog open onOpenChange={setIssueOpen} /> : null}
      {payFor ? <CollectPaymentDialog invoice={payFor} onClose={() => setPayFor(null)} /> : null}
      {detailId ? <InvoiceDetailDialog id={detailId} onClose={() => setDetailId(null)} canVoidPayments={canVoidPayments} /> : null}
    </div>
  );
}

// ── Void invoice ────────────────────────────────────────────────────────────

function VoidInvoiceButton({ invoice }: { invoice: InvoiceDto }) {
  const voidMutation = useVoidInvoice();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <>
      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setOpen(true)}>
        <Ban className="h-3.5 w-3.5" /> باطل
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>باطل‌کردن فاکتور</DialogTitle>
            <DialogDescription>
              فاکتور <Ltr>{invoice.invoiceNumber}</Ltr> برای {invoice.studentName} — این عمل در ریکارود نظارتی ثبت می‌شود.
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
              disabled={reason.trim().length < 3 || voidMutation.isPending}
              onClick={async () => {
                try {
                  await voidMutation.mutateAsync({ id: invoice.id, reason: reason.trim() });
                  toast.success("فاکتور باطل شد.");
                  setOpen(false);
                } catch (err) {
                  toast.error((err as Error).message);
                }
              }}
            >
              {voidMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "باطل کردن"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Issue invoices ──────────────────────────────────────────────────────────

function IssueInvoicesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: years } = useAcademicYears();
  const currentYear = years?.find((y) => y.isCurrent) ?? years?.[0];
  const { data: fees } = useFeeStructures({ academicYearId: currentYear?.id });
  const activeFees = (fees ?? []).filter((f) => f.isActive);
  const issue = useIssueInvoices();

  const [feeId, setFeeId] = useState("");
  const [monthKey, setMonthKey] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [dueDate, setDueDate] = useState("");

  const fee = activeFees.find((f) => f.id === feeId);
  const months = recentMonthOptions(12);
  const isMonthly = fee?.periodKind === "monthly";
  const periodKey = isMonthly ? monthKey : fee ? `once-${feeId.slice(-6)}` : "";
  const periodLabel = isMonthly
    ? months.find((m) => m.key === monthKey)?.label ?? ""
    : customLabel.trim();

  const valid = fee && periodKey && periodLabel.length >= 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>صدور فاکتور شهریه</DialogTitle>
          <DialogDescription>
            برای همهٔ شاگردان فعالِ صنف‌های این پلان فیس در شعبهٔ فعال، فاکتور صادر می‌شود؛
            شاگردانی که قبلاً برای این دوره فاکتور دارند، رد می‌شوند.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>پلان فیس</Label>
            <Select value={feeId || "none"} onValueChange={setFeeId}>
              <SelectTrigger><SelectValue placeholder="انتخاب…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none" disabled>انتخاب…</SelectItem>
                {activeFees.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name} — {faMoney(f.amountDiram)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fee ? (
              <p className="text-xs text-muted-foreground">
                {fee.periodKindLabel} · {fee.branchName ?? "همه شعبه‌ها"} · مبلغ {faMoney(fee.amountDiram)}
              </p>
            ) : null}
          </div>
          {isMonthly ? (
            <div className="space-y-1.5">
              <Label>ماه</Label>
              <Select value={monthKey || "none"} onValueChange={setMonthKey}>
                <SelectTrigger><SelectValue placeholder="انتخاب…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled>انتخاب…</SelectItem>
                  {months.map((m) => (
                    <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : fee ? (
            <div className="space-y-1.5">
              <Label>عنوان دوره</Label>
              <Input
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="مثلاً: فیس ثبت‌نام ۱۴۰۵"
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label>تاریخ سررسید (اختیاری)</Label>
            <JalaliDateInput value={dueDate} onChange={setDueDate} placeholder="۱۴۰۵/۰۹/۳۰" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>لغو</Button>
          <Button
            disabled={!valid || issue.isPending}
            onClick={async () => {
              try {
                const res = await issue.mutateAsync({
                  feeStructureId: feeId,
                  periodKey,
                  periodLabel,
                  dueDate: dueDate || null,
                });
                toast.success(
                  `${faNum(res.createdCount)} فاکتور صادر شد${res.skippedCount > 0 ? ` · ${faNum(res.skippedCount)} شاگرد قبلاً فاکتور داشت` : ""}.`,
                );
                onOpenChange(false);
                setFeeId(""); setMonthKey(""); setCustomLabel(""); setDueDate("");
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          >
            {issue.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "صدور"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Collect payment ─────────────────────────────────────────────────────────

function CollectPaymentDialog({ invoice, onClose }: { invoice: InvoiceDto; onClose: () => void }) {
  const collect = useCollectPayment();
  const [amountAfn, setAmountAfn] = useState(diramToAfnInput(invoice.balanceDiram));
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [receiptNumber, setReceiptNumber] = useState<string | null>(null);

  const amountDiram = afnToDiram(amountAfn ?? "");
  const valid = amountDiram !== null && amountDiram > 0 && amountDiram <= invoice.balanceDiram;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>ثبت پرداخت</DialogTitle>
          <DialogDescription>
            فاکتور <Ltr>{invoice.invoiceNumber}</Ltr> · {invoice.studentName} · {invoice.periodLabel}
          </DialogDescription>
        </DialogHeader>
        {receiptNumber ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
              <ReceiptText className="mx-auto h-8 w-8 text-emerald-700" />
              <p className="mt-2 text-sm font-semibold text-emerald-800">رسید ثبت شد</p>
              <p className="mt-1 text-lg font-bold"><Ltr>{receiptNumber}</Ltr></p>
              <p className="mt-1 text-sm text-emerald-800">{faMoney(amountDiram ?? 0)}</p>
            </div>
            <DialogFooter>
              <Button onClick={onClose}>بستن</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
                <div className="flex justify-between"><span>مبلغ خالص</span><span className="tabular-nums">{faMoney(invoice.netDiram)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>پرداخت‌شده</span><span className="tabular-nums">{faMoney(invoice.paidDiram)}</span></div>
                <div className="flex justify-between font-semibold"><span>باقی‌مانده</span><span className="tabular-nums">{faMoney(invoice.balanceDiram)}</span></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>مبلغ پرداخت (افغانی)</Label>
                  <Input
                    dir="ltr"
                    inputMode="decimal"
                    value={amountAfn}
                    onChange={(e) => setAmountAfn(e.target.value)}
                  />
                  {amountDiram !== null && amountDiram > invoice.balanceDiram ? (
                    <p className="text-xs text-destructive">مبلغ بیش از بقیهٔ فاکتور است.</p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label>طریقهٔ پرداخت</Label>
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">نقدی</SelectItem>
                      <SelectItem value="bank">حساب بانکی</SelectItem>
                      <SelectItem value="hawala">حواله</SelectItem>
                      <SelectItem value="cheque">چک</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>یادداشت (اختیاری)</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>لغو</Button>
              <Button
                disabled={!valid || collect.isPending}
                onClick={async () => {
                  if (amountDiram === null) return;
                  try {
                    const res = await collect.mutateAsync({
                      invoiceId: invoice.id,
                      amountDiram,
                      method,
                      note: note.trim() || null,
                    });
                    setReceiptNumber(res.receiptNumber);
                  } catch (err) {
                    toast.error((err as Error).message);
                  }
                }}
              >
                {collect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "ثبت رسید"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Invoice detail ──────────────────────────────────────────────────────────

function InvoiceDetailDialog({
  id, onClose, canVoidPayments,
}: { id: string; onClose: () => void; canVoidPayments: boolean }) {
  const { data: inv } = useInvoice(id);
  const voidPayment = useVoidPayment();
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  if (!inv) {
    return (
      <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>جزئیات فاکتور</DialogTitle>
            <DialogDescription className="sr-only">در حال بارگذاری…</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <ReceiptText className="h-5 w-5 text-primary" />
            <Ltr>{inv.invoiceNumber}</Ltr>
            <FinBadge status={inv.status} label={inv.statusLabel} />
          </DialogTitle>
          <DialogDescription>
            {inv.studentName} ولد: {inv.fatherName} · <Ltr>{inv.studentNumber}</Ltr>
            {inv.branchName ? ` · ${inv.branchName}` : ""} · {inv.periodLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 rounded-lg border border-border bg-muted/50 p-3 text-sm sm:grid-cols-2">
          <div className="flex justify-between"><span className="text-muted-foreground">مبلغ ناخالص</span><span className="tabular-nums">{faMoney(inv.amountDiram)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">تخفیف</span><span className="tabular-nums">{faMoney(inv.discountDiram)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">مبلغ خالص</span><span className="tabular-nums font-semibold">{faMoney(inv.netDiram)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">پرداخت‌شده</span><span className="tabular-nums font-semibold text-emerald-700">{faMoney(inv.paidDiram)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">باقی‌مانده</span><span className="tabular-nums font-semibold text-amber-700">{faMoney(inv.balanceDiram)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">سررسید</span><span>{faDate(inv.dueDate)}</span></div>
        </div>

        <div className="max-h-64 overflow-y-auto scroll-area-thin">
          {inv.payments.length === 0 ? (
            <EmptyState
              icon={Banknote}
              title="هنوز پرداختی ثبت نشده است"
              body="پرداخت نبودن ≠ پرداخت‌شده — این فاکتور کامل بدهکار است."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>رسید</TableHead>
                  <TableHead>تاریخ</TableHead>
                  <TableHead>مبلغ</TableHead>
                  <TableHead>طریقه</TableHead>
                  <TableHead>وضعیت</TableHead>
                  {canVoidPayments ? <TableHead className="w-20">عملیات</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {inv.payments.map((p) => (
                  <TableRow key={p.id} className={p.voidedAt ? "opacity-60" : ""}>
                    <TableCell><Ltr className="text-xs font-semibold">{p.receiptNumber}</Ltr></TableCell>
                    <TableCell className="text-muted-foreground">{faDate(p.date)}</TableCell>
                    <TableCell className="tabular-nums">{faMoney(p.amountDiram)}</TableCell>
                    <TableCell>{p.methodLabel}</TableCell>
                    <TableCell>
                      {p.voidedAt ? (
                        <FinBadge status="void" label="باطل‌شده" />
                      ) : (
                        <FinBadge status="paid" label="معتبر" />
                      )}
                    </TableCell>
                    {canVoidPayments ? (
                      <TableCell>
                        {!p.voidedAt ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => { setVoidingId(p.id); setReason(""); }}
                          >
                            باطل
                          </Button>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => window.print()}>چاپ</Button>
          <Button onClick={onClose}>بستن</Button>
        </DialogFooter>

        {voidingId ? (
          <Dialog open onOpenChange={(v) => { if (!v) setVoidingId(null); }}>
            <DialogContent dir="rtl" className="max-w-md">
              <DialogHeader>
                <DialogTitle>باطل‌کردن رسید</DialogTitle>
                <DialogDescription>
                  مبلغ این رسید به بدهی شاگرد برمی‌گردد و عملیات در ریکارود نظارتی ثبت می‌شود.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label>دلیل (الزامی)</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setVoidingId(null)}>لغو</Button>
                <Button
                  variant="destructive"
                  disabled={reason.trim().length < 3 || voidPayment.isPending}
                  onClick={async () => {
                    try {
                      await voidPayment.mutateAsync({ id: voidingId, reason: reason.trim() });
                      toast.success("رسید باطل شد.");
                      setVoidingId(null);
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
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
