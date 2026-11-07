// Settings: org profile, users & roles, permission matrix, academic years,
// sections, subjects, module toggles, audit trail, roadmap.

"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  School, Users, ShieldCheck, CalendarRange, LayoutGrid, BookOpen, History,
  Loader2, Plus, KeyRound, CheckCircle2, XCircle, Info, Building2, Pencil, UserCog,
} from "lucide-react";
import {
  useOrgContext, useUpdateOrg, useUsers, useCreateUser, useUpdateUser,
  useAcademicYears, useCreateYear, useSetCurrentYear, useSections, useCreateSection,
  useSubjects, useCreateSubject, useSettings, useUpdateSettings, useGrades,
  useAuditEvents, useMe, apiErrorMessage,
  useBranchesMaster, useCreateBranch, useUpdateBranch,
} from "@/lib/api/hooks";
import { Ltr, TableSkeleton, Pager, JalaliDateInput, StatusBadge } from "@/components/shared";
import { faNum, formatJalali, formatInstantJalaliDateTime } from "@/lib/format";
import { navigate } from "@/app-shell/router";
import { hasGrant } from "@/app-shell/shell";
import { ROLE_MATRIX, ROLE_LABELS_DARI, PERMISSIONS } from "@/server/rbac/permissions";
import type { UserDto } from "@/lib/api/client";

// ── Org profile tab ─────────────────────────────────────────────────────────

function OrgProfileTab() {
  const { data: orgCtx } = useOrgContext();
  const update = useUpdateOrg();
  const [form, setForm] = useState<Record<string, string> | null>(null);

  if (!orgCtx?.org) return <p className="text-sm text-muted-foreground">پروفایل مکتب هنوز تنظیم نشده است.</p>;
  const org = orgCtx.org;
  const f = form ?? {
    name: org.name, productName: org.productName, province: org.province ?? "",
    district: org.district ?? "", address: org.address ?? "", phone: org.phone ?? "",
    email: org.email ?? "", emisCode: org.emisCode ?? "", registrationNumber: org.registrationNumber ?? "",
  };

  async function onSave() {
    try {
      await update.mutateAsync({
        name: f.name, productName: f.productName,
        schoolType: org.schoolType as "public" | "private",
        province: f.province || null, district: f.district || null,
        address: f.address || null, phone: f.phone || null, email: f.email || null,
        emisCode: f.emisCode || null, registrationNumber: f.registrationNumber || null,
        version: org.version,
      });
      toast.success("پروفایل مکتب ذخیره شد.");
      setForm(null);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><School className="h-5 w-5 text-primary" /> پروفایل مکتب</CardTitle>
        <CardDescription>
          نام مکتب، لوگو و سربرگ گزارش‌ها قابل تنظیم است — این سیستم مستقل است و
          وابسته به هیچ سیستم رسمی نیست.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="نام مکتب"><Input value={f.name} onChange={(e) => setForm({ ...f, name: e.target.value })} /></Field>
          <Field label="نام محصول"><Input value={f.productName} onChange={(e) => setForm({ ...f, productName: e.target.value })} /></Field>
          <Field label="نوعیت">
            <Input value={org.schoolType === "private" ? "خصوصی" : "دولتی"} disabled />
          </Field>
          <Field label="ولایت"><Input value={f.province} onChange={(e) => setForm({ ...f, province: e.target.value })} /></Field>
          <Field label="ناحیه/ولسوالی"><Input value={f.district} onChange={(e) => setForm({ ...f, district: e.target.value })} /></Field>
          <Field label="شمارهٔ تماس"><Input dir="ltr" className="text-start" value={f.phone} onChange={(e) => setForm({ ...f, phone: e.target.value })} /></Field>
          <Field label="ایمیل (اختیاری)"><Input dir="ltr" className="text-start" value={f.email} onChange={(e) => setForm({ ...f, email: e.target.value })} /></Field>
          <Field label="کد EMIS (اختیاری)"><Input dir="ltr" className="text-start" value={f.emisCode} onChange={(e) => setForm({ ...f, emisCode: e.target.value })} /></Field>
          <Field label="شمارهٔ ثبت (اختیاری)"><Input dir="ltr" className="text-start" value={f.registrationNumber} onChange={(e) => setForm({ ...f, registrationNumber: e.target.value })} /></Field>
          <Field label="نشانی"><Input value={f.address} onChange={(e) => setForm({ ...f, address: e.target.value })} /></Field>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={onSave} disabled={update.isPending || form === null}>
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} ذخیرهٔ تغییرات
          </Button>
          {form ? <Button variant="ghost" onClick={() => setForm(null)}>واگردانی</Button> : null}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Users tab ───────────────────────────────────────────────────────────────

const ROLE_OPTIONS = Object.entries(ROLE_LABELS_DARI);

// Role → branch requirements for the assignment form.
const CROSS_BRANCH_ROLES: string[] = ["admin", "general_manager"]; // all branches
const NO_BRANCH_ROLES: string[] = ["student", "parent"];           // own / guardian scope
function roleNeedsBranch(roleKey: string): boolean {
  return !CROSS_BRANCH_ROLES.includes(roleKey) && !NO_BRANCH_ROLES.includes(roleKey);
}

/** Sections of one branch (current year), as checkbox options for teachers. */
function SectionCheckboxes({
  sections, branchId, selected, onToggle,
}: {
  sections: Array<{ id: string; label: string; gradeLevel: { nameDari: string }; branch: { id: string } }>;
  branchId: string;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const list = sections.filter((s) => s.branch.id === branchId);
  if (list.length === 0) {
    return <p className="text-xs text-muted-foreground">در این شعبهٔ مکتب شعبهٔ صنفی موجود نیست.</p>;
  }
  return (
    <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-border p-2">
      {list.map((s) => (
        <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-accent">
          <Checkbox
            checked={selected.includes(s.id)}
            onCheckedChange={() => onToggle(s.id)}
          />
          <span>{s.gradeLevel.nameDari} «{s.label}»</span>
        </label>
      ))}
    </div>
  );
}

function UsersTab() {
  const { data: users } = useUsers();
  const create = useCreateUser();
  const update = useUpdateUser();
  const { data: orgCtx } = useOrgContext();
  const { data: branches } = useBranchesMaster();
  const { data: sections } = useSections({ academicYearId: orgCtx?.currentYear?.id });
  const [createOpen, setCreateOpen] = useState(false);
  const [resetFor, setResetFor] = useState<{ id: string; name: string } | null>(null);
  const [roleFor, setRoleFor] = useState<UserDto | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [form, setForm] = useState({
    username: "", fullName: "", password: "", roleKey: "teacher",
    phone: "", branchId: "", sectionIds: [] as string[],
  });

  const needsBranch = roleNeedsBranch(form.roleKey);
  const isTeacher = form.roleKey === "teacher";
  const createValid =
    form.username.trim().length >= 3 &&
    form.fullName.trim().length >= 3 &&
    form.password.length >= 8 &&
    (!needsBranch || form.branchId.length > 0);

  async function onCreate() {
    try {
      await create.mutateAsync({
        username: form.username.trim(),
        fullName: form.fullName.trim(),
        password: form.password,
        roleKey: form.roleKey,
        phone: form.phone.trim() || null,
        branchId: needsBranch ? form.branchId : null,
        sectionIds: isTeacher ? form.sectionIds : [],
      });
      toast.success("کاربر ایجاد شد. کاربر باید در اولین ورود رمز خود را تغییر دهد.");
      setCreateOpen(false);
      setForm({
        username: "", fullName: "", password: "", roleKey: "teacher",
        phone: "", branchId: "", sectionIds: [],
      });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function onReset() {
    if (!resetFor || newPassword.length < 8) return;
    try {
      await update.mutateAsync({ id: resetFor.id, body: { action: "reset-password", password: newPassword } });
      toast.success("رمز بازنشانی شد و نشست‌های کاربر بسته شد.");
      setResetFor(null);
      setNewPassword("");
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function onToggleActive(u: { id: string; isActive: boolean; fullName: string }) {
    try {
      await update.mutateAsync({ id: u.id, body: { action: u.isActive ? "deactivate" : "activate" } });
      toast.success(u.isActive ? "کاربر غیرفعال شد." : "کاربر فعال شد.");
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Users className="h-5 w-5 text-primary" /> کاربران</CardTitle>
            <CardDescription>حساب‌های کاربری با نقش، شعبهٔ مکتب و شعبه‌های تخصیص‌یافته</CardDescription>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> کاربر جدید</Button>
        </div>
      </CardHeader>
      <CardContent>
        {!users ? (
          <TableSkeleton />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-start">نام</TableHead>
                  <TableHead className="text-start">نام کاربری</TableHead>
                  <TableHead className="text-start">نقش و شعبهٔ مکتب</TableHead>
                  <TableHead className="text-start">آخرین ورود</TableHead>
                  <TableHead className="text-start">وضعیت</TableHead>
                  <TableHead className="text-start w-44">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.fullName}</TableCell>
                    <TableCell dir="ltr" className="font-mono text-xs">{u.username}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r, i) => (
                          <Badge key={i} variant="secondary">
                            {ROLE_LABELS_DARI[r.roleKey as keyof typeof ROLE_LABELS_DARI] ?? r.roleKey}
                            {r.branchName ? ` · ${r.branchName}` : ""}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.lastLoginAt ? formatInstantJalaliDateTime(u.lastLoginAt) : "—"}
                    </TableCell>
                    <TableCell>
                      {u.isActive ? (
                        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">فعال</Badge>
                      ) : (
                        <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">غیرفعال</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" title="تغییر نقش" onClick={() => setRoleFor(u)}>
                          <UserCog className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" title="بازنشانی رمز" onClick={() => setResetFor({ id: u.id, name: u.fullName })}>
                          <KeyRound className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" title={u.isActive ? "غیرفعال کردن" : "فعال کردن"} onClick={() => onToggleActive(u)}>
                          {u.isActive ? <XCircle className="h-3.5 w-3.5 text-destructive" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Create user — compact two-column form (Phase 6 UX fix) */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent dir="rtl" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>کاربر جدید</DialogTitle>
            <DialogDescription>
              نقش و شعبهٔ مکتب را مشخص کنید — اجازه‌ها در سرور اعمال می‌شود.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="نام کامل *">
              <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </Field>
            <Field label="نام کاربری * (لاتین)" hint="مثلاً: ahmad.teacher">
              <Input dir="ltr" className="text-start" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </Field>
            <Field label="رمز اولیه *" hint="حداقل ۸ حرف با عدد">
              <Input dir="ltr" className="text-start" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <Field label="شمارهٔ تماس">
              <Input dir="ltr" className="text-start" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+93 …" />
            </Field>
            <Field label="نقش *">
              <Select value={form.roleKey} onValueChange={(v) => setForm({ ...form, roleKey: v, sectionIds: [] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {ROLE_OPTIONS.map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {needsBranch ? (
              <Field label="شعبهٔ مکتب *">
                <Select value={form.branchId} onValueChange={(v) => setForm({ ...form, branchId: v, sectionIds: [] })}>
                  <SelectTrigger><SelectValue placeholder="انتخاب شعبهٔ مکتب" /></SelectTrigger>
                  <SelectContent>
                    {(branches ?? []).map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <Field label="شعبهٔ مکتب">
                <Input value={CROSS_BRANCH_ROLES.includes(form.roleKey) ? "همهٔ شعبه‌ها" : "لازم نیست"} disabled />
              </Field>
            )}
            {isTeacher && form.branchId ? (
              <div className="sm:col-span-2 space-y-1.5">
                <Label>شعبه‌های تخصیص‌یافته (اختیاری — برای ثبت حاضری و نمره)</Label>
                <SectionCheckboxes
                  sections={sections ?? []}
                  branchId={form.branchId}
                  selected={form.sectionIds}
                  onToggle={(id) =>
                    setForm({
                      ...form,
                      sectionIds: form.sectionIds.includes(id)
                        ? form.sectionIds.filter((x) => x !== id)
                        : [...form.sectionIds, id],
                    })
                  }
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>لغو</Button>
            <Button onClick={onCreate} disabled={create.isPending || !createValid}>
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} ایجاد کاربر
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password */}
      <Dialog open={resetFor !== null} onOpenChange={(o) => { if (!o) { setResetFor(null); setNewPassword(""); } }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>بازنشانی رمز — {resetFor?.name}</DialogTitle>
            <DialogDescription>همهٔ نشست‌های فعال این کاربر بسته می‌شود. عملیات در ریکارود نظارتی ثبت می‌گردد.</DialogDescription>
          </DialogHeader>
          <Field label="رمز جدید (حداقل ۸ حرف با عدد)">
            <Input dir="ltr" className="text-start" type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResetFor(null); setNewPassword(""); }}>لغو</Button>
            <Button onClick={onReset} disabled={newPassword.length < 8 || update.isPending}>بازنشانی</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change role / branch (action: assign-role replaces assignments) */}
      {roleFor ? (
        <ChangeRoleDialog
          user={roleFor}
          branches={branches ?? []}
          sections={sections ?? []}
          onClose={() => setRoleFor(null)}
        />
      ) : null}
    </Card>
  );
}

function ChangeRoleDialog({
  user, branches, sections, onClose,
}: {
  user: UserDto;
  branches: Array<{ id: string; name: string }>;
  sections: Array<{ id: string; label: string; gradeLevel: { nameDari: string }; branch: { id: string } }>;
  onClose: () => void;
}) {
  const update = useUpdateUser();
  const current = user.roles[0];
  const [roleKey, setRoleKey] = useState<string>(current?.roleKey ?? "teacher");
  const [branchId, setBranchId] = useState<string>(current?.branchName
    ? (branches.find((b) => b.name === current.branchName)?.id ?? "")
    : "");
  const [sectionIds, setSectionIds] = useState<string[]>(current?.sectionIds ?? []);

  const needsBranch = roleNeedsBranch(roleKey);
  const valid = !needsBranch || branchId.length > 0;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>تغییر نقش — {user.fullName}</DialogTitle>
          <DialogDescription>
            نقش فعلی جایگزین می‌شود و تغییر در ریکارود نظارتی ثبت می‌گردد.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="نقش *">
            <Select value={roleKey} onValueChange={(v) => { setRoleKey(v); setSectionIds([]); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-64">
                {ROLE_OPTIONS.map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {needsBranch ? (
            <Field label="شعبهٔ مکتب *">
              <Select value={branchId} onValueChange={(v) => { setBranchId(v); setSectionIds([]); }}>
                <SelectTrigger><SelectValue placeholder="انتخاب شعبهٔ مکتب" /></SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <Field label="شعبهٔ مکتب">
              <Input value={CROSS_BRANCH_ROLES.includes(roleKey) ? "همهٔ شعبه‌ها" : "لازم نیست"} disabled />
            </Field>
          )}
          {roleKey === "teacher" && branchId ? (
            <div className="sm:col-span-2 space-y-1.5">
              <Label>شعبه‌های تخصیص‌یافته (اختیاری)</Label>
              <SectionCheckboxes
                sections={sections}
                branchId={branchId}
                selected={sectionIds}
                onToggle={(id) =>
                  setSectionIds((prev) =>
                    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                  )
                }
              />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>لغو</Button>
          <Button
            disabled={!valid || update.isPending}
            onClick={async () => {
              try {
                await update.mutateAsync({
                  id: user.id,
                  body: {
                    action: "assign-role",
                    roleKey,
                    branchId: needsBranch ? branchId : null,
                    sectionIds: roleKey === "teacher" ? sectionIds : [],
                  },
                });
                toast.success("نقش کاربر تغییر کرد.");
                onClose();
              } catch (err) {
                toast.error(apiErrorMessage(err));
              }
            }}
          >
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} ذخیرهٔ نقش
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Branches (school campuses) master data — Phase 6 ────────────────────────

function BranchesTab() {
  const { data: me } = useMe();
  const canManage = hasGrant(me, "branches.manage");
  const { data: branches, isLoading } = useBranchesMaster();
  const create = useCreateBranch();
  const update = useUpdateBranch();
  const [createOpen, setCreateOpen] = useState(false);
  const [editFor, setEditFor] = useState<{ id: string; name: string; code: string; province: string; district: string; address: string; phone: string; isActive: boolean } | null>(null);

  async function onToggleActive(b: { id: string; name: string; isActive: boolean }) {
    try {
      await update.mutateAsync({ id: b.id, body: { isActive: !b.isActive } });
      toast.success(b.isActive ? `شعبهٔ «${b.name}» غیرفعال شد.` : `شعبهٔ «${b.name}» فعال شد.`);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-5 w-5 text-primary" /> شعبه‌های مکتب</CardTitle>
            <CardDescription>
              داده‌های پایهٔ شعبه‌های مکتب (کمپس‌ها) — ایجاد و ویرایش فقط برای مدیر سیستم و مدیر عام.
            </CardDescription>
          </div>
          {canManage ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> شعبهٔ جدید</Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading || !branches ? (
          <TableSkeleton rows={3} cols={6} />
        ) : branches.length === 0 ? (
          <p className="text-sm text-muted-foreground">هنوز شعبهٔ مکتب ثبت نشده است.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-start">نام شعبه</TableHead>
                  <TableHead className="text-start">کد</TableHead>
                  <TableHead className="text-start">ولایت / ناحیه</TableHead>
                  <TableHead className="text-start">تماس</TableHead>
                  <TableHead className="text-start">شعبه‌های صنف</TableHead>
                  <TableHead className="text-start">شاگردان فعال</TableHead>
                  <TableHead className="text-start">وضعیت</TableHead>
                  {canManage ? <TableHead className="text-start w-28">عملیات</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.map((b) => (
                  <TableRow key={b.id} className={b.isActive ? "" : "opacity-60"}>
                    <TableCell className="font-medium">
                      {b.name}
                      {b.address ? <p className="text-xs text-muted-foreground">{b.address}</p> : null}
                    </TableCell>
                    <TableCell dir="ltr" className="font-mono text-xs">{b.code}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {[b.province, b.district].filter(Boolean).join(" / ") || "—"}
                    </TableCell>
                    <TableCell dir="ltr" className="text-start text-xs text-muted-foreground">{b.phone ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{faNum(b.sectionCount)}</TableCell>
                    <TableCell className="tabular-nums">{faNum(b.activeStudents)}</TableCell>
                    <TableCell>
                      {b.isActive ? (
                        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">فعال</Badge>
                      ) : (
                        <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">غیرفعال</Badge>
                      )}
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" title="ویرایش" onClick={() => setEditFor({
                            id: b.id, name: b.name, code: b.code,
                            province: b.province ?? "", district: b.district ?? "",
                            address: b.address ?? "", phone: b.phone ?? "", isActive: b.isActive,
                          })}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title={b.isActive ? "غیرفعال کردن" : "فعال کردن"}
                            disabled={update.isPending}
                            onClick={() => onToggleActive(b)}
                          >
                            {b.isActive ? <XCircle className="h-3.5 w-3.5 text-destructive" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {createOpen ? (
        <BranchFormDialog
          title="شعبهٔ جدید مکتب"
          initial={{ name: "", code: "", province: "", district: "", address: "", phone: "", isActive: true }}
          pending={create.isPending}
          onClose={() => setCreateOpen(false)}
          onSubmit={async (f) => {
            await create.mutateAsync({
              name: f.name, code: f.code,
              province: f.province || null, district: f.district || null,
              address: f.address || null, phone: f.phone || null,
              isActive: f.isActive,
            });
          }}
        />
      ) : null}

      {editFor ? (
        <BranchFormDialog
          title={`ویرایش شعبه — ${editFor.name}`}
          initial={editFor}
          pending={update.isPending}
          showCode={false}
          onClose={() => setEditFor(null)}
          onSubmit={async (f) => {
            await update.mutateAsync({
              id: editFor.id,
              body: {
                name: f.name,
                province: f.province || null, district: f.district || null,
                address: f.address || null, phone: f.phone || null,
                isActive: f.isActive,
              },
            });
          }}
        />
      ) : null}
    </Card>
  );
}

function BranchFormDialog({
  title, initial, pending, showCode = true, onClose, onSubmit,
}: {
  title: string;
  initial: { name: string; code: string; province: string; district: string; address: string; phone: string; isActive: boolean };
  pending: boolean;
  showCode?: boolean;
  onClose: () => void;
  onSubmit: (f: { name: string; code: string; province: string; district: string; address: string; phone: string; isActive: boolean }) => Promise<void>;
}) {
  const [f, setF] = useState(initial);
  const valid = f.name.trim().length >= 2 && (!showCode || f.code.trim().length >= 1);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>داده‌های پایهٔ شعبهٔ مکتب — تغییرها در ریکارود نظارتی ثبت می‌شود.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="نام شعبه *">
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="مثلاً: کارتهٔ نو" />
          </Field>
          <Field label="کد شعبه *">
            <Input dir="ltr" className="text-start" value={f.code} disabled={!showCode} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="مثلاً: KRT-01" />
          </Field>
          <Field label="ولایت">
            <Input value={f.province} onChange={(e) => setF({ ...f, province: e.target.value })} placeholder="کابل" />
          </Field>
          <Field label="ناحیه/ولسوالی">
            <Input value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })} />
          </Field>
          <Field label="شمارهٔ تماس">
            <Input dir="ltr" className="text-start" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+93 …" />
          </Field>
          <Field label="نشانی">
            <Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
          </Field>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Switch checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} id="branch-active" />
            <Label htmlFor="branch-active">شعبهٔ فعال</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>لغو</Button>
          <Button
            disabled={!valid || pending}
            onClick={async () => {
              try {
                await onSubmit({
                  name: f.name.trim(), code: f.code.trim(),
                  province: f.province.trim(), district: f.district.trim(),
                  address: f.address.trim(), phone: f.phone.trim(), isActive: f.isActive,
                });
                toast.success("داده‌های شعبهٔ مکتب ذخیره شد.");
                onClose();
              } catch (err) {
                toast.error(apiErrorMessage(err));
              }
            }}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} ذخیره
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Permission matrix tab ───────────────────────────────────────────────────

const SCOPE_LABELS: Record<string, string> = {
  all: "همهٔ مکتب",
  branch: "شعبهٔ مکتب",
  year: "سال تعلیمی",
  section: "شعبه‌های تخصیص‌یافته",
  own: "رکورد خود",
  guardian: "فرزندان پیوند‌شده",
};

function RolesTab() {
  const roles = Object.keys(ROLE_MATRIX) as Array<keyof typeof ROLE_MATRIX>;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-5 w-5 text-primary" /> نقش‌ها و اجازه‌ها</CardTitle>
        <CardDescription>
          ماتریس اجازه‌های پیش‌فرض. پنهان‌کردن منو جایگزین اجازه نیست — هر نقطهٔ API
          همین ماتریس را در سرور اعمال می‌کند.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-start">اجازه</TableHead>
              {roles.map((r) => (
                <TableHead key={r} className="text-center text-xs">{ROLE_LABELS_DARI[r]}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {PERMISSIONS.map((p) => (
              <TableRow key={p}>
                <TableCell className="font-mono text-xs" dir="ltr">{p}</TableCell>
                {roles.map((r) => {
                  const grant = ROLE_MATRIX[r].find((g) => g.permission === p);
                  return (
                    <TableCell key={r} className="text-center">
                      {grant ? (
                        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700" title={SCOPE_LABELS[grant.scope]}>
                          {SCOPE_LABELS[grant.scope]}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-3 text-xs leading-6 text-muted-foreground">
          <Info className="inline h-3.5 w-3.5" /> حیطه‌ها با تخصیص نقش به هر کاربر محدودتر
          می‌شوند (شعبهٔ مشخص، سال مشخص، شعبه‌های صنف مشخص). مثلاً استاد فقط شاگردان
          شعبه‌های تخصیص‌یافتهٔ خود را می‌بیند و ولی فقط فرزندان پیوند‌شدهٔ خود را.
        </p>
      </CardContent>
    </Card>
  );
}

// ── Academic years tab ──────────────────────────────────────────────────────

function YearsTab() {
  const { data: years } = useAcademicYears();
  const create = useCreateYear();
  const setCurrent = useSetCurrentYear();
  const [form, setForm] = useState({ name: "", start: "", end: "" });
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><CalendarRange className="h-5 w-5 text-primary" /> سال‌های تعلیمی</CardTitle>
            <CardDescription>مرزهای سال تعلیمی قابل تنظیم است — با تقویم شمسی</CardDescription>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> سال جدید</Button>
        </div>
      </CardHeader>
      <CardContent>
        {!years ? <TableSkeleton rows={3} cols={4} /> : (
          <ul className="space-y-2">
            {years.map((y) => (
              <li key={y.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                <div>
                  <p className="font-semibold">
                    سال {y.name} {y.isCurrent ? <Badge className="ms-1">جاری</Badge> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatJalali(y.startDate)} تا {formatJalali(y.endDate)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={y.status} label={y.status === "active" ? "فعال" : y.status === "planned" ? "پلان‌شده" : "بسته"} />
                  {!y.isCurrent && y.status !== "closed" ? (
                    <Button size="sm" variant="outline" onClick={() => setCurrent.mutate(y.id)} disabled={setCurrent.isPending}>
                      فعال کردن
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>سال تعلیمی جدید</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Field label="نام سال * (شمسی)"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="۱۴۰۶" /></Field>
            <Field label="تاریخ آغاز *"><JalaliDateInput value={form.start} onChange={(v) => setForm({ ...form, start: v })} placeholder="۱۴۰۶/۰۱/۰۱" /></Field>
            <Field label="تاریخ ختم *"><JalaliDateInput value={form.end} onChange={(v) => setForm({ ...form, end: v })} placeholder="۱۴۰۷/۰۱/۰۱" /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>لغو</Button>
            <Button
              disabled={create.isPending || form.name.length < 2 || form.start.length !== 10 || form.end.length !== 10}
              onClick={async () => {
                try {
                  await create.mutateAsync({ name: form.name, startDate: form.start, endDate: form.end, isCurrent: false });
                  toast.success("سال تعلیمی ایجاد شد.");
                  setOpen(false);
                  setForm({ name: "", start: "", end: "" });
                } catch (err) {
                  toast.error(apiErrorMessage(err));
                }
              }}
            >
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} ایجاد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Sections tab ────────────────────────────────────────────────────────────

function SectionsTab() {
  const { data: orgCtx } = useOrgContext();
  const { data: sections } = useSections({ academicYearId: orgCtx?.currentYear?.id });
  const { data: grades } = useGrades();
  const create = useCreateSection();
  const [form, setForm] = useState({ gradeLevelId: "", label: "", capacity: "30", roomName: "", branchId: "", shiftId: "" });
  const [open, setOpen] = useState(false);

  const byGrade = new Map<string, NonNullable<typeof sections>>();
  (sections ?? []).forEach((s) => {
    const key = s.gradeLevel.nameDari;
    byGrade.set(key, [...(byGrade.get(key) ?? []), s]);
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><LayoutGrid className="h-5 w-5 text-primary" /> شعبه‌های صنف</CardTitle>
            <CardDescription>
              «شعبهٔ صنف» (الف، ب…) داخل هر صنف — با «شعبهٔ مکتب» (کمپس) فرق دارد.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> شعبهٔ جدید</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!sections ? <TableSkeleton rows={4} cols={4} /> : (
          [...byGrade.entries()].map(([gradeName, list]) => (
            <div key={gradeName}>
              <p className="mb-1.5 text-sm font-semibold">{gradeName}</p>
              <div className="flex flex-wrap gap-2">
                {list.map((s) => (
                  <div key={s.id} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
                    <span className="font-semibold">شعبهٔ {s.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {" "}· {faNum(s._count.enrollments)}/{faNum(s.capacity)}
                      {s.roomName ? ` · ${s.roomName}` : ""}
                      {s.shift ? ` · ${s.shift.name}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>شعبهٔ صنف جدید</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Field label="صنف *">
              <Select value={form.gradeLevelId} onValueChange={(v) => setForm({ ...form, gradeLevelId: v })}>
                <SelectTrigger><SelectValue placeholder="صنف…" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {(grades ?? []).map((g) => <SelectItem key={g.id} value={g.id}>{g.nameDari}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="شعبهٔ مکتب *" hint="کمپس/لوکیشن — با شعبهٔ صنف فرق دارد">
              <Select value={form.branchId} onValueChange={(v) => setForm({ ...form, branchId: v })}>
                <SelectTrigger><SelectValue placeholder="شعبهٔ مکتب…" /></SelectTrigger>
                <SelectContent>
                  {(orgCtx?.branches ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="وخت (اختیاری)">
              <Select value={form.shiftId || "none"} onValueChange={(v) => setForm({ ...form, shiftId: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="انتخاب…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون وخت</SelectItem>
                  {(orgCtx?.shifts ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="نام شعبه *"><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="الف / ب / ج" /></Field>
            <Field label="ظرفیت *"><Input dir="ltr" className="text-start" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" /></Field>
            <Field label="نام اتاق"><Input value={form.roomName} onChange={(e) => setForm({ ...form, roomName: e.target.value })} placeholder="اتاق ۵۱" /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>لغو</Button>
            <Button
              disabled={create.isPending || !form.gradeLevelId || form.label.length < 1 || !form.branchId || Number(form.capacity) < 1}
              onClick={async () => {
                try {
                  await create.mutateAsync({
                    academicYearId: orgCtx?.currentYear?.id ?? "",
                    gradeLevelId: form.gradeLevelId,
                    branchId: form.branchId,
                    shiftId: form.shiftId || null,
                    label: form.label,
                    capacity: Number(form.capacity),
                    roomName: form.roomName || null,
                  });
                  toast.success("شعبهٔ صنف ایجاد شد.");
                  setOpen(false);
                  setForm({ gradeLevelId: "", label: "", capacity: "30", roomName: "", branchId: "", shiftId: "" });
                } catch (err) {
                  toast.error(apiErrorMessage(err));
                }
              }}
            >
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} ایجاد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Subjects tab ────────────────────────────────────────────────────────────

function SubjectsTab() {
  const { data: subjects } = useSubjects();
  const create = useCreateSubject();
  const [form, setForm] = useState({ nameDari: "", code: "" });
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><BookOpen className="h-5 w-5 text-primary" /> مضامین</CardTitle>
            <CardDescription>
              مضامین قابل تنظیم‌اند و به‌عنوان برنامهٔ رسمی وزارت ادعا نمی‌شوند.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> مضمون جدید</Button>
        </div>
      </CardHeader>
      <CardContent>
        {!subjects ? <TableSkeleton rows={4} cols={2} /> : (
          <div className="flex flex-wrap gap-2">
            {subjects.map((s) => (
              <Badge key={s.id} variant="outline" className="px-3 py-1.5 text-sm">
                {s.nameDari} <Ltr className="ms-1 text-[10px] text-muted-foreground">{s.code}</Ltr>
              </Badge>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader><DialogTitle>مضمون جدید</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Field label="نام مضمون *"><Input value={form.nameDari} onChange={(e) => setForm({ ...form, nameDari: e.target.value })} /></Field>
            <Field label="کد * (لاتین)"><Input dir="ltr" className="text-start" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>لغو</Button>
            <Button
              disabled={create.isPending || form.nameDari.length < 2 || form.code.length < 1}
              onClick={async () => {
                try {
                  await create.mutateAsync({ nameDari: form.nameDari, code: form.code, grades: [], isActive: true });
                  toast.success("مضمون ایجاد شد.");
                  setOpen(false);
                  setForm({ nameDari: "", code: "" });
                } catch (err) {
                  toast.error(apiErrorMessage(err));
                }
              }}
            >
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} ایجاد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Modules tab ─────────────────────────────────────────────────────────────

const MODULE_LABELS: Record<string, string> = {
  fees: "فیس و وصولی‌ها",
  accounting: "حسابداری",
  payroll: "معاشات",
  library: "کتابخانه",
  textbooks: "کتاب‌های درسی",
  transport: "ترانسپورت",
  inventory: "انبار و جنس‌ها",
  hr: "منابع بشری",
  communications: "ارتباطات و اعلانات",
  portals: "پورتال شاگرد و ولی",
};

function ModulesTab() {
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const [local, setLocal] = useState<Record<string, boolean> | null>(null);

  if (!settings) return <TableSkeleton rows={4} cols={2} />;
  const current = local ?? settings.modules;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><LayoutGrid className="h-5 w-5 text-primary" /> بخش‌های سیستم</CardTitle>
        <CardDescription>
          بخش‌های غیرضروری (از جمله فیس برای مکتب‌های دولتی) قابل غیرفعال‌شدن است.
          معلومات موجود حذف نمی‌شود.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(MODULE_LABELS).map(([key, label]) => (
            <label key={key} className="transition-soft flex items-center justify-between gap-3 rounded-lg border border-border p-3 hover:border-primary/40">
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">
                  {current[key] ? "فعال" : "غیرفعال"}
                </p>
              </div>
              <Switch checked={Boolean(current[key])} onCheckedChange={(v) => setLocal({ ...current, [key]: v })} />
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <Button
            disabled={update.isPending || local === null}
            onClick={async () => {
              try {
                await update.mutateAsync({ modules: current });
                toast.success("تنظیمات بخش‌ها ذخیره شد.");
                setLocal(null);
              } catch (err) {
                toast.error(apiErrorMessage(err));
              }
            }}
          >
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} ذخیره
          </Button>
          {local ? <Button variant="ghost" onClick={() => setLocal(null)}>واگردانی</Button> : null}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Audit tab ───────────────────────────────────────────────────────────────

function AuditTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAuditEvents({ page });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><History className="h-5 w-5 text-primary" /> ریکارود نظارتی</CardTitle>
        <CardDescription>هر تغییر با انسان، عمل، مورد، وخت و دلیل — بدون رمز و توکن</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <TableSkeleton rows={8} cols={4} />
        ) : data.items.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">رویدادی ثبت نشده است.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-start">وخت</TableHead>
                    <TableHead className="text-start">انجام‌دهنده</TableHead>
                    <TableHead className="text-start">عمل</TableHead>
                    <TableHead className="text-start">مورد</TableHead>
                    <TableHead className="text-start">دلیل</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs text-muted-foreground">{formatInstantJalaliDateTime(e.at)}</TableCell>
                      <TableCell className="text-sm">{e.actorName}</TableCell>
                      <TableCell dir="ltr" className="font-mono text-xs">{e.action}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.entity}</TableCell>
                      <TableCell className="max-w-48 truncate text-xs">{e.reason ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="pt-3">
              <Pager page={data.meta.page} pageSize={data.meta.pageSize} total={data.meta.total} onPage={setPage} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Field helper ────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

// ── Main settings view ──────────────────────────────────────────────────────

export function SettingsView({ tab }: { tab: string }) {
  const { data: me } = useMe();
  const canUsers = hasGrant(me, "users.view");
  const canManage = hasGrant(me, "settings.manage");
  const canAudit = hasGrant(me, "audit.view");
  const canAcademic = hasGrant(me, "academic.view");

  const validTab = ["org", "users", "roles", "years", "sections", "branches", "subjects", "modules", "audit"].includes(tab) ? tab : "org";

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">تنظیمات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          پروفایل مکتب، کاربران، اجازه‌ها و ساختار تعلیمی
        </p>
      </header>

      <Tabs value={validTab} dir="rtl" onValueChange={(v) => navigate(`/settings/${v}`)}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="org">پروفایل مکتب</TabsTrigger>
          {canUsers ? <TabsTrigger value="users">کاربران</TabsTrigger> : null}
          <TabsTrigger value="roles">نقش‌ها و اجازه‌ها</TabsTrigger>
          {canAcademic ? <TabsTrigger value="years">سال‌های تعلیمی</TabsTrigger> : null}
          {canAcademic ? <TabsTrigger value="branches">شعبه‌های مکتب</TabsTrigger> : null}
          {canAcademic ? <TabsTrigger value="sections">شعبه‌های صنف</TabsTrigger> : null}
          {canAcademic ? <TabsTrigger value="subjects">مضامین</TabsTrigger> : null}
          <TabsTrigger value="modules" disabled={!canManage} title={canManage ? undefined : "نیازمند اجازهٔ settings.manage"}>بخش‌ها</TabsTrigger>
          {canAudit ? <TabsTrigger value="audit">ریکارود نظارتی</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="org" className="mt-4"><OrgProfileTab /></TabsContent>
        <TabsContent value="users" className="mt-4">{canUsers ? <UsersTab /> : null}</TabsContent>
        <TabsContent value="roles" className="mt-4"><RolesTab /></TabsContent>
        <TabsContent value="years" className="mt-4">{canAcademic ? <YearsTab /> : null}</TabsContent>
        <TabsContent value="branches" className="mt-4">{canAcademic ? <BranchesTab /> : null}</TabsContent>
        <TabsContent value="sections" className="mt-4">{canAcademic ? <SectionsTab /> : null}</TabsContent>
        <TabsContent value="subjects" className="mt-4">{canAcademic ? <SubjectsTab /> : null}</TabsContent>
        <TabsContent value="modules" className="mt-4"><ModulesTab /></TabsContent>
        <TabsContent value="audit" className="mt-4">{canAudit ? <AuditTab /> : null}</TabsContent>
      </Tabs>
    </div>
  );
}
