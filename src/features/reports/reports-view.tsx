// Reports view — Phase 5 «گزارش‌ها»: registries with screen preview, print
// and CSV export. The server returns a generic table contract
// { columns, rows } already formatted in Dari (Jalali dates, Persian digits).

"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Printer, FileSpreadsheet, Loader2, FileDown } from "lucide-react";
import { useMe, useGrades, useSections, useSubjects, useReport } from "@/lib/api/hooks";
import { EmptyState, TableSkeleton, JalaliDateInput } from "@/components/shared";
import { faNum } from "@/lib/format";
import { hasGrant } from "@/app-shell/shell";
import { apiErrorMessage } from "@/lib/api/hooks";
import { api } from "@/lib/api/client";
import { toast } from "sonner";
import { FinHeader } from "@/features/finance/shared";

const KINDS = [
  { value: "students", label: "ثبت‌نامهٔ شاگردان" },
  { value: "attendance", label: "گزارش حاضری" },
  { value: "results", label: "گزارش نتایج" },
];

export function ReportsView() {
  const { data: me } = useMe();
  const { data: grades } = useGrades();
  const { data: sections } = useSections();
  const { data: subjects } = useSubjects();
  const canExport = hasGrant(me, "students.export");

  const [kind, setKind] = useState<string>("students");
  const [gradeLevelId, setGradeLevelId] = useState("");
  const [classSectionId, setClassSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [printMode, setPrintMode] = useState(false);

  const filters = {
    gradeLevelId: gradeLevelId || undefined,
    classSectionId: classSectionId || undefined,
    subjectId: subjectId || undefined,
    from: from || undefined,
    to: to || undefined,
  };
  const { data: report, isLoading } = useReport(kind || null, filters);

  // ── Print sheet ─────────────────────────────────────────────────────────
  if (printMode && report) {
    return (
      <div className="space-y-4">
        <div className="no-print flex items-center justify-between">
          <h1 className="text-lg font-bold">{report.title}</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setPrintMode(false)}>بازگشت</Button>
            <Button onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> چاپ
            </Button>
          </div>
        </div>
        <div id="report-print-area" className="bg-white p-6 text-black" dir="rtl">
          <div className="mb-4 border-b-2 border-black pb-3 text-center">
            <div className="text-xl font-bold">{report.title}</div>
            <div className="mt-1 text-sm text-slate-600">
              {Object.entries(report.meta).map(([k, v]) => `${k}: ${v}`).join(" · ")}
            </div>
          </div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {report.columns.map((c) => (
                  <th key={c.key} className="border border-slate-400 bg-slate-100 p-1.5 text-right font-semibold">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className="border border-slate-400 p-1.5">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {report.rows.length === 0 ? (
            <p className="mt-4 text-center text-sm text-slate-500">داده‌ای برای نمایش وجود ندارد.</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FinHeader
        title="گزارش‌های مکتب"
        subtitle="ثبت‌نامه‌ها، حاضری و نتایج — با پیش‌نمایش، چاپ و صدور CSV. گزارش مالی جداگانه در بخش امور مالی موجود است."
      />

      <Card>
        <CardContent className="p-0">
          {/* Filter bar */}
          <div className="flex flex-wrap items-end gap-3 border-b border-border px-4 py-3">
            <div className="w-52 space-y-1">
              <Label>نوع گزارش</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {kind === "students" ? (
              <div className="w-40 space-y-1">
                <Label>صنف</Label>
                <Select value={gradeLevelId || "all"} onValueChange={(v) => setGradeLevelId(v === "all" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه صنوف</SelectItem>
                    {(grades ?? []).map((g) => (
                      <SelectItem key={g.id} value={g.id}>{g.nameDari}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {kind !== "students" ? (
              <div className="w-44 space-y-1">
                <Label>شعبهٔ صنفی</Label>
                <Select value={classSectionId || "all"} onValueChange={(v) => setClassSectionId(v === "all" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه شعبه‌های دیدنی</SelectItem>
                    {(sections ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="w-44 space-y-1">
                <Label>شعبهٔ صنفی (اختیاری)</Label>
                <Select value={classSectionId || "all"} onValueChange={(v) => setClassSectionId(v === "all" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه</SelectItem>
                    {(sections ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {kind === "results" ? (
              <div className="w-40 space-y-1">
                <Label>مضمون</Label>
                <Select value={subjectId || "all"} onValueChange={(v) => setSubjectId(v === "all" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه مضامین</SelectItem>
                    {(subjects ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.nameDari}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {kind === "attendance" ? (
              <div className="flex items-end gap-2">
                <div className="w-36 space-y-1">
                  <Label>از تاریخ</Label>
                  <JalaliDateInput value={from} onChange={setFrom} placeholder="۱۴۰۵/۰۸/۰۱" />
                </div>
                <div className="w-36 space-y-1">
                  <Label>تا تاریخ</Label>
                  <JalaliDateInput value={to} onChange={setTo} placeholder="۱۴۰۵/۰۸/۳۰" />
                </div>
              </div>
            ) : null}

            <div className="ms-auto flex gap-2">
              {report ? (
                <Button variant="outline" onClick={() => setPrintMode(true)}>
                  <Printer className="h-4 w-4" /> پیش‌نمایش چاپ
                </Button>
              ) : null}
              {canExport && report && report.rows.length > 0 ? (
                <Button
                  variant="outline"
                  onClick={async () => {
                    // CSV download through the authenticated client (cookie).
                    try {
                      const params = new URLSearchParams();
                      if (gradeLevelId) params.set("gradeLevelId", gradeLevelId);
                      if (classSectionId) params.set("classSectionId", classSectionId);
                      if (subjectId) params.set("subjectId", subjectId);
                      if (from) params.set("from", from);
                      if (to) params.set("to", to);
                      params.set("format", "csv");
                      const csv = await api.getRaw(`/reports/${kind}?${params.toString()}`);
                      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `maktabyar-${kind}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch (err) {
                      toast.error(apiErrorMessage(err));
                    }
                  }}
                >
                  <FileDown className="h-4 w-4" /> صدور CSV
                </Button>
              ) : null}
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="p-4"><TableSkeleton rows={8} cols={6} /></div>
          ) : !report || report.rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={FileSpreadsheet}
                title="داده‌ای برای این گزارش یافت نشد"
                body="فیلترها را تغییر دهید — گزارش‌ها فقط داده‌های مجاز شما (شعبه/شعبه‌های صنفی) را نشان می‌دهند."
              />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 border-b border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                {Object.entries(report.meta).map(([k, v]) => (
                  <span key={k} className="rounded bg-background px-2 py-0.5">{k}: {v}</span>
                ))}
                <span className="ms-auto">{faNum(report.rows.length)} سطر</span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {report.columns.map((c) => (
                        <TableHead key={c.key}>{c.label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.rows.map((row, i) => (
                      <TableRow key={i}>
                        {row.map((cell, j) => (
                          <TableCell key={j} className={j === 0 ? "font-mono text-xs" : ""}>{cell}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
