// Staff register — HR/admin view: list, filter, create dialog, detail drawer.
// Permission-aware: staff.view to see, staff.manage to create/edit.

"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, Users, UserPlus, Loader2 } from "lucide-react";
import { useStaff, useCreateStaff, useMe } from "@/lib/api/hooks";
import { StatusBadge, Ltr, EmptyState, NoResultsState, TableSkeleton } from "@/components/shared";
import { faNum, faDate, genderLabel, staffPositionLabel, employmentTypeLabel, staffStatusLabel } from "@/lib/format";
import { hasGrant } from "@/app-shell/shell";
import { JalaliDateInput } from "@/components/shared";

const POSITION_FILTERS = [
  ["", "همهٔ بست‌ها"],
  ["teacher", "استادان"],
  ["admin_staff", "کارمندان اداری"],
  ["support", "خدمات"],
] as const;

const STATUS_FILTERS = [
  ["", "همهٔ وضعیت‌ها"],
  ["active", "فعال"],
  ["inactive", "غیرفعال"],
] as const;

export function StaffView() {
  const { data: me } = useMe();
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [position, setPosition] = useState("");
  const [status, setStatus] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = useStaff({
    q: q || undefined,
    position: position || undefined,
    status: status || undefined,
  });
  const canManage = hasGrant(me, "staff.manage");

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">کادر مکتب</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ثبت‌نامهٔ استادان و کارمندان — {data ? `${faNum(data.length)} نفر` : "…"}
          </p>
        </div>
        {canManage ? (
          <CreateStaffDialog open={createOpen} onOpenChange={setCreateOpen} />
        ) : null}
      </header>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") setQ(qInput); }}
                placeholder="جستجو به نام، نام پدر یا تیلفن…"
                className="ps-9"
              />
            </div>
            <Select value={position || "all"} onValueChange={(v) => setPosition(v === "all" ? "" : v)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {POSITION_FILTERS.map(([value, label]) => (
                  <SelectItem key={value} value={value || "all"}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map(([value, label]) => (
                  <SelectItem key={value} value={value || "all"}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><TableSkeleton rows={6} cols={6} /></div>
          ) : !data || data.length === 0 ? (
            <div className="p-6"><NoResultsState query={q} /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>نام کامل</TableHead>
                    <TableHead>نام پدر</TableHead>
                    <TableHead>بست</TableHead>
                    <TableHead>نوعیت استخدام</TableHead>
                    <TableHead>تیلفن</TableHead>
                    <TableHead>تخصیص‌های تدریس</TableHead>
                    <TableHead>حساب کاربری</TableHead>
                    <TableHead>وضعیت</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.fullName}</TableCell>
                      <TableCell className="text-muted-foreground">{s.fatherName}</TableCell>
                      <TableCell>{staffPositionLabel(s.position)}</TableCell>
                      <TableCell className="text-muted-foreground">{employmentTypeLabel(s.employmentType)}</TableCell>
                      <TableCell>
                        {s.phone ? <Ltr className="text-sm">{s.phone}</Ltr> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {s.position === "teacher" ? faNum(s.teachingAssignmentCount) : "—"}
                      </TableCell>
                      <TableCell>
                        {s.portal ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200">
                            پیوند شده
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">بدون حساب</span>
                        )}
                      </TableCell>
                      <TableCell><StatusBadge status={s.status} label={staffStatusLabel(s.status)} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CreateStaffDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreateStaff();
  const [fullName, setFullName] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [gender, setGender] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState("teacher");
  const [qualification, setQualification] = useState("");
  const [hireDate, setHireDate] = useState("");

  const valid = fullName.trim().length >= 3 && fatherName.trim().length >= 2 && gender && birthDate;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        fullName: fullName.trim(),
        fatherName: fatherName.trim(),
        gender,
        birthDate,
        phone: phone || null,
        position,
        qualification: qualification || null,
        hireDate: hireDate || null,
      });
      toast.success("کارمند جدید ثبت شد.");
      onOpenChange(false);
      setFullName(""); setFatherName(""); setGender(""); setBirthDate("");
      setPhone(""); setQualification(""); setHireDate("");
    } catch (err) {
      toast.error((err as Error).message || "ثبت کارمند ناکام شد.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button><UserPlus className="h-4 w-4" /> ثبت کارمند جدید</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>ثبت کارمند جدید</DialogTitle>
          <DialogDescription>معلومات اساسی کارمند را وارد کنید.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>نام کامل</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="استاد …" required />
            </div>
            <div className="space-y-1.5">
              <Label>نام پدر</Label>
              <Input value={fatherName} onChange={(e) => setFatherName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>جنسیت</Label>
              <Select value={gender || "none"} onValueChange={setGender}>
                <SelectTrigger><SelectValue placeholder="انتخاب…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled>انتخاب…</SelectItem>
                  <SelectItem value="male">مل</SelectItem>
                  <SelectItem value="female">زن</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>تاریخ تولد (شمسی)</Label>
              <JalaliDateInput value={birthDate} onChange={setBirthDate} />
            </div>
            <div className="space-y-1.5">
              <Label>بست</Label>
              <Select value={position} onValueChange={setPosition}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="teacher">استاد</SelectItem>
                  <SelectItem value="admin_staff">کارمند اداری</SelectItem>
                  <SelectItem value="support">کارمند خدمات</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>تیلفن</Label>
              <Input dir="ltr" className="text-start" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+93 7XX XXX XXX" />
            </div>
            <div className="space-y-1.5">
              <Label>تحصیلات</Label>
              <Input value={qualification} onChange={(e) => setQualification(e.target.value)} placeholder="لیسانس …" />
            </div>
            <div className="space-y-1.5">
              <Label>تاریخ استخدام (شمسی)</Label>
              <JalaliDateInput value={hireDate} onChange={setHireDate} />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={!valid || create.isPending}>
            {create.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> در حال ثبت…</> : "ثبت"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
