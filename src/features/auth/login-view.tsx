// Login screen — Dari, RTL, with demo account hints (synthetic data only).

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { School, KeyRound, User, Loader2, Info } from "lucide-react";
import { useLogin, apiErrorMessage } from "@/lib/api/hooks";
import { Ltr } from "@/components/shared";

const DEMO_ACCOUNTS: Array<[string, string, string]> = [
  ["admin", "Admin1234", "مدیر سیستم"],
  ["registrar", "Registrar1234", "مسجل (شمولیت)"],
  ["manager", "Manager1234", "مدیر مکتب"],
  ["teacher", "Teacher1234", "استاد"],
  ["walikhal", "Parent1234", "ولی (دو فرزند)"],
  ["finance", "Finance1234", "مسئول مالی"],
];

export function LoginView() {
  const login = useLogin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-background to-slate-100 p-4">
      <div className="w-full max-w-4xl">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Brand panel */}
          <div className="hidden flex-col justify-center lg:flex">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <School className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">مکتب‌یار</h1>
                <p className="text-sm text-muted-foreground">نظام مدیریت معلومات مکتب</p>
              </div>
            </div>
            <p className="max-w-md leading-7 text-muted-foreground">
              نظام مدیریت مکتب برای افغانستان — به زبان دری، راست‌چین و با تقویم شمسی.
              شمولیت شاگردان، مدیریت صنف‌ها، حاضری، نتایج و امور مالی، همه در یک سیستم
              امن و قابل‌فهم.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" /> رابط کامل دری و راست‌چین
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" /> تقویم شمسی و ماه‌های افغانی
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" /> اجازه‌های دقیق بر اساس نقش
              </li>
            </ul>
          </div>

          {/* Login form */}
          <Card className="border-border shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl">ورود به مکتب‌یار</CardTitle>
              <CardDescription>نام کاربری و رمز خود را وارد کنید</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="username">نام کاربری</Label>
                  <div className="relative">
                    <User className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="username"
                      dir="ltr"
                      className="ps-9 text-start"
                      placeholder="نام کاربری"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">رمز</Label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="password"
                      dir="ltr"
                      type="password"
                      className="ps-9 text-start"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                  </div>
                </div>
                {login.isError ? (
                  <p className="rounded-md border border-destructive/30 bg-red-50 px-3 py-2 text-sm text-destructive">
                    {apiErrorMessage(login.error)}
                  </p>
                ) : null}
                <Button type="submit" className="w-full" disabled={login.isPending}>
                  {login.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> در حال ورود…
                    </>
                  ) : (
                    "ورود"
                  )}
                </Button>
              </form>

              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                  <Info className="h-3.5 w-3.5" /> حساب‌های نمایشی (داده‌های مصنوعی)
                </p>
                <div className="grid gap-1">
                  {DEMO_ACCOUNTS.map(([u, p, role]) => (
                    <button
                      key={u}
                      type="button"
                      className="transition-soft flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs hover:bg-amber-100/70"
                      onClick={() => {
                        setUsername(u);
                        setPassword(p);
                      }}
                    >
                      <span className="font-medium text-amber-900">{role}</span>
                      <Ltr className="text-[11px] text-amber-800/80">{u} / {p}</Ltr>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
