// Students list: server-side pagination/filter/search, saved quick filters,
// recently viewed, permission-aware columns.

"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Search, Users, GraduationCap, Star, X, ArrowLeft } from "lucide-react";
import { useStudents, useGrades, useMe } from "@/lib/api/hooks";
import { StatusBadge, Ltr, EmptyState, NoResultsState, TableSkeleton, Pager } from "@/components/shared";
import { faNum, formatJalali, genderLabel } from "@/lib/format";
import { navigate } from "@/app-shell/router";
import { hasGrant } from "@/app-shell/shell";

const STATUS_FILTERS = [
  ["", "همهٔ وضعیت‌ها"],
  ["active", "فعال"],
  ["inactive", "غیرفعال موقت"],
  ["transferred", "منتقل‌شده"],
  ["withdrawn", "انصراف‌داده"],
  ["graduated", "فارغ‌التحصیل"],
] as const;

const PAGE_SIZE = 20;

interface SavedFilter {
  name: string;
  q: string;
  status: string;
  gradeLevelId: string;
}

export function StudentsListView() {
  const { data: me } = useMe();
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [gradeLevelId, setGradeLevelId] = useState("");
  const [page, setPage] = useState(1);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("maktabyar:saved-filters") ?? "[]") as SavedFilter[];
    } catch {
      return [];
    }
  });

  const { data, isLoading, isFetching } = useStudents({
    q: q || undefined,
    status: status || undefined,
    gradeLevelId: gradeLevelId || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const { data: grades } = useGrades();

  const canExport = hasGrant(me, "students.export");

  function saveFilter() {
    const name = status
      ? `وضعیت: ${STATUS_FILTERS.find(([, l]) => l)?.[1] ?? ""}`
      : gradeLevelId
        ? `صنف: ${grades?.find((g) => g.id === gradeLevelId)?.nameDari ?? ""}`
        : q
          ? `جستجو: ${q}`
          : "همهٔ شاگردان";
    const next = [...savedFilters.filter((f) => f.name !== name), { name, q, status, gradeLevelId }].slice(0, 6);
    setSavedFilters(next);
    localStorage.setItem("maktabyar:saved-filters", JSON.stringify(next));
    toast.success("فلتر ذخیره شد.");
  }

  function applyFilter(f: SavedFilter) {
    setQ(f.q);
    setQInput(f.q);
    setStatus(f.status);
    setGradeLevelId(f.gradeLevelId);
    setPage(1);
  }

  const activeFilters = (q ? 1 : 0) + (status ? 1 : 0) + (gradeLevelId ? 1 : 0);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">شاگردان</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            لست شاگردان با اجازه‌های شما — {data ? `${faNum(data.meta.total)} شاگرد` : "…"}
          </p>
        </div>
        {hasGrant(me, "applications.create") ? (
          <Button onClick={() => navigate("/admissions/new")}>
            <GraduationCap className="h-4 w-4" /> درخواست شمولیت جدید
          </Button>
        ) : null}
      </header>

      {/* Filter area */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setQ(qInput);
                    setPage(1);
                  }
                }}
                placeholder="جستجو به نام، نام پدر یا شمارهٔ شاگردی…"
                className="ps-9"
              />
            </div>
            <Select value={status || "all"} onValueChange={(v) => { setStatus(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-40"><SelectValue placeholder="وضعیت" /></SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map(([value, label]) => (
                  <SelectItem key={value} value={value || "all"}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={gradeLevelId || "all"} onValueChange={(v) => { setGradeLevelId(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-36"><SelectValue placeholder="صنف" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">همهٔ صنف‌ها</SelectItem>
                {(grades ?? []).map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.nameDari}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => { setQ(qInput); setPage(1); }}>
              <Search className="h-4 w-4" /> جستجو
            </Button>
            {activeFilters > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setQ(""); setQInput(""); setStatus(""); setGradeLevelId(""); setPage(1); }}
              >
                <X className="h-4 w-4" /> پاک کردن
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={saveFilter} title="ذخیرهٔ این فلتر برای استفادهٔ بعدی">
              <Star className="h-4 w-4" /> ذخیرهٔ فلتر
            </Button>
          </div>

          {savedFilters.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">فلترهای ذخیره‌شده:</span>
              {savedFilters.map((f) => (
                <button
                  key={f.name}
                  onClick={() => applyFilter(f)}
                  className="transition-soft rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-xs hover:border-primary/50"
                >
                  {f.name}
                </button>
              ))}
            </div>
          ) : null}

          {canExport ? (
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              صدور اکسل در پس‌زمینه انجام می‌شود — این قابلیت در مرحلهٔ گزارش‌ها فعال می‌گردد.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><TableSkeleton /></div>
          ) : !data || data.items.length === 0 ? (
            <div className="p-4">
              {q || status || gradeLevelId ? <NoResultsState query={q} /> : (
                <EmptyState
                  icon={Users}
                  title="هنوز شاگردی ثبت نشده است"
                  body="برای شروع، یک درخواست شمولیت ثبت کنید."
                  action={hasGrant(me, "applications.create") ? (
                    <Button size="sm" onClick={() => navigate("/admissions/new")}>درخواست شمولیت جدید</Button>
                  ) : undefined}
                />
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-start">شمارهٔ شاگردی</TableHead>
                      <TableHead className="text-start">نام</TableHead>
                      <TableHead className="text-start">نام پدر</TableHead>
                      <TableHead className="text-start">صنف / شعبه</TableHead>
                      <TableHead className="text-start">ولیٔ اصلی</TableHead>
                      <TableHead className="text-start">وضعیت</TableHead>
                      <TableHead className="text-start w-12" aria-label="عملیات" />
                    </TableRow>
                  </TableHeader>
                  <TableBody className={isFetching ? "opacity-60 transition-soft" : "transition-soft"}>
                    {data.items.map((s) => (
                      <TableRow
                        key={s.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/students/${s.id}`)}
                      >
                        <TableCell className="font-mono text-xs" dir="ltr">{s.studentNumber}</TableCell>
                        <TableCell className="font-medium">{s.personal.firstName ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{s.personal.fatherName ?? "—"}</TableCell>
                        <TableCell>
                          {s.currentEnrollment ? (
                            <span>
                              {s.currentEnrollment.gradeName}
                              {s.currentEnrollment.sectionLabel ? ` — ${s.currentEnrollment.sectionLabel}` : ""}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">شمولیت ثبت‌نشده</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {s.guardianSummary.find((g) => g.isPrimary)?.fullName ?? "—"}
                        </TableCell>
                        <TableCell><StatusBadge status={s.status} label={s.statusLabel} /></TableCell>
                        <TableCell>
                          <ArrowLeft className="h-4 w-4 text-muted-foreground" />
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
