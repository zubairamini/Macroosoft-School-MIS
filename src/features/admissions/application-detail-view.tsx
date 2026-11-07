// Application detail: full review, state transitions (submit → review →
// decision → enroll), duplicate detection panel, and the atomic enrollment
// dialog with section selection.

"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ArrowLeft, CheckCircle2, XCircle, Eye, GraduationCap, Loader2,
  AlertTriangle, FileText, Users, Info, Check,
} from "lucide-react";
import {
  useApplication, useApplicationTransition, useEnrollApplication, useSimilarApplications,
  useGrades, useSections, useMe, apiErrorMessage,
} from "@/lib/api/hooks";
import { StatusBadge, Ltr, PageSkeleton, EmptyState, JalaliDateInput } from "@/components/shared";
import { faNum, formatJalali, formatInstantJalaliDateTime, genderLabel } from "@/lib/format";
import { navigate } from "@/app-shell/router";
import { hasGrant } from "@/app-shell/shell";

const DOC_LABELS: Record<string, string> = {
  tazkira: "کاپی تذکره",
  photo: "عکس پرسنلی",
  previous_certificate: "سند تعلیمات قبلی",
  medical: "سند طبی",
  other: "سند دیگر",
};

export function ApplicationDetailView({ id }: { id: string }) {
  const { data: me } = useMe();
  const { data: a, isLoading, isError, error } = useApplication(id);
  const { data: similar } = useSimilarApplications(id);
  const transition = useApplicationTransition();
  const enroll = useEnrollApplication();
  const { data: grades } = useGrades();

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollSection, setEnrollSection] = useState("");
  const [enrollDate, setEnrollDate] = useState("");
  const [enrollRoll, setEnrollRoll] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");

  const { data: sections } = useSections(
    a?.requestedGradeId ? { gradeLevelId: a.requestedGradeId } : {},
  );

  const canReview = hasGrant(me, "applications.review");
  const canEnroll = hasGrant(me, "applications.enroll");
  const canSubmit = hasGrant(me, "applications.submit");

  if (isLoading) return <PageSkeleton />;
  if (isError) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="مشاهدهٔ این درخواست مجاز نیست"
        body={apiErrorMessage(error)}
        action={<Button variant="outline" onClick={() => navigate("/admissions")}>بازگشت به شمولیت‌ها</Button>}
      />
    );
  }
  if (!a) return null;

  async function doTransition(action: "submit" | "start" | "approve", note?: string) {
    try {
      await transition.mutateAsync({ id: a!.id, action, note });
      toast.success(
        action === "submit" ? "درخواست ارائه شد."
          : action === "start" ? "بررسی شروع شد."
            : "درخواست تایید شد.",
      );
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function doReject() {
    if (!rejectNote.trim()) {
      toast.error("برای رد کردن درخواست، ذکر دلیل الزامی است.");
      return;
    }
    try {
      await transition.mutateAsync({ id: a!.id, action: "reject", note: rejectNote.trim() });
      toast.success("درخواست رد شد.");
      setRejectOpen(false);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function doEnroll() {
    if (!enrollSection) {
      toast.error("شعبهٔ صنف را انتخاب کنید.");
      return;
    }
    try {
      const res = await enroll.mutateAsync({
        id: a!.id,
        classSectionId: enrollSection,
        enrolledOn: enrollDate || undefined,
        rollNumber: enrollRoll ? Number(enrollRoll) : undefined,
      });
      toast.success("شاگرد با موفقیت شمول شد.", {
        description: `شمارهٔ شاگردی ${res.studentNumber} — ${res.gradeName}، شعبهٔ ${res.sectionLabel}`,
      });
      navigate(`/students/${res.studentId}`);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  const primaryGuardian = a.guardians.find((g) => g.isPrimary) ?? a.guardians[0];

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {/* Header */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold">
                  {a.personal.firstName ?? "—"} {a.personal.fatherName ?? ""}
                </h1>
                <StatusBadge status={a.status} label={a.statusLabel} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                درخواست <Ltr className="text-xs">{a.applicantNumber}</Ltr> ·
                سال تعلیمی {a.academicYearName ?? "—"} ·
                صنف درخواستی {a.requestedGradeName ?? "—"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                ایجاد: {formatInstantJalaliDateTime(a.createdAt)}
                {a.submittedAt ? ` · ارائه: ${formatInstantJalaliDateTime(a.submittedAt)}` : ""}
                {a.decidedAt ? ` · تصمیم: ${formatInstantJalaliDateTime(a.decidedAt)}` : ""}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/admissions")}>
              <ArrowLeft className="h-4 w-4" /> بازگشت
            </Button>
          </div>

          {/* Workflow actions */}
          <Separator className="my-4" />
          <div className="flex flex-wrap items-center gap-2">
            {a.status === "draft" && canSubmit ? (
              <Button size="sm" onClick={() => doTransition("submit")} disabled={transition.isPending}>
                {transition.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                ارائهٔ درخواست
              </Button>
            ) : null}
            {a.status === "submitted" && canReview ? (
              <Button size="sm" variant="outline" onClick={() => doTransition("start")} disabled={transition.isPending}>
                <Eye className="h-4 w-4" /> شروع بررسی
              </Button>
            ) : null}
            {(a.status === "submitted" || a.status === "under_review") && canReview ? (
              <>
                <Button size="sm" onClick={() => doTransition("approve")} disabled={transition.isPending}>
                  <CheckCircle2 className="h-4 w-4" /> تایید
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setRejectOpen(true)} disabled={transition.isPending}>
                  <XCircle className="h-4 w-4" /> رد کردن
                </Button>
              </>
            ) : null}
            {a.status === "approved" && canEnroll ? (
              <Button size="sm" onClick={() => setEnrollOpen(true)}>
                <GraduationCap className="h-4 w-4" /> شمول کردن
              </Button>
            ) : null}
            {a.status === "enrolled" ? (
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-700">
                <Check className="h-3.5 w-3.5" /> این درخواست شمول شده است
              </Badge>
            ) : null}
            {a.status === "rejected" && a.decisionNote ? (
              <p className="w-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                دلیل رد: {a.decisionNote}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Duplicate detection */}
      {similar && similar.length > 0 && a.status !== "enrolled" ? (
        <Card className="border-amber-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-amber-800">
              <AlertTriangle className="h-5 w-5" /> احتمال ثبت مضاعف
            </CardTitle>
            <CardDescription>
              رکوردهای مشابه پیدا شد — لطفاً قبل از تصمیم بررسی کنید. سیستم هرگز خودکار ادغام نمی‌کند.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {similar.map((s) => (
                <li key={`${s.kind}-${s.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                  <div>
                    <p className="text-sm font-semibold">{s.displayName}</p>
                    <p className="text-xs text-amber-800/80">علت مشابهت: {s.reasons.join("، ")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{s.kind === "student" ? "شاگرد موجود" : "درخواست دیگر"}</Badge>
                    {s.statusLabel ? <Badge variant="secondary">{s.statusLabel}</Badge> : null}
                    <Button size="sm" variant="ghost" onClick={() => navigate(s.kind === "student" ? `/students/${s.id}` : `/admissions/${s.id}`)}>
                      مشاهده
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Personal */}
        <Card>
          <CardHeader><CardTitle className="text-base">معلومات شخصی</CardTitle></CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Row label="نام" value={a.personal.firstName ?? "—"} />
              <Row label="نام پدر" value={a.personal.fatherName ?? "—"} />
              <Row label="نام پدربزرگ" value={a.personal.grandfatherName ?? "—"} />
              <Row label="جنسیت" value={genderLabel(a.personal.gender as string)} />
              <Row label="تاریخ تولد" value={formatJalali(a.personal.birthDate as string)} />
              <Row label="زادگاه" value={a.personal.birthPlace ?? "—"} />
              <Row label="مکتب قبلی" value={a.personal.previousSchool ?? "—"} />
              <Row label="صنف قبلی" value={a.personal.previousGrade ? faNum(a.personal.previousGrade) : "—"} />
              {a.personal.phone ? <Row label="تماس" value={<Ltr className="text-xs">{a.personal.phone}</Ltr>} /> : null}
            </dl>
          </CardContent>
        </Card>

        {/* Guardians */}
        <Card>
          <CardHeader><CardTitle className="text-base">اولیا</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {a.guardians.map((g, i) => (
                <li key={i} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{g.fullName}</p>
                    {g.isPrimary ? <Badge variant="secondary">ولیٔ اصلی</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    نسبت: {g.relationship} · <Ltr className="text-[11px]">{g.phone}</Ltr>
                    {g.occupation ? ` · ${g.occupation}` : ""}
                  </p>
                  <div className="mt-1.5 flex gap-1.5">
                    <Badge variant="outline" className={g.contactRights ? "" : "border-red-200 bg-red-50 text-red-700"}>
                      {g.contactRights ? "حق تماس" : "تماس محدود"}
                    </Badge>
                    {g.portalAccess ? <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">پورتال</Badge> : null}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Documents */}
        <Card>
          <CardHeader><CardTitle className="text-base">اسناد</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {a.documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">سندی ثبت نشده است.</p>
              ) : (
                a.documents.map((d, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-sm">
                    <span className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      {d.title}
                    </span>
                    {d.provided ? (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">ارائه‌شده</Badge>
                    ) : (
                      <Badge variant="outline">ارائه‌نشده</Badge>
                    )}
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>

        {/* Requested placement */}
        <Card>
          <CardHeader><CardTitle className="text-base">صنف و تنظیمات درخواست</CardTitle></CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Row label="سال تعلیمی" value={a.academicYearName ?? "—"} />
              <Row label="صنف درخواستی" value={a.requestedGradeName ?? "—"} />
              <Row label="پلان فیس" value="پیش‌فرض (فعال‌سازی در مرحلهٔ سوم)" />
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" /> رد کردن درخواست
            </DialogTitle>
            <DialogDescription>
              رد کردن درخواست نهایی است و در تاریخچه با دلیل ثبت می‌شود.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>دلیل رد (الزامی)</Label>
            <Textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="مثلاً: ظرفیت صنف تکمیل است…"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>لغو</Button>
            <Button variant="destructive" onClick={doReject} disabled={transition.isPending || !rejectNote.trim()}>
              {transition.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              رد قطعی
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enroll dialog */}
      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" /> شمول {a.personal.firstName}
            </DialogTitle>
            <DialogDescription>
              شمول در یک عمل واحد و اتمی انجام می‌شود: ایجاد شاگرد، پیوند اولیا، ثبت شمولیت
              سالانه، کاپی اسناد و ثبت در ریکارود نظارتی.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>صنف</Label>
              <Select value={a.requestedGradeId ?? ""} disabled>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(grades ?? []).map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.nameDari}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>شعبهٔ صنف *</Label>
              <Select value={enrollSection} onValueChange={setEnrollSection}>
                <SelectTrigger><SelectValue placeholder="انتخاب…" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {(sections ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id} disabled={s._count.enrollments >= s.capacity}>
                      {s.gradeLevel.nameDari} — {s.label} ({s._count.enrollments}/{s.capacity}) · {s.branch.name}
                      {s.shift ? ` · ${s.shift.name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(sections ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  برای این صنف شعبه‌ای ثبت نشده — ابتدا از تنظیمات شعبهٔ صنف ایجاد کنید.
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>تاریخ شمول</Label>
                <JalaliDateInput value={enrollDate} onChange={setEnrollDate} placeholder="۱۴۰۵/۰۱/۱۰" />
              </div>
              <div className="space-y-1.5">
                <Label>شمارهٔ رول (اختیاری)</Label>
                <Input dir="ltr" className="text-start" value={enrollRoll} onChange={(e) => setEnrollRoll(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollOpen(false)}>لغو</Button>
            <Button onClick={doEnroll} disabled={enroll.isPending || !enrollSection}>
              {enroll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              تایید شمول
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-1.5 last:border-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-end font-medium">{value}</dd>
    </div>
  );
}
