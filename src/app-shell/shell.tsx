// The application shell: right-side collapsible sidebar, top bar with
// school identity + academic-year context, permission-aware global search,
// notifications, user menu, breadcrumbs. Fully RTL with logical properties.

"use client";

import { Fragment, useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Bell, ChevronsLeft, ChevronsRight, LogOut, Menu, PanelRightClose, Search,
  Settings2, UserCog, KeyRound, School, MapPin, Clock,
} from "lucide-react";
import { useMe, useLogout, useOrgContext, useGlobalSearch, useNotifications, useMarkNotificationsRead, useChangePassword } from "@/lib/api/hooks";
import type { MeResponse } from "@/lib/api/client";
import { NAV_GROUPS } from "./nav-config";
import { useRoute, navigate } from "./router";
import { Ltr } from "@/components/shared";
import { formatInstantJalaliDateTime, initialsOf } from "@/lib/format";
import { apiErrorMessage } from "@/lib/api/hooks";

// ── Permission helper (view-layer convenience only) ─────────────────────────

export function useCan(): (permission: string) => boolean {
  const { data: me } = useMe();
  return useMemo(() => {
    const grants = me?.grants ?? [];
    return (permission: string) => grants.some((g) => g.permission === permission);
  }, [me]);
}

export function hasGrant(me: MeResponse | undefined, permission: string): boolean {
  return (me?.grants ?? []).some((g) => g.permission === permission);
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

function SidebarNav({
  collapsed,
  activeKey,
  onNavigate,
}: {
  collapsed: boolean;
  activeKey: string;
  onNavigate: (route: string) => void;
}) {
  const can = useCan();
  return (
    <nav aria-label="ناوبری اصلی" className="flex-1 overflow-y-auto scroll-area-thin px-2 py-3">
      {NAV_GROUPS.map((group) => {
        const visible = group.items.filter((it) => !it.permission || can(it.permission));
        if (visible.length === 0) return null;
        return (
          <div key={group.key} className="mb-3">
            {!collapsed ? (
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                {group.label}
              </p>
            ) : (
              <Separator className="mx-2 my-2" />
            )}
            <ul className="space-y-0.5">
              {visible.map((item) => {
                const Icon = item.icon;
                const active = activeKey.startsWith(item.route);
                return (
                  <li key={item.key}>
                    <button
                      onClick={() => onNavigate(item.route)}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={`transition-soft flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-sm ${
                        active
                          ? "border-primary/30 bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                          : "border-transparent text-sidebar-foreground hover:bg-muted"
                      } ${collapsed ? "justify-center" : ""}`}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
                      {!collapsed ? (
                        <span className="flex min-w-0 flex-1 items-center justify-between gap-1">
                          <span className="truncate">{item.label}</span>
                          {!item.implemented ? (
                            <Badge variant="outline" className="shrink-0 border-amber-200 bg-amber-50 px-1 py-0 text-[10px] text-amber-700">
                              بعدی
                            </Badge>
                          ) : null}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

// ── Global search ───────────────────────────────────────────────────────────

function GlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const { data: hits, isFetching } = useGlobalSearch(q);
  const can = useCan();

  if (!can("search.use")) return null;

  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder="جستجو — شاگرد، درخواست، کاربر…"
        className="bg-card ps-9"
        aria-label="جستجوی سراسری"
      />
      {open && q.trim().length >= 2 ? (
        <div className="absolute inset-x-0 top-full z-50 mt-1 rounded-lg border border-border bg-popover shadow-lg">
          {isFetching ? (
            <p className="p-3 text-sm text-muted-foreground">در حال جستجو…</p>
          ) : (hits ?? []).length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">نتیجه‌ای پیدا نشد.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto scroll-area-thin p-1">
              {(hits ?? []).map((hit) => (
                <li key={`${hit.kind}-${hit.id}`}>
                  <button
                    className="transition-soft flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-start hover:bg-muted"
                    onClick={() => {
                      navigate(hit.route);
                      setOpen(false);
                      setQ("");
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{hit.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{hit.subtitle}</span>
                    </span>
                    <Badge variant="outline" className="shrink-0">
                      {hit.kind === "student" ? "شاگرد" : hit.kind === "application" ? "درخواست" : "کاربر"}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── Notifications ───────────────────────────────────────────────────────────

function NotificationsBell() {
  const { data: notifications } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const unread = (notifications ?? []).filter((n) => !n.isRead).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="اعلانات">
          <Bell className="h-5 w-5" />
          {unread > 0 ? (
            <span className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
              {unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border p-3">
          <p className="text-sm font-semibold">اعلانات</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => markRead.mutate(undefined)}
            disabled={unread === 0}
          >
            علامت‌گذاری همه به‌عنوان خوانده‌شده
          </Button>
        </div>
        <ScrollArea className="max-h-80">
          {(notifications ?? []).length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">اعلانی موجود نیست.</p>
          ) : (
            <ul className="divide-y divide-border">
              {(notifications ?? []).map((n) => (
                <li key={n.id} className={`p-3 ${n.isRead ? "opacity-70" : ""}`}>
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground/70">
                    {formatInstantJalaliDateTime(n.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

// ── User menu ───────────────────────────────────────────────────────────────

function UserMenu({ me }: { me: MeResponse }) {
  const logout = useLogout();
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const changePassword = useChangePassword();

  async function doLogout() {
    await logout.mutateAsync();
    toast.success("با موفقیت خارج شدید.");
    navigate("/dashboard");
    window.location.reload();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="transition-soft flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 hover:border-primary/50"
            aria-label="منوی کاربر"
          >
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                {initialsOf(me.user.fullName)}
              </AvatarFallback>
            </Avatar>
            <span className="hidden max-w-36 truncate text-sm font-medium md:block">
              {me.user.fullName}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>
            <p className="text-sm font-semibold">{me.user.fullName}</p>
            <p className="text-xs text-muted-foreground">
              <Ltr className="text-[11px]">{me.user.username}</Ltr>
            </p>
            {me.roles.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {me.roles.slice(0, 3).map((r) => (
                  <Badge key={r} variant="secondary" className="text-[10px]">
                    {ROLE_LABELS[r] ?? r}
                  </Badge>
                ))}
              </div>
            ) : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowChangePassword(true)}>
            <KeyRound className="h-4 w-4" /> تغییر رمز
          </DropdownMenuItem>
          <DropdownMenuItem onClick={doLogout}>
            <LogOut className="h-4 w-4" /> خارج شدن
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {showChangePassword ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
            <h3 className="mb-1 text-base font-bold">تغییر رمز</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              پس از تغییر رمز، همهٔ نشست‌های دیگر بسته می‌شوند.
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm">رمز فعلی</label>
                <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} dir="ltr" />
              </div>
              <div>
                <label className="mb-1 block text-sm">رمز جدید (حداقل ۸ حرف با عدد)</label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} dir="ltr" />
              </div>
              {changePassword.isError ? (
                <p className="text-sm text-destructive">{apiErrorMessage(changePassword.error)}</p>
              ) : null}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setShowChangePassword(false)}>لغو</Button>
                <Button
                  disabled={changePassword.isPending || !currentPassword || newPassword.length < 8}
                  onClick={async () => {
                    try {
                      await changePassword.mutateAsync({ currentPassword, newPassword });
                      toast.success("رمز با موفقیت تغییر کرد.");
                      setShowChangePassword(false);
                      setCurrentPassword("");
                      setNewPassword("");
                    } catch (err) {
                      toast.error(apiErrorMessage(err));
                    }
                  }}
                >
                  {changePassword.isPending ? "در حال ذخیره…" : "ذخیره"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

const ROLE_LABELS: Record<string, string> = {
  admin: "مدیر سیستم",
  manager: "مدیر مکتب",
  academic_manager: "مدیر تعلیمی",
  registrar: "مسجل",
  finance_officer: "مسئول مالی",
  cashier: "صندوقدار",
  teacher: "استاد",
  librarian: "کتاب‌دار",
  hr_officer: "مسئول منابع بشری",
  student: "شاگرد",
  parent: "ولی",
  auditor: "بازرس",
};

// ── Shell ───────────────────────────────────────────────────────────────────

export function Shell({ children }: { children: React.ReactNode }) {
  const { data: me } = useMe();
  const { data: orgCtx } = useOrgContext();
  const route = useRoute();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeKey = `/${route.segments.join("/")}`;

  // Track recently viewed students for the sidebar footer.
  useEffect(() => {
    if (route.segments[0] === "students" && route.segments[1]) {
      try {
        const key = "maktabyar:recent-students";
        const raw = JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
        const next = [route.segments[1], ...raw.filter((x) => x !== route.segments[1])].slice(0, 5);
        localStorage.setItem(key, JSON.stringify(next));
      } catch { /* noop */ }
    }
  }, [route]);

  const breadcrumbs = useMemo(() => {
    const crumbs: Array<{ label: string; route?: string }> = [];
    const [a, b] = route.segments;
    if (a === "dashboard") crumbs.push({ label: "صفحهٔ اصلی" });
    if (a === "students") {
      crumbs.push({ label: "شاگردان و شمولیت" }, b ? { label: "شاگردان", route: "/students" } : { label: "شاگردان" });
      if (b && b !== "new") crumbs.push({ label: "پروفایل شاگرد" });
    }
    if (a === "admissions") {
      crumbs.push({ label: "شاگردان و شمولیت" }, b ? { label: "شمولیت‌ها", route: "/admissions" } : { label: "شمولیت‌ها" });
      if (b === "new") crumbs.push({ label: "درخواست جدید" });
      else if (b) crumbs.push({ label: "جزئیات درخواست" });
    }
    if (a === "settings") {
      crumbs.push({ label: "تنظیمات" });
      const tab = b ?? "org";
      const labels: Record<string, string> = {
        org: "پروفایل مکتب", users: "کاربران", roles: "نقش‌ها و اجازه‌ها",
        modules: "بخش‌ها", years: "سال‌های تعلیمی", sections: "شعبه‌های صنف",
        subjects: "مضامین", audit: "ریکارود نظارتی",
      };
      crumbs.push({ label: labels[tab] ?? tab });
    }
    if (a === "roadmap") crumbs.push({ label: "بخش‌های آینده" });
    if (crumbs.length === 0) crumbs.push({ label: "مکتب‌یار" });
    return crumbs;
  }, [route]);

  const sidebarContent = (
    <>
      <div className={`flex items-center gap-2.5 border-b border-sidebar-border px-3 py-3 ${collapsed ? "justify-center" : ""}`}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <School className="h-5 w-5" />
        </div>
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight text-foreground">
              {orgCtx?.org?.name || "مکتب‌یار"}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {orgCtx?.org?.productName || "نظام مدیریت مکتب"}
            </p>
          </div>
        ) : null}
      </div>
      <SidebarNav
        collapsed={collapsed}
        activeKey={activeKey}
        onNavigate={(r) => {
          navigate(r);
          setMobileOpen(false);
        }}
      />
      <div className="border-t border-sidebar-border p-2">
        <Button
          variant="ghost"
          size="sm"
          className={`transition-soft w-full justify-start gap-2 text-muted-foreground ${collapsed ? "justify-center px-0" : ""}`}
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "باز کردن نوار کناری" : "بستن نوار کناری"}
        >
          {collapsed ? <ChevronsLeft className="h-4 w-4" /> : <ChevronsRight className="h-4 w-4" />}
          {!collapsed ? "جمع کردن نوار" : null}
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar — right side in RTL */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-e border-sidebar-border bg-sidebar lg:flex ${
          collapsed ? "w-16" : "w-64"
        } transition-[width] duration-200`}
      >
        {sidebarContent}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-40 flex flex-wrap items-center gap-2 border-b border-border bg-card/95 px-3 py-2 backdrop-blur md:px-5">
          {/* Mobile drawer */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="lg:hidden" aria-label="منو">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-0">
              <SheetTitle className="sr-only">ناوبری</SheetTitle>
              <div className="flex h-full flex-col">{sidebarContent}</div>
            </SheetContent>
          </Sheet>

          {/* Academic-year + branch context */}
          <div className="hidden items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2.5 py-1 md:flex">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold">
              سال تعلیمی {orgCtx?.currentYear?.name ?? "—"}
            </span>
            <Separator orientation="vertical" className="mx-1 h-4" />
            <MapPin className="h-3.5 w-3.5 text-primary" />
            <span className="max-w-40 truncate text-xs text-muted-foreground">
              {orgCtx?.branches.find((b) => b.id === me?.branchId)?.name ?? "—"}
            </span>
          </div>

          <div className="order-last w-full md:order-none md:flex-1 md:w-auto">
            <GlobalSearch />
          </div>

          <div className="ms-auto flex items-center gap-1.5">
            <NotificationsBell />
            {me ? <UserMenu me={me} /> : null}
          </div>
        </header>

        {/* Breadcrumbs + page area */}
        <div className="mx-auto w-full max-w-7xl flex-1 px-3 py-4 md:px-6 md:py-6">
          <Breadcrumb className="mb-3">
            <BreadcrumbList>
              {breadcrumbs.map((crumb, i) => (
                <Fragment key={i}>
                  {i > 0 ? <BreadcrumbSeparator /> : null}
                  <BreadcrumbItem>
                    {crumb.route ? (
                      <BreadcrumbLink asChild>
                        <button onClick={() => navigate(crumb.route!)}>{crumb.label}</button>
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
          {children}
        </div>

        <footer className="mt-auto border-t border-border bg-card px-4 py-3">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {orgCtx?.org?.productName ?? "مکتب‌یار"} — {orgCtx?.org?.name ?? ""}
              {orgCtx?.org?.province ? ` · ${orgCtx.org.province}` : ""}
            </span>
            <span>
              نسخهٔ نمایشی — داده‌های مصنوعی · {(orgCtx?.currentYear?.name && `سال تعلیمی ${orgCtx.currentYear.name}`) || ""}
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
