// The application shell: right-side collapsible sidebar, top bar with
// school identity + academic-year context, permission-aware global search,
// notifications, user menu, breadcrumbs. Fully RTL with logical properties.

"use client";

import { Fragment, useMemo, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  Bell, ChevronsLeft, ChevronsRight, ChevronDown, LogOut, Menu, Search,
  KeyRound, School, Clock, GitBranch,
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

/** Longest-prefix match of the active route across all nav items. */
function findActiveNav(activeKey: string) {
  let best: { groupKey: string; itemKey: string; routeLen: number } | null = null;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (activeKey.startsWith(item.route) && (!best || item.route.length > best.routeLen)) {
        best = { groupKey: group.key, itemKey: item.key, routeLen: item.route.length };
      }
    }
  }
  return best;
}

interface FlyoutState {
  groupKey: string;
  top: number;
  /** Viewport x of the rail button's LEFT edge (flyout renders to its left). */
  leftEdge: number;
}

/**
 * Compact accordion sidebar: every module group is a main-menu row that expands
 * to reveal its sub-items. Single-item groups render as direct links. In the
 * collapsed icon-rail mode, hovering a group opens a portal-rendered flyout with
 * its submenu (portals escape the scroll container so nothing gets clipped).
 */
function SidebarNav({
  collapsed,
  activeKey,
  onNavigate,
  onExpandRail,
}: {
  collapsed: boolean;
  activeKey: string;
  onNavigate: (route: string) => void;
  onExpandRail: () => void;
}) {
  const can = useCan();
  const active = useMemo(() => findActiveNav(activeKey), [activeKey]);
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [flyout, setFlyout] = useState<FlyoutState | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeGroupKey = active?.groupKey;

  // Auto-expand the group containing the active route whenever the active
  // group changes (setState during render — the sanctioned "derive from a
  // changing value" pattern; manual collapses are respected until the user
  // moves to a different module). Starts unsynced so the first render opens
  // the active group even on a deep-link/reload.
  const [syncedGroup, setSyncedGroup] = useState<string | undefined>(undefined);
  if (activeGroupKey && activeGroupKey !== syncedGroup) {
    setSyncedGroup(activeGroupKey);
    setOpenGroups((prev) =>
      prev.includes(activeGroupKey) ? prev : [...prev, activeGroupKey],
    );
  }

  function toggleGroup(key: string, open: boolean) {
    setOpenGroups((prev) =>
      open ? (prev.includes(key) ? prev : [...prev, key]) : prev.filter((k) => k !== key),
    );
  }

  function openFlyout(groupKey: string, li: HTMLLIElement) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const r = li.getBoundingClientRect();
    setFlyout({ groupKey, top: r.top, leftEdge: r.left });
  }

  function scheduleCloseFlyout() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setFlyout(null), 140);
  }

  const flyoutGroup = flyout ? NAV_GROUPS.find((g) => g.key === flyout.groupKey) : null;

  return (
    <nav aria-label="ناوبری اصلی" className="flex-1 overflow-y-auto scroll-area-thin px-1.5 py-2">
      <ul className="space-y-0.5">
        {NAV_GROUPS.map((group) => {
          const visible = group.items.filter((it) => !it.permission || can(it.permission));
          if (visible.length === 0) return null;

          const isOpen = openGroups.includes(group.key);
          const groupActive = active?.groupKey === group.key;
          const single = visible.length === 1 ? visible[0] : null;
          const GroupIcon = group.icon;

          // ── Collapsed icon rail: flyout submenu on hover ──
          if (collapsed) {
            return (
              <li
                key={group.key}
                className="relative"
                onMouseEnter={(e) => !single && openFlyout(group.key, e.currentTarget)}
                onMouseLeave={scheduleCloseFlyout}
              >
                <button
                  onClick={() => {
                    if (single) onNavigate(single.route);
                    else {
                      setFlyout(null);
                      toggleGroup(group.key, true);
                      onExpandRail();
                    }
                  }}
                  title={group.label}
                  aria-current={groupActive ? "page" : undefined}
                  className={`transition-soft mx-auto flex h-9 w-9 items-center justify-center rounded-lg ${
                    groupActive
                      ? "bg-primary/10 text-primary shadow-sm shadow-primary/10"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <GroupIcon className="h-[18px] w-[18px]" strokeWidth={2} />
                </button>
              </li>
            );
          }

          // ── Single-item group: direct link ──
          if (single) {
            const itemActive = active?.itemKey === single.key;
            return (
              <li key={group.key}>
                <button
                  onClick={() => onNavigate(single.route)}
                  aria-current={itemActive ? "page" : undefined}
                  className={`transition-soft flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] ${
                    itemActive
                      ? "bg-primary/10 font-bold text-primary"
                      : "text-foreground/75 hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <GroupIcon className="h-[17px] w-[17px] shrink-0" strokeWidth={2} />
                  <span className="truncate">{single.label}</span>
                </button>
              </li>
            );
          }

          // ── Main menu with submenu (accordion) ──
          return (
            <li key={group.key}>
              <Collapsible open={isOpen} onOpenChange={(o) => toggleGroup(group.key, o)}>
                <CollapsibleTrigger asChild>
                  <button
                    className={`transition-soft flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] ${
                      groupActive
                        ? "bg-primary/[0.08] font-bold text-primary"
                        : isOpen
                          ? "font-semibold text-foreground hover:bg-muted"
                          : "text-foreground/75 hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <GroupIcon className="h-[17px] w-[17px] shrink-0" strokeWidth={2} />
                    <span className="min-w-0 flex-1 truncate text-start">{group.label}</span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-200 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                  <ul className="my-1 ms-[17px] me-0.5 space-y-px border-s border-border/80 ps-1.5">
                    {visible.map((item) => {
                      const itemActive = active?.itemKey === item.key;
                      return (
                        <li key={item.key}>
                          <button
                            onClick={() => onNavigate(item.route)}
                            aria-current={itemActive ? "page" : undefined}
                            className={`transition-soft flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12.5px] ${
                              itemActive
                                ? "bg-primary/10 font-bold text-primary"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full transition-soft ${
                                itemActive ? "bg-primary" : "bg-border"
                              }`}
                            />
                            <span className="truncate">{item.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            </li>
          );
        })}
      </ul>

      {/* Icon-rail flyout submenu (portal → never clipped by the scroll area). */}
      {flyout && flyoutGroup
        ? createPortal(
            <div
              dir="rtl"
              className="fixed z-[70] w-56 rounded-xl border border-border bg-popover p-1.5 shadow-2xl shadow-emerald-950/15"
              style={{
                top: Math.min(flyout.top, Math.max(12, window.innerHeight - 260)),
                left: flyout.leftEdge - 10,
                transform: "translateX(-100%)",
              }}
              onMouseEnter={() => closeTimer.current && clearTimeout(closeTimer.current)}
              onMouseLeave={scheduleCloseFlyout}
            >
              <p className="px-2 pb-1 pt-0.5 text-[11px] font-bold text-foreground/70">
                {flyoutGroup.label}
              </p>
              <ul className="space-y-0.5">
                {flyoutGroup.items
                  .filter((it) => !it.permission || can(it.permission))
                  .map((item) => {
                    const itemActive = active?.itemKey === item.key;
                    return (
                      <li key={item.key}>
                        <button
                          onClick={() => {
                            onNavigate(item.route);
                            setFlyout(null);
                          }}
                          className={`transition-soft flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
                            itemActive
                              ? "bg-primary/10 font-bold text-primary"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              itemActive ? "bg-primary" : "bg-border"
                            }`}
                          />
                          <span className="truncate">{item.label}</span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </div>,
            document.body,
          )
        : null}
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
  general_manager: "مدیر عام",
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

// ── Branch context (admin / مدیر عام switch freely; branch users pinned) ──

function BranchContext() {
  const { data: me } = useMe();
  const { data: orgCtx } = useOrgContext();
  const qc = useQueryClient();

  if (!me) return null;

  // Branch-bound user with exactly one branch → fixed badge.
  const single = !me.isCrossBranch && me.ownBranchIds.length === 1;
  const multi = me.isCrossBranch || me.ownBranchIds.length > 1;

  const switchable = multi
    ? me.isCrossBranch
      ? orgCtx?.branches ?? []
      : (orgCtx?.branches ?? []).filter((b) => me.ownBranchIds.includes(b.id))
    : [];

  const activeName =
    orgCtx?.branches.find((b) => b.id === me.branchId)?.name ?? "همه شعبه‌ها";

  async function switchBranch(id: string) {
    window.localStorage.setItem("maktabyar:branch", id);
    // Refetch every query with the new branch context header.
    await qc.invalidateQueries();
  }

  if (switchable.length === 0 && !single) return null;

  return (
    <div className="hidden items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2.5 py-1 md:flex">
      <GitBranch className="h-3.5 w-3.5 text-primary" />
      {multi ? (
        <Select value={me.branchId ?? "all"} onValueChange={switchBranch}>
          <SelectTrigger
            size="sm"
            className="h-6 w-44 gap-1 border-0 bg-transparent px-1 text-xs font-semibold shadow-none focus:ring-0"
            aria-label="انتخاب شعبه"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {me.isCrossBranch ? (
              <SelectItem value="all">همه شعبه‌ها</SelectItem>
            ) : null}
            {switchable.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="max-w-40 truncate text-xs text-muted-foreground">
          {activeName}
        </span>
      )}
      {me.isCrossBranch && !me.branchId ? (
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">نمای کلی</Badge>
      ) : null}
    </div>
  );
}

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
    if (a === "finance") {
      crumbs.push({ label: "امور مالی" });
      const labels: Record<string, string> = {
        fees: "فیس‌ها و تخفیف‌ها", invoices: "فاکتورها", payments: "رسیدهای پرداخت",
        expenses: "مصارف", payroll: "معاشات", reports: "گزارش مالی",
      };
      crumbs.push({ label: labels[b ?? ""] ?? b ?? "" });
    }
    if (crumbs.length === 0) crumbs.push({ label: "مکتب‌یار" });
    return crumbs;
  }, [route]);

  const sidebarContent = (
    <>
      <div
        className={`flex items-center gap-2.5 border-b border-sidebar-border px-2.5 py-2.5 ${
          collapsed ? "justify-center" : ""
        }`}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-600 to-teal-700 text-primary-foreground shadow-sm shadow-emerald-700/25">
          <School className="h-[18px] w-[18px]" strokeWidth={2} />
        </div>
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold leading-tight text-foreground">
              {orgCtx?.org?.name || "مکروسافت مکتب"}
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
        onExpandRail={() => setCollapsed(false)}
      />
      <div className="border-t border-sidebar-border p-1.5">
        <Button
          variant="ghost"
          size="sm"
          className={`transition-soft w-full gap-2 text-muted-foreground ${
            collapsed ? "justify-center px-0" : "justify-start"
          }`}
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "باز کردن نوار کناری" : "بستن نوار کناری"}
          title={collapsed ? "باز کردن نوار کناری" : "بستن نوار کناری"}
        >
          {collapsed ? <ChevronsLeft className="h-4 w-4" /> : <ChevronsRight className="h-4 w-4" />}
          {!collapsed ? "جمع کردن نوار" : null}
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar — right side in RTL, compact rail when collapsed */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-e border-sidebar-border bg-sidebar lg:flex ${
          collapsed ? "w-14" : "w-56"
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
          </div>

          <BranchContext />

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
