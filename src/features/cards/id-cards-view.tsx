// ID cards view — Phase 4 «اسناد چاپی»: printable student identification
// cards per class section. Data comes from the already-scoped /students API
// (students.export gate) — no new data path, only a print presentation.
// Print via the browser print dialog with dedicated @media print styles.

"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Printer, IdCard, Loader2 } from "lucide-react";
import { useMe, useOrgContext, useSections, useStudents } from "@/lib/api/hooks";
import { EmptyState, TableSkeleton } from "@/components/shared";
import { faNum, genderLabel } from "@/lib/format";
import { hasGrant } from "@/app-shell/shell";
import { FinHeader } from "@/features/finance/shared";

export function IdCardsView() {
  const { data: me } = useMe();
  const { data: orgCtx } = useOrgContext();
  const { data: sections } = useSections();
  const [sectionId, setSectionId] = useState("");
  const [printMode, setPrintMode] = useState(false);

  const { data: students, isLoading } = useStudents({
    classSectionId: sectionId || undefined,
    pageSize: 100,
  });
  const section = (sections ?? []).find((s) => s.id === sectionId);
  const org = orgCtx?.org;
  const items = (students?.items ?? []).filter((s) => s.status === "active");

  // ── Print sheet: A4 grid of cards ────────────────────────────────────────
  if (printMode && section) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between no-print">
          <h1 className="text-lg font-bold">چاپ کارت‌های شناسایی — {section.label}</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setPrintMode(false)}>بازگشت</Button>
            <Button onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> چاپ
            </Button>
          </div>
        </div>
        <div
          id="cards-print-area"
          className="grid grid-cols-2 gap-4 bg-white p-4 text-black lg:grid-cols-2 print:block"
        >
          {items.map((s) => (
            <div
              key={s.id}
              className="print-card break-inside-avoid rounded-xl border-2 border-slate-400 p-4"
              dir="rtl"
            >
              <div className="flex items-center justify-between border-b border-dashed border-slate-300 pb-2">
                <div className="text-sm font-bold">{org?.name ?? "مکتب"}</div>
                <div className="text-xs text-slate-600">کارت شناسایی شاگرد</div>
              </div>
              <div className="mt-3 flex gap-3">
                {/* photo placeholder — replaced by the school's photo asset */}
                <div className="flex h-20 w-16 shrink-0 items-center justify-center rounded border border-dashed border-slate-400 bg-slate-50 text-[10px] text-slate-400">
                  عکس
                </div>
                <div className="grid flex-1 grid-cols-1 gap-1 text-xs">
                  <div><span className="text-slate-500">نام:</span> <span className="font-semibold">{s.personal.firstName ?? "—"}</span></div>
                  <div><span className="text-slate-500">ولد:</span> <span className="font-semibold">{s.personal.fatherName ?? "—"}</span></div>
                  <div><span className="text-slate-500">شماره:</span> <span dir="ltr" className="font-semibold">{s.studentNumber}</span></div>
                  <div><span className="text-slate-500">صنف:</span> <span className="font-semibold">{s.currentEnrollment?.gradeName ?? "—"}</span></div>
                  <div><span className="text-slate-500">جنس:</span> <span className="font-semibold">{genderLabel(s.personal.gender)}</span></div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-dashed border-slate-300 pt-2 text-[10px] text-slate-500">
                <span>سال تعلیمی: {orgCtx?.currentYear?.name ?? "—"}</span>
                <span>{org?.province ?? ""} {org?.district ? `— ${org.district}` : ""}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FinHeader
        title="کارت‌های شناسایی شاگردان"
        subtitle="انتخاب شعبهٔ صنفی و چاپ کارت‌های شناسایی در قطع A۴ — داده‌ها از همان مجوز «صدور شاگردان» می‌آیند."
        action={hasGrant(me, "students.export") && sectionId ? (
          <Button onClick={() => setPrintMode(true)}>
            <Printer className="h-4 w-4" /> پیش‌نمایش چاپ
          </Button>
        ) : null}
      />

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
            <div className="w-72 space-y-1">
              <Label>شعبهٔ صنفی</Label>
              <Select value={sectionId || "none"} onValueChange={(v) => setSectionId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="یک شعبهٔ صنفی انتخاب کنید" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— انتخاب شعبهٔ صنفی —</SelectItem>
                  {(sections ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {sectionId ? (
              <div className="ms-auto text-sm text-muted-foreground">
                {faNum(items.length)} شاگرد فعال
              </div>
            ) : null}
          </div>

          {!sectionId ? (
            <div className="p-6">
              <EmptyState
                icon={IdCard}
                title="شعبهٔ صنفی را انتخاب کنید"
                body="برای چاپ کارت‌های شناسایی، ابتدا یک شعبهٔ صنفی سال جاری را انتخاب کنید."
              />
            </div>
          ) : isLoading ? (
            <div className="p-4"><TableSkeleton rows={6} cols={5} /></div>
          ) : items.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={IdCard} title="شاگردی در این شعبهٔ صنفی فعال نیست" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>شمارهٔ شاگرد</TableHead>
                    <TableHead>نام</TableHead>
                    <TableHead>ولد</TableHead>
                    <TableHead>صنف</TableHead>
                    <TableHead>جنس</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell dir="ltr" className="font-mono text-xs font-semibold">{s.studentNumber}</TableCell>
                      <TableCell className="font-medium">{s.personal.firstName ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{s.personal.fatherName ?? "—"}</TableCell>
                      <TableCell>{s.currentEnrollment?.gradeName ?? "—"}</TableCell>
                      <TableCell>{genderLabel(s.personal.gender)}</TableCell>
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
