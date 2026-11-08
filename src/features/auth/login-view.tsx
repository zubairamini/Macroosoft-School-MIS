// Login screen — modern split-panel design for مکروسافت مکتب.
// Dark emerald brand panel with drifting aurora orbs + blueprint grid,
// glass form card, animated entrance, and one-tap demo accounts.

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  School, KeyRound, User, Loader2, Eye, EyeOff, ShieldCheck,
  CalendarCheck, LayoutDashboard, Wallet, Sparkles, LockKeyhole, Languages,
} from "lucide-react";
import { useLogin, apiErrorMessage } from "@/lib/api/hooks";
import { Ltr } from "@/components/shared";

const SCHOOL_NAME = "مکروسافت مکتب";

const DEMO_ACCOUNTS: Array<{ user: string; pass: string; role: string }> = [
  { user: "admin", pass: "Admin1234", role: "مدیر سیستم" },
  { user: "manager", pass: "Manager1234", role: "مدیر مکتب" },
  { user: "registrar", pass: "Registrar1234", role: "مسجل شمولیت" },
  { user: "teacher", pass: "Teacher1234", role: "استاد" },
  { user: "finance", pass: "Finance1234", role: "مسئول مالی" },
  { user: "walikhal", pass: "Parent1234", role: "ولی شاگرد" },
];

const HERO_FEATURES = [
  {
    icon: CalendarCheck,
    title: "شمولیت و ثبت‌نام دیجیتال",
    text: "درخواست، بررسی و ثبت شاگردان در چند دقیقه",
  },
  {
    icon: LayoutDashboard,
    title: "حاضری، نتایج و کارت‌ها",
    text: "از ثبت حاضری تا چاپ کارت شناسایی شاگرد",
  },
  {
    icon: Wallet,
    title: "امور مالی شفاف",
    text: "فیس‌ها، فاکتورها، رسیدها و گزارش‌های لحظه‌ای",
  },
];

export function LoginView() {
  const login = useLogin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pickedRole, setPickedRole] = useState<string | null>(null);

  function pickDemo(user: string, pass: string) {
    setUsername(user);
    setPassword(pass);
    setPickedRole(user);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    try {
      await login.mutateAsync({ username: username.trim(), password });
      window.location.hash = "#/dashboard";
      window.location.reload();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div className="grid min-h-screen bg-[#f4f8f6] lg:grid-cols-[1.05fr_1fr]">
      {/* ── Brand panel (right side in RTL) ─────────────────────────────── */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-bl from-[#04150f] via-[#06281d] to-[#0b3d2c] p-10 text-white lg:flex xl:p-14">
        {/* Aurora orbs */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="login-drift-a absolute -top-24 -start-24 h-96 w-96 rounded-full bg-emerald-400/25 blur-3xl" />
          <div className="login-drift-b absolute bottom-[-6rem] start-1/3 h-80 w-80 rounded-full bg-teal-300/20 blur-3xl" />
          <div className="login-drift-a absolute top-1/3 end-[-5rem] h-72 w-72 rounded-full bg-amber-400/10 blur-3xl" />
          <div className="login-grid absolute inset-0 opacity-70" />
          {/* Soft vignette to keep text legible */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgb(2_12_8/0.55))]" />
        </div>

        {/* Brand header */}
        <div className="login-fade-up relative z-10 flex items-center gap-4">
          <div className="login-float flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white/10 shadow-lg shadow-emerald-950/40 backdrop-blur-md">
            <School className="h-7 w-7 text-emerald-200" strokeWidth={1.8} />
          </div>
          <div>
            <p className="text-lg font-extrabold leading-tight tracking-tight">
              {SCHOOL_NAME}
            </p>
            <p className="text-xs text-emerald-200/70">نظام مدیریت معلومات مکتب</p>
          </div>
          <span className="ms-auto flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-100 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" /> نسخهٔ نمایشی
          </span>
        </div>

        {/* Hero copy + feature cards */}
        <div className="relative z-10">
          <h1 className="login-fade-up max-w-xl text-4xl font-extrabold leading-[1.25] tracking-tight xl:text-[2.75rem] xl:leading-[1.3]">
            آموزش بهتر،
            <span className="bg-gradient-to-l from-emerald-300 via-white to-teal-200 bg-clip-text text-transparent">
              {" "}مدیریت آسان‌تر
            </span>
          </h1>
          <p className="login-fade-up mt-4 max-w-md text-sm leading-7 text-emerald-100/85 [animation-delay:120ms]">
            {SCHOOL_NAME} — نظام یکپارچهٔ مدیریت مکتب به زبان دری و راست‌چین:
            شمولیت شاگردان، صنف‌ها و مضامین، حاضری، نتایج امتحانات و امور مالی،
            همه در یک محیط امن.
          </p>

          <div className="mt-8 space-y-3">
            {HERO_FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="login-fade-up group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-md transition-soft hover:border-emerald-300/30 hover:bg-white/[0.1]"
                style={{ animationDelay: `${200 + i * 120}ms` }}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400/30 to-teal-300/20 text-emerald-200 transition-soft group-hover:scale-105">
                  <f.icon className="h-5 w-5" strokeWidth={1.9} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold">{f.title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-emerald-100/65">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer stats */}
        <div className="relative z-10 flex items-center gap-6 border-t border-white/10 pt-5 text-xs text-emerald-100/75">
          <span className="flex items-center gap-1.5">
            <Languages className="h-3.5 w-3.5" /> ۱۰۰٪ دری و راست‌چین
          </span>
          <span className="flex items-center gap-1.5">
            <CalendarCheck className="h-3.5 w-3.5" /> تقویم شمسی
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> اجازه‌های مبتنی بر نقش
          </span>
        </div>
      </div>

      {/* ── Login form panel ────────────────────────────────────────────── */}
      <div className="relative flex items-center justify-center overflow-hidden px-5 py-10 sm:px-8">
        {/* Ambient background */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -end-32 h-96 w-96 rounded-full bg-emerald-100/70 blur-3xl" />
          <div className="absolute bottom-[-8rem] -start-24 h-80 w-80 rounded-full bg-teal-50 blur-3xl" />
        </div>

        <div className="login-fade-up relative z-10 w-full max-w-md">
          {/* Mobile brand (hero panel hidden on small screens) */}
          <div className="mb-7 flex flex-col items-center text-center lg:hidden">
            <div className="login-pulse-ring mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-lg shadow-emerald-600/30">
              <School className="h-8 w-8" strokeWidth={1.8} />
            </div>
            <p className="text-xl font-extrabold tracking-tight text-foreground">{SCHOOL_NAME}</p>
            <p className="mt-1 text-xs text-muted-foreground">نظام مدیریت معلومات مکتب</p>
          </div>

          <div className="rounded-3xl border border-white/60 bg-white/80 p-7 shadow-xl shadow-emerald-900/[0.07] backdrop-blur-xl sm:p-9">
            {/* Desktop heading */}
            <div className="mb-6 hidden items-center gap-3 lg:flex">
              <div className="login-pulse-ring flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-lg shadow-emerald-600/25">
                <School className="h-6 w-6" strokeWidth={1.9} />
              </div>
              <div>
                <h2 className="text-lg font-extrabold tracking-tight text-foreground">
                  خوش آمدید
                </h2>
                <p className="text-xs text-muted-foreground">ورود به حساب کاربری {SCHOOL_NAME}</p>
              </div>
            </div>

            <h2 className="mb-1 text-xl font-extrabold tracking-tight text-foreground lg:hidden">
              ورود به حساب
            </h2>
            <p className="mb-6 text-sm text-muted-foreground lg:mb-0">
              نام کاربری و رمز خود را وارد کنید
            </p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-[13px] font-semibold text-foreground/80">
                  نام کاربری
                </Label>
                <div className="group/input relative">
                  <User className="pointer-events-none absolute start-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground/60 transition-soft group-focus-within/input:text-primary" />
                  <Input
                    id="username"
                    dir="ltr"
                    className="h-11 rounded-xl border-border/70 bg-white/70 ps-11 text-start shadow-sm transition-soft placeholder:text-muted-foreground/50 focus:border-primary/60 focus:bg-white focus:ring-4 focus:ring-primary/10"
                    placeholder="نام کاربری خود را وارد کنید"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setPickedRole(null);
                    }}
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-[13px] font-semibold text-foreground/80">
                    رمز عبور
                  </Label>
                </div>
                <div className="group/input relative">
                  <KeyRound className="pointer-events-none absolute start-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground/60 transition-soft group-focus-within/input:text-primary" />
                  <Input
                    id="password"
                    dir="ltr"
                    type={showPassword ? "text" : "password"}
                    className="h-11 rounded-xl border-border/70 bg-white/70 ps-11 pe-11 text-start shadow-sm transition-soft placeholder:text-muted-foreground/50 focus:border-primary/60 focus:bg-white focus:ring-4 focus:ring-primary/10"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPickedRole(null);
                    }}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "پنهان کردن رمز" : "نمایش رمز"}
                    className="absolute end-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground/60 transition-soft hover:bg-muted hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                  </button>
                </div>
              </div>

              {login.isError ? (
                <p className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-red-50 px-3.5 py-2.5 text-sm text-destructive">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  {apiErrorMessage(login.error)}
                </p>
              ) : null}

              <Button
                type="submit"
                disabled={login.isPending}
                className="btn-shine h-12 w-full rounded-xl bg-gradient-to-l from-emerald-700 via-emerald-600 to-teal-600 text-[15px] font-bold shadow-lg shadow-emerald-600/25 transition-soft hover:shadow-xl hover:shadow-emerald-600/30 hover:brightness-105 active:scale-[0.99]"
              >
                {login.isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" /> در حال ورود…
                  </>
                ) : (
                  <>
                    ورود امن <LockKeyhole className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            {/* Demo accounts */}
            <div className="mt-7">
              <div className="mb-3 flex items-center gap-3 text-[11px] font-semibold text-muted-foreground">
                <span className="h-px flex-1 bg-border/70" />
                حساب‌های نمایشی — یک کلیک
                <span className="h-px flex-1 bg-border/70" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {DEMO_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.user}
                    type="button"
                    onClick={() => pickDemo(acc.user, acc.pass)}
                    className={`transition-soft group rounded-xl border px-3 py-2.5 text-start ${
                      pickedRole === acc.user
                        ? "border-primary/50 bg-primary/[0.06] shadow-sm ring-1 ring-primary/20"
                        : "border-border/60 bg-white/60 hover:border-primary/35 hover:bg-white hover:shadow-sm"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-1">
                      <span className="truncate text-[12.5px] font-bold text-foreground/85 group-hover:text-primary">
                        {acc.role}
                      </span>
                      <User className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                    </span>
                    <Ltr className="mt-0.5 block w-full truncate text-[10.5px] text-muted-foreground/70">
                      {acc.user}
                    </Ltr>
                  </button>
                ))}
              </div>
            </div>

            <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[11px] leading-5 text-muted-foreground/70">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600/70" />
              اتصال امن · داده‌های مصنوعی · {SCHOOL_NAME}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
