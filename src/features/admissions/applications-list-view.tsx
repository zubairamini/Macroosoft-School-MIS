// Applications list: funnel filters, server-side pagination, review actions.

"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Search, GraduationCap, ArrowLeft, X } from "lucide-react";
import { useApplications, useApplicationTransition, useMe, apiErrorMessage } from "@/lib/api/hooks";
import { StatusBadge, Ltr, EmptyState, NoResultsState, TableSkeleton, Pager } from "@/components/shared";
import { faNum, formatJalali } from "@/lib/format";
import { navigate } from "@/app-shell/router";
import { hasGrant } from "@/app-shell/shell";

const STATUS_FILTERS = [
  ["", "همهٔ مرحله‌ها"],
  ["draft", "پیش‌نویس"],
  ["submitted", "ارائه‌شده"],
  ["under_review", "در حال بررسی"],
  ["approved", "تاییدشده"],
  ["rejected", "ردشده"],
  ["enrolled", "شمول‌شده"],
  ["cancelled", "لغو‌شده"],
] as const;

const PAGE_SIZE = 15;

export function ApplicationsListView() {
  const { data: me } = useMe();
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const transition = useApplicationTransition();

  const { data, isLoading, isFetching } = useApplications({
    q: q || undefined,
    status: status || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const canReview = hasGrant(me, "applications.review");
  const canSubmit = hasGrant(me, "applications.submit");
  const canCreate = hasGrant(me, "applications.create");

  async function quickSubmit(id: string) {
    try {
      await transition.mutateAsync({ id, action: "submit" });
      toast.success("درخواست ارائه شد.");
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">شمولیت‌ها</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            فرایند: درخواست ← بررسی ← تصمیم ← شمول · {data ? `${faNum(data.meta.total)} درخواست` : "…"}
          </p>
        </div>
        {canCreate ? (
          <Button onClick={() => navigate("/admissions/new")}>
            <GraduationCap className="h-4 w-4" /> درخواست جدید
          </Button>
        ) : null}
      </header>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { setQ(qInput); setPage(1); } }}
                placeholder="جستجو به نام یا شمارهٔ درخواست…"
                className="ps-9"
              />
            </div>
            <Select value={status || "all"} onValueChange={(v) => { setStatus(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map(([value, label]) => (
                  <SelectItem key={value} value={value || "all"}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => { setQ(qInput); setPage(1); }}>جستجو</Button>
            {(q || status) ? (
              <Button variant="ghost" size="sm" onClick={() => { setQ(""); setQInput(""); setStatus(""); setPage(1); }}>
                <X className="h-4 w-4" /> پاک کردن
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><TableSkeleton rows={6} cols={6} /></div>
          ) : !data || data.items.length === 0 ? (
            <div className="p-4">
              {q || status ? <NoResultsState query={q} /> : (
                <EmptyState
                  icon={GraduationCap}
                  title="درخواستی موجود نیست"
                  body="اولین درخواست شمولیت را ثبت کنید."
                  action={canCreate ? <Button size="sm" onClick={() => navigate("/admissions/new")}>درخواست جدید</Button> : undefined}
                />
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-start">شماره</TableHead>
                      <TableHead className="text-start">نام شاگرد</TableHead>
                      <TableHead className="text-start">صنف درخواستی</TableHead>
                      <TableHead className="text-start">ولیٔ اصلی</TableHead>
                      <TableHead className="text-start">تاریخ ایجاد</TableHead>
                      <TableHead className="text-start">مرحله</TableHead>
                      <TableHead className="text-start w-32">عملیات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className={isFetching ? "opacity-60 transition-soft" : "transition-soft"}>
                    {data.items.map((a) => (
                      <TableRow key={a.id} className="cursor-pointer" onClick={() => navigate(`/admissions/${a.id}`)}>
                        <TableCell dir="ltr" className="font-mono text-xs">{a.applicantNumber}</TableCell>
                        <TableCell className="font-medium">
                          {a.personal.firstName ?? "—"} {a.personal.fatherName ?? ""}
                        </TableCell>
                        <TableCell>{a.requestedGradeName ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {a.guardians.find((g) => g.isPrimary)?.fullName ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatJalali(a.createdAt.slice(0, 10))}</TableCell>
                        <TableCell><StatusBadge status={a.status} label={a.statusLabel} /></TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1">
                            {a.status === "draft" && canSubmit ? (
                              <Button size="sm" variant="outline" disabled={transition.isPending} onClick={() => quickSubmit(a.id)}>
                                ارائه
                              </Button>
                            ) : null}
                            {a.status === "submitted" && canReview ? (
                              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                                منتظر بررسی
                              </Badge>
                            ) : null}
                            <Button size="sm" variant="ghost" onClick={() => navigate(`/admissions/${a.id}`)}>
                              جزئیات <ArrowLeft className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="p-4">
                <Pager page={data.meta.page} pageSize={data.meta.pageSize} total={data.meta.total} onPage={setPage} />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
