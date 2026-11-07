// Roadmap placeholder view for modules scheduled in later phases.
// Every such module states exactly what remains — no fake functionality.

"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarClock, ArrowLeft, Layers } from "lucide-react";
import { ROADMAP_INFO } from "@/app-shell/nav-config";
import { navigate } from "@/app-shell/router";

const PHASE_TITLES: Record<number, string> = {
  2: "مرحلهٔ دوم — امور تعلیمی",
  3: "مرحلهٔ سوم — امور مالی",
  4: "مرحلهٔ چهارم — کتابخانه و ارتباطات",
  5: "مرحلهٔ پنجم — خدمات و تکمیل",
};

const STATUS_LINES: Array<{ label: string; done: boolean }> = [
  { label: "امنیت ورود، اجازه‌ها و حیطه‌بندی شعبه‌ای دسترسی", done: true },
  { label: "تنظیمات مکتب، سال تعلیمی، صنف‌ها و شعبه‌ها", done: true },
  { label: "شمولیت شاگردان و پروفایل شاگرد", done: true },
  { label: "حاضری، امتحانات، نتایج و برنامهٔ صنفی", done: true },
  { label: "فیس، حسابداری، رسیدها و معاشات", done: true },
  { label: "کتابخانه، اعلانات، کارت‌ها و پورتال‌ها", done: true },
  { label: "خدمات (ترانسپورت/انبار/مهمان‌ها)، گزارش‌ها و سال‌گذرانی", done: true },
];

export function RoadmapView({ moduleKey }: { moduleKey: string }) {
  const info = ROADMAP_INFO[moduleKey] ?? {
    title: "بخش در دست ساخت",
    module: "این بخش",
    detail: "طبق نقشهٔ راه توسعه، در مراحل بعدی ساخته می‌شود.",
  };
  const phase = moduleKey === "fees" ? 3
    : moduleKey === "library" || moduleKey === "announcements" ? 4
      : moduleKey === "services" ? 5
        : moduleKey === "reports" ? 5
          : 2;

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <CalendarClock className="h-7 w-7 text-muted-foreground" />
          </div>
          <CardTitle className="text-xl">{info.title}</CardTitle>
          <CardDescription>{info.module}</CardDescription>
          <div className="mt-2 flex justify-center">
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
              {PHASE_TITLES[phase]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-center text-sm leading-7 text-muted-foreground">{info.detail}</p>
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <Layers className="h-4 w-4 text-primary" /> وضعیت فعلی سیستم
            </p>
            <ul className="space-y-1.5 text-xs leading-6 text-muted-foreground">
              {STATUS_LINES.map((s) => (
                <li key={s.label} className={s.done ? "" : ""}>
                  {s.done ? "✅" : "🔜"} {s.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-4 w-4" /> بازگشت به صفحهٔ اصلی
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
