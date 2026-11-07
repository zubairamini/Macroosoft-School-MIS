// Guardian / student portal — Phase 4 «پورتال‌ها»: one aggregate screen with
// the children's enrollment, attendance snapshot, published results,
// outstanding fee balance and the latest announcements. Everything is
// derived from the session's guardian/student linkage server-side.

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Wallet, Megaphone, CheckCheck, GraduationCap, ClipboardCheck } from "lucide-react";
import { usePortalOverview, useMarkAnnouncementRead } from "@/lib/api/hooks";
import { EmptyState, PageSkeleton, KpiCard, JalaliDateInput } from "@/components/shared";
import { faNum, faPercent, faMoney, formatInstantJalaliDateTime } from "@/lib/format";
import { toast } from "sonner";
import { apiErrorMessage } from "@/lib/api/hooks";
import { FinHeader } from "@/features/finance/shared";

export function PortalView() {
  const { data: portal, isLoading } = usePortalOverview();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <PageSkeleton />
      </div>
    );
  }
  if (!portal) return null;

  const children = portal.children ?? [];
  const totalBalance = children.reduce((s, c) => s + c.outstandingBalanceDiram, 0);
  const announcements = portal.announcements ?? [];

  return (
    <div className="space-y-4">
      <FinHeader
        title={portal.isGuardian ? "پورتال اولیا" : "پورتال شاگرد"}
        subtitle={`${portal.orgName}${portal.yearName ? ` — سال تعلیمی ${portal.yearName}` : ""}`}
      />

      {children.length === 0 ? (
        <EmptyState
          icon={Users}
          title="شاگردی با حساب شما پیوند نشده است"
          body="اگر فکر می‌کنید این اشتباه است، با مسجل مکتب تماس بگیرید تا پیوند ولی–شاگرد بررسی شود."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="فرزندان" value={faNum(children.length)} icon={Users} />
            <KpiCard
              label="مجموع بدهی شهریه"
              value={faMoney(totalBalance)}
              icon={Wallet}
              tone={totalBalance > 0 ? "amber" : "primary"}
            />
            <KpiCard label="اعلانات اخیر" value={faNum(announcements.length)} icon={Megaphone} />
            <KpiCard
              label="ناخوانده"
              value={faNum(announcements.filter((a) => !a.readByMe).length)}
              icon={CheckCheck}
              tone="amber"
            />
          </div>

          {children.map((child) => (
            <ChildCard key={child.id} child={child} />
          ))}
        </>
      )}

      {announcements.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Megaphone className="h-5 w-5 text-primary" /> اعلانات مکتب
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {announcements.map((a) => (
              <div
                key={a.id}
                className={`rounded-lg border p-3 ${a.readByMe ? "border-border" : "border-amber-300 bg-amber-50/50"}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{a.title}</span>
                  {!a.readByMe ? <Badge variant="outline" className="border-amber-300 text-amber-800">ناخوانده</Badge> : null}
                  <span className="ms-auto text-xs text-muted-foreground">
                    {a.publishedAt ? formatInstantJalaliDateTime(a.publishedAt) : "—"}
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-7">{a.body}</p>
                {!a.readByMe ? <ReadButton id={a.id} /> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ReadButton({ id }: { id: string }) {
  const markRead = useMarkAnnouncementRead();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="mt-1"
      disabled={markRead.isPending}
      onClick={async () => {
        try {
          await markRead.mutateAsync(id);
        } catch (err) {
          toast.error(apiErrorMessage(err));
        }
      }}
    >
      <CheckCheck className="h-3.5 w-3.5" /> خواندم
    </Button>
  );
}

function ChildCard({
  child,
}: {
  child: {
    id: string;
    studentNumber: string;
    name: string;
    fatherName: string;
    status: string;
    gradeName: string | null;
    sectionLabel: string | null;
    branchName: string | null;
    attendance: {
      sessions: number;
      present: number;
      absent: number;
      late: number;
      excused: number;
      notRecorded: number;
    };
    grades: Array<{ subjectId: string; subjectName: string; averagePercent: number }>;
    outstandingBalanceDiram: number;
  };
}) {
  const a = child.attendance;
  const attended = a.present + a.late + a.excused;
  const rate = a.sessions > 0 ? Math.round((attended / a.sessions) * 100) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          <GraduationCap className="h-5 w-5 text-primary" />
          <span>{child.name}</span>
          <span className="text-sm font-normal text-muted-foreground">
            ولد {child.fatherName} · {child.gradeName ?? "—"} {child.sectionLabel ? `شعبهٔ ${child.sectionLabel}` : ""}
          </span>
          <Badge variant="outline" className="ms-auto">
            <span dir="ltr">{child.studentNumber}</span>
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        {/* Attendance snapshot */}
        <div className="rounded-lg border border-border p-4">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <ClipboardCheck className="h-4 w-4 text-primary" /> حاضری (جلسات قطعی‌شده)
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <Stat label="جلسات" value={faNum(a.sessions)} />
            <Stat label="حاضر" value={faNum(a.present)} tone="ok" />
            <Stat label="غیرحاضر" value={faNum(a.absent)} tone="bad" />
            <Stat label="ناوقت" value={faNum(a.late)} />
            <Stat label="رخصت" value={faNum(a.excused)} />
            <Stat label="نا-ثبت" value={faNum(a.notRecorded)} />
          </div>
          <div className="mt-3 text-center text-sm text-muted-foreground">
            نسبت حاضری: {rate === null ? "—" : faPercent(rate)}
          </div>
        </div>

        {/* Published results + balance */}
        <div className="space-y-3">
          <div className="rounded-lg border border-border p-4">
            <div className="mb-2 text-sm font-semibold">نتایج منتشرشده (میانگین مضامین)</div>
            {child.grades.length === 0 ? (
              <p className="text-sm text-muted-foreground">هنوز نتیجهٔ منتشرشده‌ای وجود ندارد.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {child.grades.map((g) => (
                  <Badge key={g.subjectId} variant="outline" className="gap-1">
                    {g.subjectName}: <span className="tabular-nums font-semibold">{faPercent(g.averagePercent)}</span>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-lg border border-border p-4">
            <div className="mb-1 text-sm font-semibold">بدهی شهریه</div>
            <div className={`text-lg font-bold tabular-nums ${child.outstandingBalanceDiram > 0 ? "text-amber-700" : "text-emerald-700"}`}>
              {faMoney(child.outstandingBalanceDiram)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              پرداخت‌ها نزد صندوقدار مکتب انجام می‌شود؛ رسیدها در امور مالی ثبت می‌گردد.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  return (
    <div className="rounded-md bg-muted/50 p-2">
      <div
        className={`tabular-nums text-base font-semibold ${
          tone === "ok" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : ""
        }`}
      >
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
