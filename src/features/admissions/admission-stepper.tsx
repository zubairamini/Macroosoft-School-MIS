// Admission stepper: the guided 6-step workflow
// 1 personal → 2 guardians → 3 previous education & documents →
// 4 class/section/shift → 5 fee plan (noted for Phase 3) → 6 review.
// Duplicate detection warns before submission; never auto-merges.

"use client";

import { useMemo, useState } from "react";
import { useRouterExitGuard } from "./exit-guard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { User, Users, BookOpen, School, Wallet, ClipboardCheck, Loader2, AlertTriangle, Plus, Trash2, Info } from "lucide-react";
import { useCreateApplication, useGrades, useSections, useOrgContext, apiErrorMessage } from "@/lib/api/hooks";
import { Stepper, JalaliDateInput, Ltr } from "@/components/shared";
import { formatJalali, genderLabel } from "@/lib/format";
import { navigate } from "@/app-shell/router";

const STEPS = [
  "معلومات شخصی",
  "ولی و تماس‌ها",
  "تعلیمات قبلی و اسناد",
  "صنف و شعبه",
  "پلان فیس",
  "بررسی و تایید",
];

const STEP_ICONS = [User, Users, BookOpen, School, Wallet, ClipboardCheck];

interface GuardianForm {
  fullName: string;
  relationship: string;
  phone: string;
  phone2: string;
  occupation: string;
  isPrimary: boolean;
  contactRights: boolean;
  portalAccess: boolean;
}

const RELATIONSHIPS = ["پدر", "مادر", "عمو", "مامو", "برادر", "خواهر", "سایر"];

const DOC_TYPES: Array<[string, string]> = [
  ["tazkira", "کاپی تذکره"],
  ["photo", "عکس پرسنلی"],
  ["previous_certificate", "سند تعلیمات قبلی"],
  ["medical", "سند طبی"],
  ["other", "سند دیگر"],
];

export function AdmissionStepper() {
  const { data: grades } = useGrades();
  const { data: orgCtx } = useOrgContext();
  const create = useCreateApplication();

  const [step, setStep] = useState(0);
  const [savedId, setSavedId] = useState<string | null>(null);

  // Step 1 — personal
  const [firstName, setFirstName] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [grandfatherName, setGrandfatherName] = useState("");
  const [gender, setGender] = useState<"male" | "female">("male");
  const [birthDate, setBirthDate] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  // Step 2 — guardians
  const [guardians, setGuardians] = useState<GuardianForm[]>([
    { fullName: "", relationship: "پدر", phone: "", phone2: "", occupation: "", isPrimary: true, contactRights: true, portalAccess: false },
  ]);

  // Step 3 — previous education + documents
  const [previousSchool, setPreviousSchool] = useState("");
  const [previousGrade, setPreviousGrade] = useState("");
  const [docs, setDocs] = useState<Record<string, boolean>>({
    tazkira: true, photo: false, previous_certificate: false, medical: false, other: false,
  });

  // Step 4 — class/section/shift
  const [gradeId, setGradeId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const { data: sections } = useSections(
    gradeId ? { gradeLevelId: gradeId } : {},
  );

  // Step 5 — fee plan placeholder
  const [feePlan, setFeePlan] = useState("default");

  // Step 6 — review & submit
  const [acknowledged, setAcknowledged] = useState(false);
  const [duplicateAck, setDuplicateAck] = useState(false);

  const dirty = useMemo(
    () => firstName.trim().length > 0 || guardians.some((g) => g.fullName.trim().length > 0),
    [firstName, guardians],
  );
  useRouterExitGuard(dirty && !savedId && step < 6);

  const stepValid =
    step === 0
      ? firstName.trim().length >= 2 && fatherName.trim().length >= 2 && birthDate.length === 10
      : step === 1
        ? guardians.length >= 1 &&
          guardians.every((g) => g.fullName.trim().length >= 2 && g.phone.trim().length >= 6) &&
          guardians.some((g) => g.isPrimary)
        : step === 2
          ? true
          : step === 3
            ? gradeId.length > 0
            : step === 4
              ? true
              : acknowledged && duplicateAck;

  function setGuardian(i: number, patch: Partial<GuardianForm>) {
    setGuardians((gs) => gs.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  }

  async function onSave() {
    try {
      const created = await create.mutateAsync({
        academicYearId: orgCtx?.currentYear?.id ?? "",
        personal: {
          firstName: firstName.trim(),
          fatherName: fatherName.trim(),
          grandfatherName: grandfatherName.trim() || null,
          gender,
          birthDate,
          birthPlace: birthPlace.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
          previousSchool: previousSchool.trim() || null,
          previousGrade: previousGrade ? Number(previousGrade) : null,
        },
        requestedGradeId: gradeId,
        requestedSectionId: sectionId || null,
        requestedShiftId: shiftId || null,
        guardians: guardians.map((g) => ({
          fullName: g.fullName.trim(),
          relationship: g.relationship,
          phone: g.phone.trim(),
          phone2: g.phone2.trim() || null,
          occupation: g.occupation.trim() || null,
          isPrimary: g.isPrimary,
          contactRights: g.contactRights,
          portalAccess: g.portalAccess,
        })),
        documents: DOC_TYPES.filter(([t]) => docs[t]).map(([t, title]) => ({
          type: t, title, provided: true,
        })),
      });
      setSavedId(created.id);
      toast.success("پیش‌نویس ذخیره شد.", {
        description: `شمارهٔ درخواست: ${created.applicantNumber}`,
      });
      navigate(`/admissions/${created.id}`);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  const CurrentIcon = STEP_ICONS[step];
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold">درخواست شمولیت جدید</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ثبت گام‌به‌گام معلومات شاگرد جدید — سال تعلیمی {orgCtx?.currentYear?.name ?? "—"}
        </p>
        <Progress value={progress} className="mt-3 h-1.5" />
      </header>

      <Stepper steps={STEPS} current={step} onGo={(i) => setStep(i)} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CurrentIcon className="h-5 w-5 text-primary" /> {STEPS[step]}
          </CardTitle>
          <CardDescription>
            مرحلهٔ {new Intl.NumberFormat("fa-AF", { useGrouping: false }).format(step + 1)} از {new Intl.NumberFormat("fa-AF", { useGrouping: false }).format(STEPS.length)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ── Step 1: personal ── */}
          {step === 0 ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="نام شاگرد *" required>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="مثلاً: احمد" />
                </Field>
                <Field label="نام پدر *" required>
                  <Input value={fatherName} onChange={(e) => setFatherName(e.target.value)} placeholder="مثلاً: محمد نعیم" />
                </Field>
                <Field label="نام پدربزرگ">
                  <Input value={grandfatherName} onChange={(e) => setGrandfatherName(e.target.value)} />
                </Field>
                <Field label="جنسیت *" required>
                  <Select value={gender} onValueChange={(v) => setGender(v as "male" | "female")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">مل</SelectItem>
                      <SelectItem value="female">زن</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="تاریخ تولد *" required hint="تاریخ شمسی وارد کنید؛ بدون تغییر منطقهٔ وختی ذخیره می‌شود">
                  <JalaliDateInput value={birthDate} onChange={setBirthDate} placeholder="۱۳۹۷/۰۲/۱۰" />
                </Field>
                <Field label="زادگاه">
                  <Input value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)} placeholder="مثلاً: کابل" />
                </Field>
                <Field label="شمارهٔ تماس (اختیاری)">
                  <Input dir="ltr" className="text-start" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+93 70 123 4567" />
                </Field>
                <Field label="نشانی">
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="ولایت، ناحیه، سرک…" />
                </Field>
              </div>
              <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-6 text-muted-foreground">
                ایمیل برای شاگرد یا ولی لازم نیست — سیستم با شمارهٔ تماس کار می‌کند.
                ارقام فارسی/عربی/لاتین همه پذیرفته می‌شوند.
              </p>
            </>
          ) : null}

          {/* ── Step 2: guardians ── */}
          {step === 1 ? (
            <>
              {guardians.map((g, i) => (
                <div key={i} className="space-y-3 rounded-lg border border-border p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">ولی {new Intl.NumberFormat("fa-AF", { useGrouping: false }).format(i + 1)}</p>
                    {guardians.length > 1 ? (
                      <Button variant="ghost" size="sm" onClick={() => setGuardians((gs) => gs.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4" /> حذف
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="نام کامل *" required>
                      <Input value={g.fullName} onChange={(e) => setGuardian(i, { fullName: e.target.value })} placeholder="مثلاً: محمد نعیم احمدی" />
                    </Field>
                    <Field label="نسبت *" required>
                      <Select value={g.relationship} onValueChange={(v) => setGuardian(i, { relationship: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {RELATIONSHIPS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="شمارهٔ تماس *" required>
                      <Input dir="ltr" className="text-start" value={g.phone} onChange={(e) => setGuardian(i, { phone: e.target.value })} placeholder="+93 …" />
                    </Field>
                    <Field label="شمارهٔ دوم">
                      <Input dir="ltr" className="text-start" value={g.phone2} onChange={(e) => setGuardian(i, { phone2: e.target.value })} />
                    </Field>
                    <Field label="شغل">
                      <Input value={g.occupation} onChange={(e) => setGuardian(i, { occupation: e.target.value })} />
                    </Field>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={g.isPrimary} onCheckedChange={(v) => {
                        if (v) {
                          setGuardians((gs) => gs.map((x, j) => ({ ...x, isPrimary: j === i })));
                        } else {
                          setGuardian(i, { isPrimary: false });
                        }
                      }} /> ولیٔ اصلی
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={g.contactRights} onCheckedChange={(v) => setGuardian(i, { contactRights: Boolean(v) })} /> حق تماس
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={g.portalAccess} onCheckedChange={(v) => setGuardian(i, { portalAccess: Boolean(v) })} /> دسترسی پورتال
                    </label>
                  </div>
                </div>
              ))}
              <Button variant="outline" onClick={() => setGuardians((gs) => [...gs, { fullName: "", relationship: "مادر", phone: "", phone2: "", occupation: "", isPrimary: false, contactRights: true, portalAccess: false }])}>
                <Plus className="h-4 w-4" /> افزودن ولی دیگر
              </Button>
              <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-6 text-muted-foreground">
                یک ولی می‌تواند چند شاگرد را پیوند دهد. حقوق تماس و دسترسی پورتال برای هر
                ولی جداگانه تعیین می‌شود.
              </p>
            </>
          ) : null}

          {/* ── Step 3: previous education + docs ── */}
          {step === 2 ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="مکتب قبلی">
                  <Input value={previousSchool} onChange={(e) => setPreviousSchool(e.target.value)} placeholder="نام مکتب یا «—»" />
                </Field>
                <Field label="صنف قبلی">
                  <Select value={previousGrade || "none"} onValueChange={(v) => setPreviousGrade(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="انتخاب…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">ثبت نشده</SelectItem>
                      {(grades ?? []).map((g) => (
                        <SelectItem key={g.id} value={String(g.level)}>{g.nameDari}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">چک‌لست اسناد</p>
                <p className="mb-3 text-xs text-muted-foreground">اسنادی که هنگام ثبت درخواست ارائه شده را علامت بزنید.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {DOC_TYPES.map(([type, label]) => (
                    <label key={type} className="transition-soft flex items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm hover:border-primary/40">
                      <span>{label}</span>
                      <Checkbox
                        checked={docs[type]}
                        onCheckedChange={(v) => setDocs((d) => ({ ...d, [type]: Boolean(v) }))}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {/* ── Step 4: class/section/shift ── */}
          {step === 3 ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="صنف درخواستی *" required>
                  <Select value={gradeId} onValueChange={(v) => { setGradeId(v); setSectionId(""); }}>
                    <SelectTrigger><SelectValue placeholder="صنف…" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {(grades ?? []).map((g) => (
                        <SelectItem key={g.id} value={g.id}>{g.nameDari}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="شعبهٔ صنف (پیشنهادی)">
                  <Select value={sectionId || "none"} onValueChange={(v) => setSectionId(v === "none" ? "" : v)} disabled={!gradeId}>
                    <SelectTrigger><SelectValue placeholder="انتخاب…" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="none">تعیین در وخت شمول</SelectItem>
                      {(sections ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.label} — {s._count.enrollments}/{s.capacity} ({s.branch.name})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="وخت (شیفت)">
                  <Select value={shiftId || "none"} onValueChange={(v) => setShiftId(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="انتخاب…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">فرقی ندارد</SelectItem>
                      {(orgCtx?.shifts ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} ({s.startTime}–{s.endTime})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <p className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs leading-6 text-amber-800">
                <strong>یادداشت:</strong> «شعبهٔ صنف» (الف، ب…) داخل هر صنف است و با «شعبهٔ
                مکتب» (کمپس/لوکیشن) فرق دارد. شعبهٔ نهایی هنگام شمول قطعی می‌شود.
              </p>
            </>
          ) : null}

          {/* ── Step 5: fee plan ── */}
          {step === 4 ? (
            <>
              <div className="space-y-3">
                <label className="transition-soft flex items-center justify-between gap-3 rounded-lg border border-border p-4 hover:border-primary/40">
                  <div>
                    <p className="font-medium">پلان پیش‌فرض فیس مکتب</p>
                    <p className="text-xs text-muted-foreground">طبق تنظیمات ماژول فیس مکتب</p>
                  </div>
                  <input type="radio" name="fee-plan" checked={feePlan === "default"} onChange={() => setFeePlan("default")} className="h-4 w-4 accent-[#047857]" />
                </label>
                <label className="transition-soft flex items-center justify-between gap-3 rounded-lg border border-dashed border-border p-4 opacity-70">
                  <div>
                    <p className="font-medium">پلان‌های سفارشی و بورسیه</p>
                    <p className="text-xs text-muted-foreground">فعال‌سازی در مرحلهٔ سوم (ماژول فیس)</p>
                  </div>
                  <input type="radio" name="fee-plan" disabled className="h-4 w-4" />
                </label>
              </div>
              <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-6 text-muted-foreground">
                <Info className="mt-1 h-3.5 w-3.5 shrink-0" />
                ماژول فیس و وصولی در مرحلهٔ سوم توسعه فعال می‌شود. پلان انتخاب‌شده ذخیره
                می‌گردد تا هنگام فعال شدن صورت‌حساب‌ها بر اساس آن ایجاد شود. در مکتب‌های
                دولتی، ماژول فیس را می‌توان در تنظیمات کاملاً غیرفعال کرد.
              </p>
            </>
          ) : null}

          {/* ── Step 6: review ── */}
          {step === 5 ? (
            <>
              <dl className="grid gap-x-6 gap-y-2 rounded-lg border border-border bg-muted/40 p-4 text-sm sm:grid-cols-2">
                <Row label="نام" value={`${firstName} ${fatherName}`} />
                <Row label="جنسیت" value={genderLabel(gender)} />
                <Row label="تاریخ تولد" value={formatJalali(birthDate)} />
                <Row label="زادگاه" value={birthPlace || "—"} />
                <Row label="صنف درخواستی" value={grades?.find((g) => g.id === gradeId)?.nameDari ?? "—"} />
                <Row label="شعبهٔ صنف پیشنهادی" value={sections?.find((s) => s.id === sectionId)?.label ?? "تعیین در وخت شمول"} />
                <Row label="ولیٔ اصلی" value={guardians.find((g) => g.isPrimary)?.fullName ?? "—"} />
                <Row label="تماس ولی" value={guardians.find((g) => g.isPrimary)?.phone ?? "—"} ltr />
                <Row label="مکتب قبلی" value={previousSchool || "—"} />
                <Row label="اسناد ارائه‌شده" value={DOC_TYPES.filter(([t]) => docs[t]).map(([, l]) => l).join("، ") || "هیچ"} />
              </dl>

              <div className="space-y-2.5 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800">
                  <AlertTriangle className="h-4 w-4" /> بررسی مضاعف
                </p>
                <label className="flex items-start gap-2 text-xs leading-6 text-amber-900">
                  <Checkbox checked={duplicateAck} onCheckedChange={(v) => setDuplicateAck(Boolean(v))} className="mt-0.5" />
                  معلومات را بررسی کردم و این شاگرد قبلاً در این مکتب ثبت نشده است.
                  سیستم احتمال ثبت مضاعف را هنگام بررسی نشان می‌دهد اما هرگز خودکار ادغام نمی‌کند.
                </label>
                <label className="flex items-start gap-2 text-xs leading-6 text-amber-900">
                  <Checkbox checked={acknowledged} onCheckedChange={(v) => setAcknowledged(Boolean(v))} className="mt-0.5" />
                  صحت معلومات فوق را تایید می‌کنم. پیش‌نویس ذخیره می‌شود و پس از ارائه،
                  قابل ویرایش نیست.
                </label>
              </div>
            </>
          ) : null}

          <div className="flex items-center justify-between border-t border-border pt-4">
            <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              مرحلهٔ قبلی
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!stepValid}>
                مرحلهٔ بعد
              </Button>
            ) : (
              <Button onClick={onSave} disabled={create.isPending || !stepValid}>
                {create.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> در حال ذخیره…
                  </>
                ) : (
                  "ذخیرهٔ پیش‌نویس"
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label} {required ? <span className="text-destructive">*</span> : null}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Row({ label, value, ltr }: { label: string; value: React.ReactNode; ltr?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-1.5">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-end font-medium">{ltr ? <Ltr className="text-xs">{value}</Ltr> : value}</dd>
    </div>
  );
}
