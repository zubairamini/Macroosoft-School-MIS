// First-run school setup wizard (admin only, shown when org is unconfigured).
// Steps: identity → branch → academic year → review.

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { School, Building2, CalendarRange, CheckCircle2, Loader2 } from "lucide-react";
import { useSetupSchool, apiErrorMessage } from "@/lib/api/hooks";
import { Stepper, JalaliDateInput, Ltr } from "@/components/shared";

const STEPS = ["شناسایی مکتب", "شعبهٔ مکتب", "سال تعلیمی", "بررسی نهایی"];
const PROVINCES = [
  "کابل", "هرات", "بلخ", "قندهار", "ننگرهار", "کندهار", "بادغیس", "بامیان",
  "بدخشان", "پروان", "لوگر", "غزنی", "کاپیسا", "کنر", "زابل", "سمنگان",
  "سرپل", "سیدفاراه", "تخار", "پکتیا", "پکتیکا", "فراه", "فاریاب", "هلمند",
  "وردک", "جوزجان", "خوست", "دیکندی", "ارزگان", "نیمروز", "نورستان", "پنجشیر",
];

export function SetupWizardView() {
  const setup = useSetupSchool();
  const [step, setStep] = useState(0);

  // Step 1 — identity
  const [name, setName] = useState("");
  const [productName, setProductName] = useState("مکتب‌یار");
  const [schoolType, setSchoolType] = useState<"private" | "public">("private");
  const [province, setProvince] = useState("کابل");
  const [district, setDistrict] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [emisCode, setEmisCode] = useState("");

  // Step 2 — branch
  const [branchName, setBranchName] = useState("");
  const [branchCode, setBranchCode] = useState("MAIN");

  // Step 3 — academic year
  const [yearName, setYearName] = useState("۱۴۰۵");
  const [yearStart, setYearStart] = useState("");
  const [yearEnd, setYearEnd] = useState("");
  const [morningShift, setMorningShift] = useState(true);

  const canNext =
    step === 0
      ? name.trim().length >= 2 && province.length > 0
      : step === 1
        ? branchName.trim().length >= 2 && branchCode.trim().length >= 1
        : step === 2
          ? yearName.trim().length >= 1 && yearStart.length === 10 && yearEnd.length === 10
          : true;

  async function onFinish() {
    try {
      await setup.mutateAsync({
        name: name.trim(),
        productName: productName.trim() || "مکتب‌یار",
        schoolType,
        province,
        district: district.trim() || null,
        address: address.trim() || null,
        phone: phone.trim() || null,
        emisCode: emisCode.trim() || null,
        branchName: branchName.trim(),
        branchCode: branchCode.trim(),
        yearName: yearName.trim(),
        yearStart,
        yearEnd,
        morningShift,
      });
      toast.success("تنظیمات مکتب با موفقیت تکمیل شد.");
      window.location.hash = "#/dashboard";
      window.location.reload();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <School className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold">تنظیمات اولیهٔ مکتب</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          در چند قدم، مکتب خود را در مکتب‌یار ثبت کنید
        </p>
      </div>

      <Stepper steps={STEPS} current={step} onGo={(i) => setStep(i)} />

      <Card className="mt-5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            {step === 0 ? <School className="h-5 w-5 text-primary" /> : null}
            {step === 1 ? <Building2 className="h-5 w-5 text-primary" /> : null}
            {step === 2 ? <CalendarRange className="h-5 w-5 text-primary" /> : null}
            {step === 3 ? <CheckCircle2 className="h-5 w-5 text-primary" /> : null}
            {STEPS[step]}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>نام مکتب *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: مکتب خصوصی روشن" />
                </div>
                <div className="space-y-1.5">
                  <Label>نام محصول</Label>
                  <Input value={productName} onChange={(e) => setProductName(e.target.value)} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>نوعیت مکتب</Label>
                  <Select value={schoolType} onValueChange={(v) => setSchoolType(v as "private" | "public")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="private">خصوصی</SelectItem>
                      <SelectItem value="public">دولتی</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>ولایت *</Label>
                  <Select value={province} onValueChange={setProvince}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      {PROVINCES.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>ناحیه/ولسوالی</Label>
                  <Input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="مثلاً: ناحیهٔ ششم" />
                </div>
                <div className="space-y-1.5">
                  <Label>شمارهٔ تماس</Label>
                  <Input dir="ltr" className="text-start" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+93 70 123 4567" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>نشانی</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="سرک، ناحیه…" />
              </div>
              <div className="space-y-1.5">
                <Label>کد EMIS (اختیاری)</Label>
                <Input dir="ltr" className="text-start" value={emisCode} onChange={(e) => setEmisCode(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  اگر مکتب شما کد EMIS دارد، وارد کنید. این سیستم یک سیستم مستقل است و
                  وابستگی به هیچ سیستم رسمی ندارد.
                </p>
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>نام شعبهٔ مکتب *</Label>
                  <Input value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="مثلاً: شعبهٔ مرکزی" />
                </div>
                <div className="space-y-1.5">
                  <Label>کد شعبه *</Label>
                  <Input dir="ltr" className="text-start" value={branchCode} onChange={(e) => setBranchCode(e.target.value.toUpperCase())} />
                </div>
              </div>
              <p className="rounded-lg border border-border bg-muted/50 p-3 text-xs leading-6 text-muted-foreground">
                <strong>یادداشت:</strong> «شعبهٔ مکتب» به لوکیشن/کمپس مکتب اشاره دارد (مثلاً کارتهٔ نو).
                این با «شعبهٔ صنف» (الف، ب، ج در هر صنف) فرق دارد که بعداً در تنظیمات ثبت می‌شود.
              </p>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div className="space-y-1.5">
                <Label>نام سال تعلیمی *</Label>
                <Input value={yearName} onChange={(e) => setYearName(e.target.value)} placeholder="مثلاً: ۱۴۰۵" />
                <p className="text-xs text-muted-foreground">بر اساس سال شمسی (حمل تا حوت)</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>تاریخ آغاز سال *</Label>
                  <JalaliDateInput value={yearStart} onChange={setYearStart} placeholder="۱۴۰۵/۰۱/۰۱" />
                </div>
                <div className="space-y-1.5">
                  <Label>تاریخ ختم سال *</Label>
                  <JalaliDateInput value={yearEnd} onChange={setYearEnd} placeholder="۱۴۰۶/۰۱/۰۱" />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">ایجاد وخت‌های (شیفت) پیش‌فرض</p>
                  <p className="text-xs text-muted-foreground">صبح ۰۷:۰۰–۱۱:۳۰ و چاشت ۱۲:۰۰–۱۶:۳۰</p>
                </div>
                <Switch checked={morningShift} onCheckedChange={setMorningShift} />
              </div>
              <p className="text-xs text-muted-foreground">
                صنف‌های ۱ تا ۱۲ به‌طور خودکار ایجاد می‌شوند و بعداً قابل ویرایش هستند.
              </p>
            </>
          ) : null}

          {step === 3 ? (
            <dl className="space-y-2 rounded-lg border border-border bg-muted/40 p-4 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">نام مکتب</dt><dd className="font-medium">{name || "—"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">نوعیت</dt><dd className="font-medium">{schoolType === "private" ? "خصوصی" : "دولتی"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">ولایت</dt><dd className="font-medium">{province}{district ? ` — ${district}` : ""}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">شعبهٔ مکتب</dt><dd className="font-medium">{branchName || "—"} <Ltr className="text-xs">({branchCode})</Ltr></dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">سال تعلیمی</dt><dd className="font-medium">{yearName}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">صنف‌ها</dt><dd className="font-medium">۱ تا ۱۲ (خودکار)</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">وخت‌ها</dt><dd className="font-medium">{morningShift ? "صبح و چاشت" : "بدون وخت پیش‌فرض"}</dd></div>
            </dl>
          ) : null}

          <div className="flex items-center justify-between border-t border-border pt-4">
            <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              مرحلهٔ قبلی
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
                مرحلهٔ بعد
              </Button>
            ) : (
              <Button onClick={onFinish} disabled={setup.isPending || !canNext}>
                {setup.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> در حال ذخیره…
                  </>
                ) : (
                  "اتمام تنظیم"
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
