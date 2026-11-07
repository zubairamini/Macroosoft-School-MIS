// Student profile: tabs (overview, enrollment, guardians, documents,
// history) + lifecycle status actions with required reasons.
// Sensitive fields appear only with students.view_sensitive.

"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  User, Phone, MapPin, CalendarDays, Users, FileText, History, ShieldAlert,
  Loader2, AlertTriangle, Lock, CheckCircle2, ArrowLeft, FileCheck2,
} from "lucide-react";
import { useStudent, useStudentStatus, useUpdateStudent, useMe, apiErrorMessage, useAttendanceSummary, useReportCard } from "@/lib/api/hooks";
import { StatusBadge, Ltr, PageSkeleton, EmptyState, JalaliDateInput } from "@/components/shared";
import { faNum, formatJalali, formatInstantJalaliDateTime, genderLabel, faDate, faPercent, assessmentTypeLabel } from "@/lib/format";
import { navigate } from "@/app-shell/router";
import { hasGrant } from "@/app-shell/shell";

const DOC_TYPE_LABELS: Record<string, string> = {
  tazkira: "کاپی تذکره",
  photo: "عکس پرسنلی",
  previous_certificate: "سند تعلیمات قبلی",
  medical: "سند طبی",
  other: "سند دیگر",
};

const AUDIT_LABELS: Record<string, string> = {
  "application.create": "ایجاد درخواست شمولیت",
  "application.submit": "ارائهٔ درخواست",
  "application.approve": "تایید درخواست",
  "application.reject": "رد درخواست",
  "application.enroll": "شمول شاگرد",
  "student.update": "ویرایش معلومات",
  "student.status-change": "تغییر وضعیت",
  "student.link-guardian": "پیوند ولی",
  "guardian.create": "ایجاد ولی",
};

export function StudentProfileView({ id }: { id: string }) {
  const { data: me } = useMe();
  const { data: s, isLoading, isError, error } = useStudent(id);
  const statusMutation = useStudentStatus();
  const updateMutation = useUpdateStudent();

  const [statusDialog, setStatusDialog] = useState<null | { status: string; label: string; needsReason: boolean }>(null);
  const [reason, setReason] = useState("");
  const [editOpen, setEditOpen] = useState(false);

  const canUpdate = hasGrant(me, "students.update");
  const canSeeAttendance = hasGrant(me, "attendance.view");
  const canSeeGrades = hasGrant(me, "grades.view");

  if (isLoading) return <PageSkeleton />;
  if (isError) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="مشاهدهٔ این شاگرد مجاز نیست"
        body={apiErrorMessage(error)}
        action={<Button variant="outline" onClick={() => navigate("/students")}>بازگشت به لست شاگردان</Button>}
      />
    );
  }
  if (!s) return null;

  const enr = s.enrollments.find((e) => e.status === "active") ?? s.enrollments[0];

  async function applyStatus() {
    if (!statusDialog) return;
    if (statusDialog.needsReason && !reason.trim()) {
      toast.error("ذکر دلیل الزامی است.");
      return;
    }
    try {
      await statusMutation.mutateAsync({ id: s!.id, status: statusDialog.status, note: reason.trim() || undefined });
      toast.success("وضعیت شاگرد تغییر کرد.");
      setStatusDialog(null);
      setReason("");
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      {/* Header card */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-bold text-primary">
                {(s.personal.firstName ?? "؟")[0]}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold">
                    {s.personal.firstName ?? "—"} {s.personal.fatherName ?? ""}
                  </h1>
                  <StatusBadge status={s.status} label={s.statusLabel} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  <Ltr className="text-xs">{s.studentNumber}</Ltr>
                  {enr ? ` · ${enr.gradeName}${enr.sectionLabel ? ` — شعبهٔ ${enr.sectionLabel}` : ""} · ${enr.academicYearName}` : " · شمولیت ثبت‌نشده"}
                </p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {formatJalali(s.personal.birthDate as string)}</span>
                  <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> {genderLabel(s.personal.gender as string)}</span>
                  {s.application ? (
                    <span className="flex items-center gap-1">
                      <FileCheck2 className="h-3.5 w-3.5" />
                      از درخواست <Ltr className="text-[11px]">{s.application.applicantNumber}</Ltr>
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            {canUpdate ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <FileText className="h-4 w-4" /> ویرایش معلومات
                </Button>
                {s.status === "active" ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setStatusDialog({ status: "inactive", label: "غیرفعال موقت", needsReason: false })}>
                      غیرفعال موقت
                    </Button>
                    <Button variant="outline" size="sm" className="text-amber-700" onClick={() => setStatusDialog({ status: "transferred", label: "انتقال", needsReason: true })}>
                      انتقال
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => setStatusDialog({ status: "withdrawn", label: "انصراف", needsReason: true })}>
                      انصراف
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={() => setStatusDialog({ status: "active", label: "فعال‌سازی دوباره", needsReason: false })}>
                    <CheckCircle2 className="h-4 w-4" /> فعال‌سازی دوباره
                  </Button>
                )}
              </div>
            ) : null}
          </div>
          {s.statusNote ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
              یادداشت وضعیت: {s.statusNote}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" dir="rtl">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">مرور</TabsTrigger>
          <TabsTrigger value="enrollment">شمولیت</TabsTrigger>
          <TabsTrigger value="guardians">اولیا</TabsTrigger>
          <TabsTrigger value="documents">اسناد</TabsTrigger>
          {canSeeAttendance ? <TabsTrigger value="attendance">حاضری</TabsTrigger> : null}
          {canSeeGrades ? <TabsTrigger value="results">نتایج</TabsTrigger> : null}
          <TabsTrigger value="history">تاریخچه</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">معلومات شخصی</CardTitle></CardHeader>
              <CardContent>
                <dl className="space-y-2.5 text-sm">
                  <Row label="نام" value={s.personal.firstName ?? "—"} />
                  <Row label="نام پدر" value={s.personal.fatherName ?? "—"} />
                  <Row label="نام پدربزرگ" value={s.personal.grandfatherName ?? "—"} />
                  <Row label="جنسیت" value={genderLabel(s.personal.gender as string)} />
                  <Row label="تاریخ تولد" value={formatJalali(s.personal.birthDate as string)} />
                  <Row label="زادگاه" value={s.personal.birthPlace ?? "—"} />
                  <Row label="نشانی" value={s.personal.address ?? "—"} />
                  {s.personal.phone ? (
                    <Row label="تماس" value={<Ltr className="text-xs">{s.personal.phone}</Ltr>} />
                  ) : null}
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">معلومات محدود</CardTitle></CardHeader>
              <CardContent>
                {s.canSeeSensitive ? (
                  <div className="space-y-3">
                    <p className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-800">
                      <Lock className="h-3.5 w-3.5" /> شما اجازهٔ دیدن معلومات محدود را دارید.
                    </p>
                    <dl className="space-y-2.5 text-sm">
                      <Row label="یادداشت صحی" value={s.personal.healthNotes ?? "ثبت نشده"} />
                      <Row label="مکتب قبلی" value={s.personal.previousSchool ?? "—"} />
                      <Row label="صنف قبلی" value={s.personal.previousGrade ? faNum(s.personal.previousGrade) : "—"} />
                    </dl>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-6 text-center">
                    <Lock className="mb-2 h-6 w-6 text-muted-foreground" />
                    <p className="text-sm font-medium">معلومات محدود پنهان است</p>
                    <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                      یادداشت‌های صحی و معلومات هویتی فقط برای نقش‌های مجاز (مسجل، مدیر) قابل
                      مشاهده است.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Enrollment history */}
        <TabsContent value="enrollment" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">تاریخچهٔ شمولیت</CardTitle>
              <CardDescription>هر سال تعلیمی یک رکورد جداگانه — تاریخچه هرگز حذف نمی‌شود</CardDescription>
            </CardHeader>
            <CardContent>
              {s.enrollments.length === 0 ? (
                <EmptyState title="شمولیتی ثبت نشده است" />
              ) : (
                <ul className="space-y-3">
                  {s.enrollments.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                      <div>
                        <p className="font-semibold">
                          سال {e.academicYearName} — {e.gradeName}
                          {e.sectionLabel ? ` · شعبهٔ ${e.sectionLabel}` : ""}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {e.branchName ? `${e.branchName} · ` : ""}
                          {e.shiftName ? `${e.shiftName} · ` : ""}
                          شمول در {formatJalali(e.enrolledOn)}
                          {e.rollNumber ? ` · رول ${faNum(e.rollNumber)}` : ""}
                        </p>
                      </div>
                      <StatusBadge status={e.status} label={e.statusLabel} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Guardians */}
        <TabsContent value="guardians" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">اولیا</CardTitle>
              <CardDescription>حقوق تماس و دسترسی پورتال برای هر ولی جداگانه تعیین شده است</CardDescription>
            </CardHeader>
            <CardContent>
              {s.guardians.length === 0 ? (
                <EmptyState icon={Users} title="ولیی ثبت نشده است" />
              ) : (
                <ul className="grid gap-3 md:grid-cols-2">
                  {s.guardians.map((g) => (
                    <li key={g.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold">{g.fullName}</p>
                        <div className="flex gap-1">
                          {g.isPrimary ? <Badge variant="secondary">ولیٔ اصلی</Badge> : null}
                          {!g.contactRights ? (
                            <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">تماس محدود</Badge>
                          ) : null}
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">نسبت: {g.relationship}</p>
                      {g.phone ? (
                        <p className="mt-1 flex items-center gap-1.5 text-xs">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          <Ltr className="text-[11px]">{g.phone}</Ltr>
                        </p>
                      ) : null}
                      {g.occupation ? <p className="mt-1 text-xs text-muted-foreground">شغل: {g.occupation}</p> : null}
                      <div className="mt-2 flex gap-1.5">
                        <Badge variant="outline" className={g.portalAccess ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ""}>
                          {g.portalAccess ? "دسترسی پورتال فعال" : "بدون پورتال"}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">اسناد</CardTitle>
              <CardDescription>دسترسی به فایل‌ها خصوصی است و با اجازهٔ سرور انجام می‌شود</CardDescription>
            </CardHeader>
            <CardContent>
              {s.documents.length === 0 ? (
                <EmptyState icon={FileText} title="سندی ثبت نشده است" />
              ) : (
                <ul className="space-y-2">
                  {s.documents.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
                      <div className="flex items-center gap-2.5">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{d.title}</p>
                          <p className="text-xs text-muted-foreground">{DOC_TYPE_LABELS[d.type] ?? d.type}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{formatInstantJalaliDateTime(d.uploadedAt)}</span>
                        {d.isVerified ? (
                          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">تاییدشده</Badge>
                        ) : (
                          <Badge variant="outline">در انتظار تایید</Badge>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit history */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4" /> تاریخچهٔ تغییرات
              </CardTitle>
              <CardDescription>از ریکارود نظارتی سیستم — نمایش‌داده‌شده فقط با اجازهٔ audit.view</CardDescription>
            </CardHeader>
            <CardContent>
              {s.recentAudit.length === 0 ? (
                <EmptyState title="تاریخچه‌ای موجود نیست" body="یا شما اجازهٔ دیدن تاریخچه را ندارید." />
              ) : (
                <ol className="relative space-y-4 border-s-2 border-border ps-4">
                  {s.recentAudit.map((a) => (
                    <li key={a.id} className="relative">
                      <span className="absolute -start-[23px] top-1 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                      <p className="text-sm font-medium">{AUDIT_LABELS[a.action] ?? a.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.actorName} · {formatInstantJalaliDateTime(a.at)}
                      </p>
                      {a.reason ? (
                        <p className="mt-1 rounded-md bg-muted px-2 py-1 text-xs">دلیل: {a.reason}</p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        {/* Attendance tab (Phase 2) */}
        {canSeeAttendance ? (
          <TabsContent value="attendance" className="mt-4">
            <StudentAttendanceTab studentId={s.id} />
          </TabsContent>
        ) : null}

        {/* Results / report card tab (Phase 2) */}
        {canSeeGrades ? (
          <TabsContent value="results" className="mt-4">
            <StudentResultsTab studentId={s.id} />
          </TabsContent>
        ) : null}
      </Tabs>

      {/* Status-change dialog (deliberate confirmation with reason) */}
      <Dialog open={statusDialog !== null} onOpenChange={(o) => { if (!o) { setStatusDialog(null); setReason(""); } }}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              {statusDialog?.label} — {s.personal.firstName}
            </DialogTitle>
            <DialogDescription>
              {statusDialog?.needsReason
                ? "این عمل در تاریخچه ثبت می‌شود و دلیل آن الزامی است. اسناد و تاریخچهٔ شاگرد حفظ می‌شود."
                : "این عمل در تاریخچهٔ نظارتی ثبت می‌شود."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="status-reason">دلیل {statusDialog?.needsReason ? "(الزامی)" : "(اختیاری)"}</Label>
            <Textarea
              id="status-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثلاً: انتقال به مکتب دیگر به دلیل جابجایی خانواده"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setStatusDialog(null); setReason(""); }}>لغو</Button>
            <Button
              variant={statusDialog?.status === "withdrawn" ? "destructive" : "default"}
              disabled={statusMutation.isPending || (statusDialog?.needsReason === true && !reason.trim())}
              onClick={applyStatus}
            >
              {statusMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              تایید {statusDialog?.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog (quick edit drawer-style, version-checked) */}
      {editOpen ? (
        <EditStudentDialog
          studentId={s.id}
          personal={s.personal}
          version={s.version}
          onClose={() => setEditOpen(false)}
        />
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-2 last:border-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-end font-medium">{value}</dd>
    </div>
  );
}

// ── Phase 2: attendance & results tabs ───────────────────────────────────

function StudentAttendanceTab({ studentId }: { studentId: string }) {
  const { data, isLoading, isError, error } = useAttendanceSummary({ studentId });
  if (isLoading) return <PageSkeleton />;
  if (isError) {
    return <EmptyState icon={ShieldAlert} title="مشاهدهٔ حاضری مجاز نیست" body={apiErrorMessage(error)} />;
  }
  const s = data?.students[0];
  if (!s || data.sessions === 0) {
    return <EmptyState title="حاضری قطعی‌شده‌ای موجود نیست" body="فقط سیشن‌های قطعی‌شدهٔ استاد در آمار محاسبه می‌شود." />;
  }
  const cells: Array<[string, number, string]> = [
    ["حاضر", s.present, "text-emerald-700"],
    ["غیرحاضر", s.absent, "text-red-700"],
    ["ناوقت", s.late, "text-amber-700"],
    ["رخصت", s.excused, "text-sky-700"],
    ["نا-ثبت", s.notRecorded, "text-muted-foreground"],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">خلاصهٔ حاضری</CardTitle>
        <CardDescription>
          مجموع {faNum(data.sessions)} سیشن قطعی‌شده — «نا-ثبت» به معنی عدم ثبت است، نه حاضر یا غیرحاضر.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {cells.map(([label, v, cls]) => (
            <div key={label} className="rounded-lg border border-border p-3 text-center">
              <p className={`text-2xl font-bold tabular-nums ${cls}`}>{faNum(v)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StudentResultsTab({ studentId }: { studentId: string }) {
  const { data, isLoading, isError, error } = useReportCard(studentId);
  if (isLoading) return <PageSkeleton />;
  if (isError) {
    return <EmptyState icon={ShieldAlert} title="مشاهدهٔ نتایج مجاز نیست" body={apiErrorMessage(error)} />;
  }
  if (!data || data.subjects.length === 0) {
    return <EmptyState title="نتیجهٔ منتشرشده‌ای موجود نیست" body="نتایج فقط بعد از انتشار توسط مدیر تعلیمی قابل مشاهده است." />;
  }
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">کارت نتیجه — سال {data.academicYearName ?? ""}</CardTitle>
          <CardDescription>
            میانگین‌ها بر اساس نمرات منتشرشده؛ نمرات نا-ثبت در میانگین شمرده نمی‌شود (صفر نیست).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.subjects.map((sub) => (
            <div key={sub.subjectId} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{sub.subjectName}</p>
                <p className="text-lg font-bold tabular-nums text-primary">{faPercent(sub.average)}</p>
              </div>
              <ul className="mt-2 space-y-1.5">
                {sub.items.map((it) => (
                  <li key={it.assessmentId} className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-1.5 text-sm">
                    <span className="text-muted-foreground">
                      {it.title}
                      <span className="ms-1.5 text-xs">({assessmentTypeLabel(it.type)})</span>
                    </span>
                    <span className="tabular-nums font-medium">
                      {it.isAbsent ? (
                        <span className="text-red-700">غیرحاضر در امتحان</span>
                      ) : it.score !== null ? (
                        <>{faNum(it.score)} <span className="text-muted-foreground">از {faNum(it.maxScore)}</span></>
                      ) : (
                        <span className="text-muted-foreground">نا-ثبت</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {data.attendance && data.attendance.sessions > 0 ? (
            <p className="text-xs text-muted-foreground">
              حاضری: {faNum(data.attendance.present)} حاضر از {faNum(data.attendance.sessions)} روز قطعی‌شده
              {data.attendance.absent > 0 ? ` · ${faNum(data.attendance.absent)} غیرحاضر` : ""}
              {data.attendance.notRecorded > 0 ? ` · ${faNum(data.attendance.notRecorded)} نا-ثبت` : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function EditStudentDialog({
  studentId, personal, version, onClose,
}: {
  studentId: string;
  personal: Record<string, string | null>;
  version: number;
  onClose: () => void;
}) {
  const update = useUpdateStudent();
  const [form, setForm] = useState({
    firstName: (personal.firstName as string) ?? "",
    fatherName: (personal.fatherName as string) ?? "",
    grandfatherName: (personal.grandfatherName as string) ?? "",
    phone: (personal.phone as string) ?? "",
    address: (personal.address as string) ?? "",
    birthDate: (personal.birthDate as string) ?? "",
  });
  const [genderState, setGenderState] = useState(personal.gender === "female" ? "female" : "male");

  async function onSave() {
    try {
      // Preserve fields not shown in the quick-edit dialog.
      const merged = {
        ...personal,
        firstName: form.firstName,
        fatherName: form.fatherName,
        grandfatherName: form.grandfatherName || null,
        gender: genderState,
        birthDate: form.birthDate,
        phone: form.phone || null,
        address: form.address || null,
      };
      await update.mutateAsync({
        id: studentId,
        body: { personal: merged, version },
      });
      toast.success("معلومات شاگرد ذخیره شد.");
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>ویرایش معلومات شاگرد</DialogTitle>
          <DialogDescription>
            تغییرات با کنترل نسخه ذخیره می‌شود — اگر شخص دیگری هم‌زمان تغییر داده باشد، پیام تعارض می‌گیرید.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>نام</Label>
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>نام پدر</Label>
              <Input value={form.fatherName} onChange={(e) => setForm({ ...form, fatherName: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>نام پدربزرگ</Label>
            <Input value={form.grandfatherName} onChange={(e) => setForm({ ...form, grandfatherName: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>جنسیت</Label>
              <Select value={genderState} onValueChange={setGenderState}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">مل</SelectItem>
                  <SelectItem value="female">زن</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>تاریخ تولد</Label>
              <JalaliDateInput value={form.birthDate} onChange={(v) => setForm({ ...form, birthDate: v })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>شمارهٔ تماس</Label>
            <Input dir="ltr" className="text-start" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+93 …" />
          </div>
          <div className="space-y-1.5">
            <Label>نشانی</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>لغو</Button>
          <Button onClick={onSave} disabled={update.isPending || form.firstName.trim().length < 2 || form.fatherName.trim().length < 2}>
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} ذخیره
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
