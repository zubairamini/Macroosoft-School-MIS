// Analytics & at-risk oversight — Phase 8 (تحلیل‌ها).
// KPI cards, six-month Solar Hijri trends (recharts via the shadcn chart
// wrapper) and the at-risk student table. Branch isolation is server-side.

"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Users, ClipboardCheck, ShieldAlert, Award, Wallet, TrendingUp } from "lucide-react";
import { useAnalyticsOverview, apiErrorMessage } from "@/lib/api/hooks";
import { EmptyState, TableSkeleton, KpiCard, Ltr } from "@/components/shared";
import { faNum, faPercent, faMoneyNum } from "@/lib/format";
import { hasGrant } from "@/app-shell/shell";
import { navigate } from "@/app-shell/router";
import { useMe } from "@/lib/api/hooks";

const RISK_FLAG_LABELS: Record<string, string> = {
  attendance: "حاضری کم",
  academics: "نتیجهٔ ضعیف",
  finance: "بدهی معوق",
};
const RISK_FLAG_BADGE: Record<string, string> = {
  attendance: "border-sky-200 bg-sky-50 text-sky-700",
  academics: "border-amber-200 bg-amber-50 text-amber-700",
  finance: "border-red-200 bg-red-50 text-red-700",
};

const attendanceChartConfig = {
  absentRatePct: { label: "نرخ غیرحاضری (٪)", color: "var(--chart-1)" },
} satisfies ChartConfig;

const disciplineChartConfig = {
  incidents: { label: "وقایع انضباطی", color: "var(--chart-1)" },
  merits: { label: "اقدامات مثبت", color: "var(--chart-2)" },
} satisfies ChartConfig;

const financeChartConfig = {
  billed: { label: "فاکتور‌شده (افغانی)", color: "var(--chart-1)" },
  collected: { label: "وصول‌شده (افغانی)", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function AnalyticsView() {
  const { data: me } = useMe();
  const canStudents = hasGrant(me, "students.view");
  const { data, isLoading, error } = useAnalyticsOverview();

  // diram → afghanis for the finance chart (100 diram = 1 AFN).
  const financeTrend = useMemo(
    () =>
      (data?.trends ?? []).map((t) => ({
        ...t,
        billed: t.billedDiram / 100,
        collected: t.collectedDiram / 100,
      })),
    [data],
  );

  if (error) {
    return (
      <EmptyState
        title="تحلیل‌ها بارگذاری نشد"
        body={apiErrorMessage(error)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">تحلیل‌ها و شاگردان در معرض خطر</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          نمای کلی سال تعلیمی جاری{data?.yearName ? ` (${data.yearName})` : ""} — محدود به شعبهٔ فعال شما.
        </p>
      </header>

      {isLoading || !data ? (
        <div className="grid gap-4 md:grid-cols-3"><TableSkeleton rows={2} cols={1} /></div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard label="شاگردان فعال" value={faNum(data.kpis.activeStudents)} icon={Users} tone="primary" />
            <KpiCard
              label="ثبت‌های حاضری (قطعی‌شده)"
              value={faNum(data.kpis.submittedSessionRecords)}
              icon={ClipboardCheck}
            />
            <KpiCard
              label="نرخ وصول فیس"
              value={data.kpis.collectionRatePct !== null ? faPercent(data.kpis.collectionRatePct) : "—"}
              hint={`وصول: ${faMoneyNum(data.kpis.collectedDiram)} از ${faMoneyNum(data.kpis.billedDiram)}`}
              icon={Wallet}
              tone={data.kpis.collectionRatePct !== null && data.kpis.collectionRatePct < 60 ? "amber" : "default"}
            />
            <KpiCard label="وقایع حل‌نشده" value={faNum(data.kpis.openIncidents)} icon={ShieldAlert} tone={data.kpis.openIncidents > 0 ? "amber" : "default"} />
            <KpiCard label="اقدامات مثبت" value={faNum(data.kpis.meritIncidents)} icon={Award} tone="primary" />
            <KpiCard
              label="شاگردان در معرض خطر"
              value={faNum(data.atRisk.length)}
              icon={TrendingUp}
              tone={data.atRisk.length > 0 ? "amber" : "default"}
            />
          </div>

          {/* Trends */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">نرخ غیرحاضری (۶ ماه اخیر)</CardTitle>
                <CardDescription>فقط از حاضری‌های قطعی‌شده محاسبه می‌شود.</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={attendanceChartConfig} className="h-56 w-full">
                  <LineChart data={data.trends} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={44} reversed />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={32} domain={[0, 100]} />
                    <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                    <Line
                      dataKey="absentRatePct"
                      type="monotone"
                      stroke="var(--color-absentRatePct)"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">انضباط — وقایع در برابر اقدامات مثبت</CardTitle>
                <CardDescription>شمول ریکاردهای ماه‌های شش‌گانهٔ اخیر.</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={disciplineChartConfig} className="h-56 w-full">
                  <BarChart data={data.trends} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={44} reversed />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={32} allowDecimals={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="incidents" fill="var(--color-incidents)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="merits" fill="var(--color-merits)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">مالی — فاکتور در برابر وصول</CardTitle>
                <CardDescription>ارقام به افغانی؛ ماه‌های شمسی.</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={financeChartConfig} className="h-56 w-full">
                  <BarChart data={financeTrend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={44} reversed />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={48} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="billed" fill="var(--color-billed)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="collected" fill="var(--color-collected)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          {/* At-risk students */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">شاگردان در معرض خطر</CardTitle>
              <CardDescription>
                سه نشانِ مستقل: حاضری کمتر از ۸۰٪ (با حداقل ۵ روز ثبت‌شده)، میانگین نمرات منتشرشده
                کمتر از ۴۰٪، و بدهی معوق فیس. ترتیب بر اساس تعداد نشان‌ها.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.atRisk.length === 0 ? (
                <EmptyState
                  icon={TrendingUp}
                  title="شاگرد در معرض خطر شناسایی نشد"
                  body="با ثبت حاضری، نمرات و فیس‌ها، این فهرست به‌صورت خودکار به‌روزرسانی می‌شود."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>شاگرد</TableHead>
                        <TableHead>صنف / شعبه</TableHead>
                        <TableHead>نشان‌های خطر</TableHead>
                        <TableHead>نرخ حاضری</TableHead>
                        <TableHead>میانگین نمرات</TableHead>
                        <TableHead>بدهی معوق</TableHead>
                        {canStudents ? <TableHead className="w-24">عملیات</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.atRisk.map((s) => (
                        <TableRow key={s.studentId}>
                          <TableCell>
                            <p className="font-medium">{s.firstName}</p>
                            <p className="text-xs text-muted-foreground">
                              ولد: {s.fatherName} · <Ltr className="text-xs">{s.studentNumber}</Ltr>
                            </p>
                          </TableCell>
                          <TableCell className="text-sm">
                            {s.gradeName} «{s.sectionLabel}»
                            <p className="text-xs text-muted-foreground">{s.branchName}</p>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {s.flags.map((f) => (
                                <Badge key={f} variant="outline" className={RISK_FLAG_BADGE[f]}>
                                  {RISK_FLAG_LABELS[f] ?? f}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="tabular-nums text-sm">
                            {s.attendanceRate !== null ? faPercent(Math.round(s.attendanceRate * 1000) / 10) : "—"}
                          </TableCell>
                          <TableCell className="tabular-nums text-sm">
                            {s.averagePct !== null ? faPercent(s.averagePct) : "—"}
                          </TableCell>
                          <TableCell className="tabular-nums text-sm">
                            {s.overdueBalanceDiram > 0 ? faMoneyNum(s.overdueBalanceDiram) : "—"}
                          </TableCell>
                          {canStudents ? (
                            <TableCell>
                              <Button size="sm" variant="ghost" onClick={() => navigate(`/students/${s.studentId}`)}>
                                پروفایل
                              </Button>
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
        </>
      )}
    </div>
  );
}
