// Role-aware dashboard: KPIs with defined calculations, quick actions,
// admissions funnel, sections by grade, teacher/parent views.

"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, GraduationCap, School, TrendingUp, ClipboardList, UserCheck,
  Users2, ArrowLeft, AlertCircle, History, ClipboardCheck, CalendarClock, Award,
} from "lucide-react";
import { useDashboard, useMe } from "@/lib/api/hooks";
import { KpiCard, EmptyState, StatusBadge, Ltr } from "@/components/shared";
import { faNum, formatInstantJalaliDateTime } from "@/lib/format";
import { navigate } from "@/app-shell/router";
import { hasGrant } from "@/app-shell/shell";

const FUNNEL_ORDER = ["draft", "submitted", "under_review", "approved", "enrolled", "rejected", "cancelled"];
const FUNNEL_LABELS: Record<string, string> = {
  draft: "پیش‌نویس", submitted: "ارائه‌شده", under_review: "در بررسی",
  approved: "تاییدشده", enrolled: "شمول‌شده", rejected: "ردشده", cancelled: "لغو‌شده",
};

const AUDIT_LABELS: Record<string, string> = {
  "auth.login": "ورود به سیستم",
  "application.create": "ایجاد درخواست شمولیت",
  "application.submit": "ارائهٔ درخواست",
  "application.start": "شروع بررسی",
  "application.approve": "تایید درخواست",
  "application.reject": "رد درخواست",
  "application.enroll": "شمول شاگرد",
  "application.update": "ویرایش درخواست",
  "student.update": "ویرایش شاگرد",
  "student.status-change": "تغییر وضعیت شاگرد",
  "student.link-guardian": "پیوند ولی",
  "org.update": "به‌روزرسانی مکتب",
  "org.setup": "تنظیم اولیهٔ مکتب",
  "settings.update": "تغییر تنظیمات",
  "user.create": "ایجاد کاربر",
  "user.reset-password": "بازنشانی رمز",
  "user.assign-role": "تخصیص نقش",
  "user.deactivate": "غیرفعال‌سازی کاربر",
  "user.activate": "فعال‌سازی کاربر",
  "guardian.create": "ایجاد ولی",
  "branch.create": "ایجاد شعبهٔ مکتب",
  "academic-year.create": "ایجاد سال تعلیمی",
  "academic-year.set-current": "تغییر سال جاری",
  "section.create": "ایجاد شعبهٔ صنف",
  "subject.create": "ایجاد مضمون",
  "system.seed": "داده‌های نمایشی",
};

export function DashboardView() {
  const { data: me } = useMe();
  const { data: d, isLoading, isError } = useDashboard();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }
  if (isError || !d) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="داشبورد بارگذاری نشد"
        body="در بارگذاری معلومات داشبورد مشکلی پیش آمد. دوباره تلاش کنید."
        action={<Button variant="outline" onClick={() => window.location.reload()}>تلاش دوباره</Button>}
      />
    );
  }

  const firstName = me?.user.fullName.split(/\s+/)[0] ?? "";
  const canAdmissions = hasGrant(me, "applications.view");
  const canStudents = hasGrant(me, "students.view");
  const canAudit = hasGrant(me, "audit.view");
  const canCreateApp = hasGrant(me, "applications.create");

  // Parent view: children cards.
  if (d.children && d.children.length >= 0 && (me?.roles ?? []).includes("parent")) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold">{firstName} عزیز، خوش آمدید</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {d.weekday}، {d.todayJalali} · سال تعلیمی {d.academicYearName ?? "—"}
          </p>
        </header>
        <section>
          <h2 className="mb-3 text-base font-semibold">فرزندان من</h2>
          {d.children.length === 0 ? (
            <EmptyState icon={Users} title="هنوز شاگردی با حساب شما پیوند نشده است" body="با دفتر مکتب تماس بگیرید تا حساب شما به فرزندانتان پیوند شود." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {d.children.map((c) => (
                <Card key={c.studentId} className="transition-soft cursor-pointer hover:border-primary/50 hover:shadow-sm" onClick={() => navigate(`/students/${c.studentId}`)}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-semibold">{c.firstName}</p>
                      <p className="text-sm text-muted-foreground">
                        <Ltr className="text-xs">{c.studentNumber}</Ltr>
                        {c.gradeName ? ` · ${c.gradeName}` : ""}
                        {c.sectionLabel ? ` — شعبهٔ ${c.sectionLabel}` : ""}
                      </p>
                    </div>
                    <StatusBadge status={c.status} label={c.status === "active" ? "فعال" : c.status} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
        <p className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs leading-6 text-amber-800">
          پورتال ولی: نمرات و حاضری فقط پس از انتشار رسمی نمایش داده می‌شود.
          معلومات سایر شاگردان هرگز در دسترس نیست.
        </p>

        {d.recentGrades && d.recentGrades.length > 0 ? (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
              <Award className="h-4 w-4 text-primary" /> نتایج منتشرشدهٔ اخیر
            </h2>
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {d.recentGrades.map((g, i) => (
                    <li
                      key={`${g.studentId}-${i}`}
                      className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 transition-soft hover:bg-primary/5"
                      onClick={() => navigate(`/students/${g.studentId}`)}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{g.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {g.firstName} · {g.subjectName}
                        </p>
                      </div>
                      <span className="shrink-0 tabular-nums text-sm font-bold">
                        {g.isAbsent ? (
                          <span className="text-red-700">غیرحاضر در امتحان</span>
                        ) : g.score !== null ? (
                          <>
                            {faNum(g.score)} <span className="text-xs font-normal text-muted-foreground">از {faNum(g.maxScore)}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">نا-ثبت</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{firstName} عزیز، خوش آمدید</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {d.weekday}، {d.todayJalali} · سال تعلیمی {d.academicYearName ?? "—"}
          </p>
        </div>
        {canCreateApp ? (
          <Button onClick={() => navigate("/admissions/new")}>
            <GraduationCap className="h-4 w-4" /> درخواست شمولیت جدید
          </Button>
        ) : canStudents ? (
          <Button variant="outline" onClick={() => navigate("/students")}>
            <Users className="h-4 w-4" /> دیدن شاگردان
          </Button>
        ) : null}
      </header>

      {/* KPI row */}
      {d.students ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard label="شاگردان کل" value={faNum(d.students.total)} icon={Users} tone="primary" />
          <KpiCard label="شاگردان فعال" value={faNum(d.students.active)} icon={UserCheck} />
          <KpiCard label="مل" value={faNum(d.students.male)} icon={Users2} />
          <KpiCard label="زن" value={faNum(d.students.female)} icon={Users} tone="amber" />
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-800">
          حساب شما اجازهٔ دیدن آمار شاگردان را ندارد.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Admissions funnel */}
        {canAdmissions && d.applications ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">مراحل شمولیت — سال جاری</CardTitle>
              <CardDescription>تعداد درخواست‌ها در هر مرحله از فرایند شمولیت</CardDescription>
            </CardHeader>
            <CardContent>
              {d.applications.length === 0 ? (
                <EmptyState icon={GraduationCap} title="درخواستی موجود نیست" body="اولین درخواست شمولیت را ثبت کنید." action={canCreateApp ? <Button size="sm" onClick={() => navigate("/admissions/new")}>درخواست جدید</Button> : undefined} />
              ) : (
                <ul className="space-y-2.5">
                  {FUNNEL_ORDER.filter((s) => d.applications!.some((a) => a.status === s)).map((s) => {
                    const count = d.applications!.find((a) => a.status === s)?.count ?? 0;
                    const max = Math.max(...d.applications!.map((a) => a.count), 1);
                    return (
                      <li key={s} className="flex items-center gap-3">
                        <span className="w-24 shrink-0 text-sm text-muted-foreground">{FUNNEL_LABELS[s]}</span>
                        <Progress value={(count / max) * 100} className="h-2.5 flex-1" aria-label={`${FUNNEL_LABELS[s]}: ${count}`} />
                        <span className="w-8 text-end text-sm font-bold tabular-nums">{faNum(count)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/admissions")}>
                رفتن به شمولیت‌ها <ArrowLeft className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {/* Sections / capacity */}
        {d.sections ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">شعبه‌های صنف</CardTitle>
              <CardDescription>
                {faNum(d.sections.count)} شعبه · {faNum(d.sections.totalEnrolled)} از {faNum(d.sections.totalCapacity)} ظرفیت
              </CardDescription>
            </CardHeader>
            <CardContent className="max-h-72 overflow-y-auto scroll-area-thin">
              <ul className="space-y-2">
                {d.sections.byGrade.slice(0, 12).map((g, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-muted-foreground">
                      {g.gradeName} — {g.label}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      <span className="font-semibold">{faNum(g.enrolled)}</span>
                      <span className="text-muted-foreground"> / {faNum(g.capacity)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {/* Teacher's sections + today's schedule (Phase 2) */}
        {d.assignedSections && d.assignedSections.length > 0 ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">شعبه‌های صنف من (استاد)</CardTitle>
              <CardDescription>شعبه‌هایی که به شما تخصیص داده شده است</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {d.assignedSections.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="font-semibold">{s.gradeName}</p>
                      <p className="text-sm text-muted-foreground">شعبهٔ {s.label}</p>
                    </div>
                    <Badge variant="secondary" className="tabular-nums">{faNum(s.students)} شاگرد</Badge>
                  </div>
                ))}
              </div>

              {d.todayClasses && d.todayClasses.length > 0 ? (
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    <CalendarClock className="h-4 w-4 text-primary" /> کلاس‌های امروز
                  </p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {d.todayClasses.map((c) => (
                      <li key={c.period} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary tabular-nums">
                          {faNum(c.period)}
                        </span>
                        <span className="min-w-0 truncate">
                          {c.subjectName} — {c.gradeName} «{c.sectionLabel}»
                          {c.roomName ? <span className="text-xs text-muted-foreground"> · {c.roomName}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {d.attendanceToday && d.attendanceToday.length > 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-amber-800">
                    <ClipboardCheck className="h-4 w-4" /> حاضری امروز هنوز قطعی نشده
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {d.attendanceToday.map((s) => (
                      <Button
                        key={s.id}
                        size="sm"
                        variant="outline"
                        className="bg-card"
                        onClick={() => navigate("/attendance")}
                      >
                        {s.gradeName} «{s.sectionLabel}» — ثبت حاضری
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {/* Managers: today's attendance overview (Phase 2) */}
        {d.attendanceOverviewToday ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardCheck className="h-4 w-4 text-primary" /> حاضری امروز
              </CardTitle>
              <CardDescription>وضعیت ثبت حاضری در سراسر مکتب</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-center">
                  <p className="text-2xl font-bold tabular-nums text-emerald-700">{faNum(d.attendanceOverviewToday.submitted)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">قطعی‌شده</p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-center">
                  <p className="text-2xl font-bold tabular-nums text-amber-700">{faNum(d.attendanceOverviewToday.open)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">در انتظار ثبت</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/attendance")}>
                رفتن به حاضری <ArrowLeft className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {/* Recent audit */}
        {canAudit && d.recentAudit && d.recentAudit.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4" /> فعالیت‌های اخیر
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-72 overflow-y-auto scroll-area-thin">
              <ul className="space-y-3">
                {d.recentAudit.map((a) => (
                  <li key={a.id} className="border-b border-border/60 pb-2 last:border-0">
                    <p className="text-sm font-medium">{AUDIT_LABELS[a.action] ?? a.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.actorName} · {formatInstantJalaliDateTime(a.at)}
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {d.applications ? null : (
        <Card>
          <CardContent className="flex items-start gap-3 p-4 text-sm text-muted-foreground">
            <School className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>
              ماژول‌های فیس و کتابخانه طبق نقشهٔ راه در مراحل بعدی فعال می‌شوند. معلومات
              پایه (شاگردان، صنف‌ها، حاضری و نتایج) از هم‌اکنون ذخیره و حفظ می‌شود.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
