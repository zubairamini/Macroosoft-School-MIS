// Library view — Phase 4: catalog (titles + physical copies), loans with
// checkout / return / lost actions. Fines flow into the finance module as
// linked invoices.

"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { BookOpen, Library, Loader2, Plus, BookX, Undo2, Search } from "lucide-react";
import { useMe, useStudents, useSubjects, useLibraryStats, useBookTitles, useCreateBookTitle, useUpdateBookTitle, useBookCopies, useAddBookCopies, useBookLoans, useCheckoutLoan, useReturnLoan, useMarkLoanLost } from "@/lib/api/hooks";
import { EmptyState, NoResultsState, TableSkeleton, Ltr, KpiCard, JalaliDateInput } from "@/components/shared";
import { faMoneyNum, faNum, faDate } from "@/lib/format";
import { hasGrant } from "@/app-shell/shell";
import { FinBadge, FinHeader } from "@/features/finance/shared";
import { apiErrorMessage } from "@/lib/api/hooks";

export function LibraryView() {
  const { data: me } = useMe();
  const canManage = hasGrant(me, "library.manage");
  const { data: stats } = useLibraryStats();
  const [tab, setTab] = useState("catalog");

  return (
    <div className="space-y-4">
      <FinHeader
        title="کتابخانهٔ مکتب"
        subtitle="کاتلاگ کتاب‌ها، نسخه‌های فیزیکی و امانت‌ها — جریمه‌ها به‌صورت فاکتور در امور مالی ثبت می‌شوند."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="عنوان‌های فعال" value={faNum(stats?.titleCount ?? 0)} icon={Library} />
        <KpiCard label="کل نسخه‌ها" value={faNum(stats?.copyCount ?? 0)} icon={BookOpen} />
        <KpiCard label="امانت‌های جاری" value={faNum(stats?.activeLoans ?? 0)} icon={BookOpen} tone="amber" />
        <KpiCard label="امانات تأخیرشده" value={faNum(stats?.overdueLoans ?? 0)} icon={BookX} tone="amber" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="catalog">کاتلاگ کتاب‌ها</TabsTrigger>
          <TabsTrigger value="loans">امانت‌ها</TabsTrigger>
        </TabsList>
        <TabsContent value="catalog" className="mt-3">
          <CatalogTab canManage={canManage} />
        </TabsContent>
        <TabsContent value="loans" className="mt-3">
          <LoansTab canManage={canManage} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Catalog tab ─────────────────────────────────────────────────────────────

function CatalogTab({ canManage }: { canManage: boolean }) {
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [copiesTitleId, setCopiesTitleId] = useState<string | null>(null);
  const { data: titles, isLoading } = useBookTitles({ q: q || undefined });

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <div className="relative w-64">
            <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="جستجوی نام کتاب…"
              className="ps-8"
            />
          </div>
          {canManage ? (
            <div className="ms-auto">
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> کتاب جدید
              </Button>
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <div className="p-4"><TableSkeleton rows={6} cols={6} /></div>
        ) : (titles ?? []).length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Library}
              title="کتابی ثبت نشده است"
              body={canManage ? "اولین کتاب کتابخانه را ثبت کنید." : undefined}
            />
          </div>
        ) : q && (titles ?? []).length === 0 ? (
          <div className="p-6"><NoResultsState query={q} /></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>نام کتاب</TableHead>
                  <TableHead>نویسنده</TableHead>
                  <TableHead>مضمون</TableHead>
                  <TableHead>صنف‌ها</TableHead>
                  <TableHead>نوع</TableHead>
                  <TableHead>نسخه‌ها</TableHead>
                  {canManage ? <TableHead className="w-40">عملیات</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(titles ?? []).map((t) => (
                  <TableRow key={t.id} className={t.isActive ? "" : "opacity-60"}>
                    <TableCell className="font-medium">{t.title}</TableCell>
                    <TableCell className="text-muted-foreground">{t.author ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{t.subjectName ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.gradeLevels.length > 0 ? faNum(t.gradeLevels.join("، ")) : "—"}
                    </TableCell>
                    <TableCell>
                      <FinBadge status={t.isTextbook ? "approved" : "issued"} label={t.isTextbook ? "کتاب درسی" : "کتابخانه"} />
                    </TableCell>
                    <TableCell className="tabular-nums">{faNum(t.copyCount)}</TableCell>
                    {canManage ? (
                      <TableCell className="space-x-1 space-x-reverse">
                        <Button variant="ghost" size="sm" onClick={() => setCopiesTitleId(t.id)}>
                          <Plus className="h-3.5 w-3.5" /> نسخه
                        </Button>
                        {t.isActive ? <DeactivateTitleButton id={t.id} /> : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {createOpen ? <CreateTitleDialog open onOpenChange={setCreateOpen} /> : null}
      {copiesTitleId ? (
        <AddCopiesDialog
          titleId={copiesTitleId}
          onClose={() => setCopiesTitleId(null)}
        />
      ) : null}
    </Card>
  );
}

function DeactivateTitleButton({ id }: { id: string }) {
  const update = useUpdateBookTitle();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-destructive hover:text-destructive"
      disabled={update.isPending}
      onClick={async () => {
        try {
          await update.mutateAsync({ id, isActive: false });
          toast.success("کتاب غیرفعال شد.");
        } catch (err) {
          toast.error(apiErrorMessage(err));
        }
      }}
    >
      توقف
    </Button>
  );
}

function CreateTitleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreateBookTitle();
  const { data: subjects } = useSubjects();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [publisher, setPublisher] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [grades, setGrades] = useState("");
  const [isTextbook, setIsTextbook] = useState("false");
  const [note, setNote] = useState("");

  const gradeList = useMemo(
    () => grades.split(/[،,\s]+/).map((g) => Number(g.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))))).filter((n) => n >= 1 && n <= 12),
    [grades],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>ثبت کتاب جدید</DialogTitle>
          <DialogDescription>
            کتاب در شعبهٔ فعال شما ثبت می‌شود؛ پس از آن می‌توانید نسخه‌های فیزیکی افزود.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>نام کتاب</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: ریاضی صنف پنجم" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>نویسنده (اختیاری)</Label>
              <Input value={author} onChange={(e) => setAuthor(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>ناشر (اختیاری)</Label>
              <Input value={publisher} onChange={(e) => setPublisher(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>مضمون (اختیاری)</Label>
              <Select value={subjectId || "none"} onValueChange={(v) => setSubjectId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— بدون مضمون —</SelectItem>
                  {(subjects ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nameDari}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>نوع</Label>
              <Select value={isTextbook} onValueChange={setIsTextbook}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">کتاب کتابخانه</SelectItem>
                  <SelectItem value="true">کتاب درسی</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>صنف‌ها (اختیاری — با کاما)</Label>
            <Input value={grades} onChange={(e) => setGrades(e.target.value)} placeholder="مثلاً: ۴، ۵، ۶" dir="rtl" />
          </div>
          <div className="space-y-1.5">
            <Label>یادداشت (اختیاری)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>لغو</Button>
          <Button
            disabled={title.trim().length < 2 || create.isPending}
            onClick={async () => {
              try {
                await create.mutateAsync({
                  title: title.trim(),
                  author: author.trim() || null,
                  publisher: publisher.trim() || null,
                  subjectId: subjectId || null,
                  gradeLevels: gradeList,
                  isTextbook: isTextbook === "true",
                  note: note.trim() || null,
                });
                toast.success("کتاب ثبت شد.");
                onOpenChange(false);
                setTitle(""); setAuthor(""); setPublisher(""); setSubjectId(""); setGrades(""); setNote("");
              } catch (err) {
                toast.error(apiErrorMessage(err));
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

function AddCopiesDialog({ titleId, onClose }: { titleId: string; onClose: () => void }) {
  const addCopies = useAddBookCopies();
  const [count, setCount] = useState("5");
  const [condition, setCondition] = useState("");
  const n = Number(count.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))));
  const valid = Number.isInteger(n) && n >= 1 && n <= 200;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>افزودن نسخه‌های فیزیکی</DialogTitle>
          <DialogDescription>
            برای هر نسخه یک کوډ یکتا (مثل B-1405-0007) در همین تراکنش صادر می‌شود.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>تعداد نسخه</Label>
            <Input dir="ltr" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>حالت نسخه‌ها (اختیاری)</Label>
            <Input value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="مثلاً: نو" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>لغو</Button>
          <Button
            disabled={!valid || addCopies.isPending}
            onClick={async () => {
              try {
                const res = await addCopies.mutateAsync({
                  titleId,
                  count: n,
                  condition: condition.trim() || null,
                });
                toast.success(`${faNum(res.createdCount)} نسخه ثبت شد.`);
                onClose();
              } catch (err) {
                toast.error(apiErrorMessage(err));
              }
            }}
          >
            {addCopies.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "افزودن"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Loans tab ───────────────────────────────────────────────────────────────

function LoansTab({ canManage }: { canManage: boolean }) {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const { data: loans, isLoading } = useBookLoans({
    status: status || undefined,
    q: q || undefined,
  });

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه امانت‌ها</SelectItem>
              <SelectItem value="active">جاری</SelectItem>
              <SelectItem value="returned">برگشت‌شده</SelectItem>
              <SelectItem value="lost">گم‌شده</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative w-56">
            <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="کوډ نسخه / شمارهٔ شاگرد…" className="ps-8" />
          </div>
          {canManage ? (
            <div className="ms-auto">
              <Button onClick={() => setCheckoutOpen(true)}>
                <Plus className="h-4 w-4" /> امانت جدید
              </Button>
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <div className="p-4"><TableSkeleton rows={6} cols={7} /></div>
        ) : (loans ?? []).length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={BookOpen}
              title="امانتی ثبت نشده است"
              body={canManage ? "اولین امانت را ثبت کنید." : undefined}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>کوډ نسخه</TableHead>
                  <TableHead>کتاب</TableHead>
                  <TableHead>شاگرد</TableHead>
                  <TableHead>تاریخ امانت</TableHead>
                  <TableHead>موعد بازگشت</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>جریمه</TableHead>
                  {canManage ? <TableHead className="w-40">عملیات</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(loans ?? []).map((l) => (
                  <TableRow key={l.id}>
                    <TableCell><Ltr className="text-xs font-semibold">{l.copyCode}</Ltr></TableCell>
                    <TableCell className="font-medium">{l.bookTitle}</TableCell>
                    <TableCell>
                      <span className="font-medium">{l.studentName}</span>{" "}
                      <span className="text-xs text-muted-foreground">({l.studentNumber})</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{faDate(l.loanedOn)}</TableCell>
                    <TableCell className={l.isOverdue ? "font-semibold text-red-700" : "text-muted-foreground"}>
                      {faDate(l.dueOn)} {l.isOverdue ? "(تأخیر)" : ""}
                    </TableCell>
                    <TableCell>
                      <FinBadge status={l.status === "active" ? (l.isOverdue ? "issued" : "active") : l.status === "returned" ? "paid" : "void"} label={l.statusLabel} />
                    </TableCell>
                    <TableCell className="tabular-nums">{l.fineDiram > 0 ? faMoneyNum(l.fineDiram) : "—"}</TableCell>
                    {canManage ? (
                      <TableCell>
                        {l.status === "active" ? <LoanActions loan={l} /> : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {checkoutOpen ? <CheckoutDialog open onOpenChange={setCheckoutOpen} /> : null}
    </Card>
  );
}

function LoanActions({ loan }: { loan: { id: string; dueOn: string; isOverdue: boolean } }) {
  const [mode, setMode] = useState<"none" | "return" | "lost">("none");

  if (mode === "return") {
    return <ReturnDialog loan={loan} onClose={() => setMode("none")} />;
  }
  if (mode === "lost") {
    return <LostDialog loan={loan} onClose={() => setMode("none")} />;
  }
  return (
    <div className="flex gap-1">
      <Button variant="ghost" size="sm" onClick={() => setMode("return")}>
        <Undo2 className="h-3.5 w-3.5" /> بازگشت
      </Button>
      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setMode("lost")}>
        <BookX className="h-3.5 w-3.5" /> گم‌شده
      </Button>
    </div>
  );
}

function ReturnDialog({ loan, onClose }: { loan: { id: string; dueOn: string; isOverdue: boolean }; onClose: () => void }) {
  const returnLoan = useReturnLoan();
  const [fineAfn, setFineAfn] = useState("");
  const [note, setNote] = useState("");
  const fineDiram = fineAfn.trim()
    ? Math.round(Number(fineAfn.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[,٬،\s]/g, "")) * 100)
    : 0;
  const fineValid = fineDiram === 0 ? true : loan.isOverdue && fineDiram > 0 && Number.isFinite(fineDiram);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>بازگشت کتاب</DialogTitle>
          <DialogDescription>
            {loan.isOverdue
              ? "امانت تأخیر دارد؛ در صورت جریمه، یک فاکتور مالی برای شاگرد صادر می‌شود."
              : "امانت به‌وقت است — جریمه مجاز نیست."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {loan.isOverdue ? (
            <div className="space-y-1.5">
              <Label>جریمهٔ تأخیر (افغانی — اختیاری)</Label>
              <Input dir="ltr" inputMode="decimal" value={fineAfn} onChange={(e) => setFineAfn(e.target.value)} placeholder="مثلاً 100" />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label>یادداشت (اختیاری)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>لغو</Button>
          <Button
            disabled={!fineValid || returnLoan.isPending}
            onClick={async () => {
              try {
                await returnLoan.mutateAsync({
                  id: loan.id,
                  fineDiram: loan.isOverdue ? fineDiram : 0,
                  note: note.trim() || null,
                });
                toast.success("بازگشت کتاب ثبت شد.");
                onClose();
              } catch (err) {
                toast.error(apiErrorMessage(err));
              }
            }}
          >
            {returnLoan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "ثبت بازگشت"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LostDialog({ loan, onClose }: { loan: { id: string }; onClose: () => void }) {
  const markLost = useMarkLoanLost();
  const [fineAfn, setFineAfn] = useState("");
  const [note, setNote] = useState("");
  const fineDiram = fineAfn.trim()
    ? Math.round(Number(fineAfn.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[,٬،\s]/g, "")) * 100)
    : 0;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>ثبت کتاب گم‌شده</DialogTitle>
          <DialogDescription>
            نسخه «گم‌شده» علامت‌گذاری می‌شود و در صورت جریمه، فاکتور مالی صادر می‌گردد.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>جریمه (افغانی — اختیاری)</Label>
            <Input dir="ltr" inputMode="decimal" value={fineAfn} onChange={(e) => setFineAfn(e.target.value)} placeholder="مثلاً 350" />
          </div>
          <div className="space-y-1.5">
            <Label>یادداشت (اختیاری)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>لغو</Button>
          <Button
            variant="destructive"
            disabled={markLost.isPending || (fineAfn.trim() !== "" && (!Number.isFinite(fineDiram) || fineDiram < 0))}
            onClick={async () => {
              try {
                await markLost.mutateAsync({ id: loan.id, fineDiram, note: note.trim() || null });
                toast.success("کتاب گم‌شده ثبت شد.");
                onClose();
              } catch (err) {
                toast.error(apiErrorMessage(err));
              }
            }}
          >
            {markLost.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "ثبت گم‌شدن"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CheckoutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const checkout = useCheckoutLoan();
  const [copyQuery, setCopyQuery] = useState("");
  const [copyId, setCopyId] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const [studentId, setStudentId] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [note, setNote] = useState("");

  const { data: copies } = useBookCopies({ status: "available", q: copyQuery || undefined });
  const { data: students } = useStudents({ q: studentQuery || undefined, pageSize: 10 });

  const valid = copyId && studentId && dueOn.length >= 8;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>امانت کتاب</DialogTitle>
          <DialogDescription>
            نسخه باید «موجود» باشد و شاگرد در شعبهٔ همین کتاب شمولیت فعال داشته باشد.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>نسخهٔ کتاب</Label>
            <div className="flex gap-2">
              <Input
                value={copyQuery}
                onChange={(e) => setCopyQuery(e.target.value)}
                placeholder="جستجوی کوډ نسخه…"
                dir="ltr"
              />
            </div>
            <Select value={copyId || "none"} onValueChange={(v) => setCopyId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="یک نسخه انتخاب کنید" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— انتخاب نسخه —</SelectItem>
                {(copies ?? []).slice(0, 30).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.copyCode} — {c.bookTitle}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>شاگرد</Label>
            <Input
              value={studentQuery}
              onChange={(e) => setStudentQuery(e.target.value)}
              placeholder="جستجوی نام یا شمارهٔ شاگرد…"
            />
            <Select value={studentId || "none"} onValueChange={(v) => setStudentId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="یک شاگرد انتخاب کنید" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— انتخاب شاگرد —</SelectItem>
                {(students?.items ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.personal.firstName ?? "—"} {s.personal.fatherName ?? ""} ({s.studentNumber})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>موعد بازگشت</Label>
            <JalaliDateInput value={dueOn} onChange={setDueOn} placeholder="۱۴۰۵/۰۹/۱۵" />
          </div>
          <div className="space-y-1.5">
            <Label>یادداشت (اختیاری)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>لغو</Button>
          <Button
            disabled={!valid || checkout.isPending}
            onClick={async () => {
              try {
                await checkout.mutateAsync({ copyId, studentId, dueOn, note: note.trim() || null });
                toast.success("امانت ثبت شد.");
                onOpenChange(false);
                setCopyId(""); setStudentId(""); setDueOn(""); setNote("");
              } catch (err) {
                toast.error(apiErrorMessage(err));
              }
            }}
          >
            {checkout.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "ثبت امانت"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
