// Finance reports view — monthly KPIs, a six-month income vs expense series,
// and the top debtors list. Figures follow the viewer's branch scope.

"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Banknote, BarChart3, Coins, Landmark, ReceiptText, TrendingDown, TrendingUp } from "lucide-react";
import { useFinanceReports } from "@/lib/api/hooks";
import { TableSkeleton, Ltr, KpiCard } from "@/components/shared";
import { faMoney, faMoneyNum, faNum } from "@/lib/format";
import { FinHeader, recentMonthOptions } from "./shared";
import { navigate } from "@/app-shell/router";

export function FinanceReportsView() {
  const months = recentMonthOptions(12);
  const [month, setMonth] = useState(months[months.length - 1]?.key ?? "");
  const { data, isLoading, isError, error } = useFinanceReports(month || undefined);

  if (isError) {
    return (
      <div className="space-y-4">
        <FinHeader title="گزارش مالی" subtitle="خلاصهٔ ماهانهٔ وصولی، فاکتور، مصارف و معاشات." />
        <Card><CardContent className="p-6 text-sm text-destructive">{(error as Error).message}</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FinHeader
        title="گزارش مالی"
        subtitle={`خلاصهٔ ماهانه — دورهٔ ${data?.month.label ?? "…"}. ارقام بر اساس شعبهٔ فعال شما.`}
        action={
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {isLoading || !data ? (
        <div className="p-4"><TableSkeleton rows={6} cols={5} /></div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard label={`وصولی ${data.month.label}`} value={faMoneyNum(data.collection.totalDiram)} hint={`${faNum(data.collection.count)} رسید`} tone="primary" icon={Coins} />
            <KpiCard label="فاکتورهای این دوره" value={faMoneyNum(data.invoiced.totalNetDiram)} hint={`${faNum(data.invoiced.count)} فاکتور`} icon={ReceiptText} />
            <KpiCard label="بدهی باقی‌مانده" value={faMoneyNum(data.outstanding.totalDiram)} hint={`${faNum(data.outstanding.count)} فاکتور باز`} tone="amber" icon={Banknote} />
            <KpiCard label="مصارف ماه" value={faMoneyNum(data.expenses.totalDiram)} hint={`${faNum(data.expenses.count)} قلم`} tone="amber" icon={Landmark} />
            <KpiCard label="معاشات پرداخت‌شده" value={faMoneyNum(data.payroll.totalDiram)} hint={`${faNum(data.payroll.runsCount)} سیشن`} icon={BarChart3} />
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-base font-bold">درآمد در مقابل مصرف — ۶ ماه اخیر</h2>
                <p className="text-xs text-muted-foreground">درآمد = وصولی نقدی؛ مصرف = مصارف ثبت‌شده (شامل معاشات).</p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ماه</TableHead>
                    <TableHead>درآمد</TableHead>
                    <TableHead>مصرف</TableHead>
                    <TableHead>تفاضل</TableHead>
                    <TableHead>روند</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.series.map((s) => {
                    const diff = s.incomeDiram - s.expenseDiram;
                    return (
                      <TableRow key={s.key}>
                        <TableCell className="font-medium">{s.label}</TableCell>
                        <TableCell className="tabular-nums text-emerald-700">{faMoneyNum(s.incomeDiram)}</TableCell>
                        <TableCell className="tabular-nums text-amber-700">{faMoneyNum(s.expenseDiram)}</TableCell>
                        <TableCell className={`tabular-nums font-semibold ${diff >= 0 ? "text-emerald-700" : "text-destructive"}`}>
                          {diff >= 0 ? "+" : "−"}{faMoneyNum(Math.abs(diff))}
                        </TableCell>
                        <TableCell>
                          {diff >= 0 ? (
                            <TrendingUp className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-destructive" />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-base font-bold">بدهکاران عمده</h2>
                <p className="text-xs text-muted-foreground">شاگردان با بیشترین بقیهٔ فاکتور در حوزهٔ دید شما.</p>
              </div>
              {data.topDebtors.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  بدهی باقی‌مانده‌ای موجود نیست — وصولی کامل است. ✅
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>شاگرد</TableHead>
                      <TableHead>شمارهٔ شاگردی</TableHead>
                      <TableHead>شعبه</TableHead>
                      <TableHead>بدهی</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topDebtors.map((d, i) => (
                      <TableRow key={d.studentId}>
                        <TableCell className="tabular-nums text-muted-foreground">{faNum(i + 1)}</TableCell>
                        <TableCell className="font-medium">{d.name || "—"}</TableCell>
                        <TableCell><Ltr className="text-xs">{d.studentNumber}</Ltr></TableCell>
                        <TableCell className="text-muted-foreground">{d.branchName || "—"}</TableCell>
                        <TableCell className="tabular-nums font-semibold text-amber-700">{faMoney(d.balance)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/finance/invoices?outstanding=1`)}
                          >
                            مشاهدهٔ فاکتورها
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
