// Discipline & behavior register — Phase 7 (انضباط و رفتار).
// Full CRUD: filter, record, follow up (resolve) and delete incidents and
// merits. Branch isolation is server-side; teachers see their own students.

"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Plus, ShieldAlert, Pencil, Trash2, CheckCircle2 } from "lucide-react";
import {
  useMe, useStudents, useDisciplineIncidents, useCreateDisciplineIncident,
  useUpdateDisciplineIncident, useDeleteDisciplineIncident, apiErrorMessage,
} from "@/lib/api/hooks";
import { EmptyState, NoResultsState, TableSkeleton, Ltr, JalaliDateInput } from "@/components/shared";
import { faNum, faDate, formatInstantJalaliDateTime } from "@/lib/format";
import { hasGrant } from "@/app-shell/shell";
import type { DisciplineIncidentDto } from "@/lib/api/client";

// Dari labels (kept client-side; the server module owns the canonical enums).
const KIND_LABELS: Record<string, string> = {
  late: "تأخیر",
  absent: "غیبت",
  misconduct: "بدرفتاری",
  damage: "خرابی عمدی",
  fight: "زد و خورد",
  dress: "عدم رعایت لباس مکتبی",
  other: "سایر",
  merit: "اقدام مثبت",
};
const SEVERITY_LABELS: Record<string, string> = { low: "کم", medium: "متوسط", high: "زیاد" };
const SEVERITY_BADGE: Record<string, string> = {
  low: "border-slate-200 bg-slate-50 text-slate-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-red-200 bg-red-50 text-red-700",
};
const ACTION_LABELS: Record<string, string> = {
  none: "—",
  counseling: "مشوره",
  parent_notified: "اطلاع به ولی",
  warning: "تنبیه کتبی",
  suspension: "محرومیت موقت",
};
const KIND_OPTIONS = Object.keys(KIND_LABELS);
const SEVERITY_OPTIONS = Object.keys(SEVERITY_LABELS);
const ACTION_OPTIONS = Object.keys(ACTION_LABELS);

function KindBadge({ kind }: { kind: string }) {
  const isMerit = kind === "merit";
  return (
    <Badge variant="outline" className={
      isMerit
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : kind === "late" || kind === "absent"
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-orange-200 bg-orange-50 text-orange-700"
    }>
      {KIND_LABELS[kind] ?? kind}
    </Badge>
  );
}

export function DisciplineView() {
  const { data: me } = useMe();
  const canManage = hasGrant(me, "discipline.manage");

  const [kind, setKind] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [resolved, setResolved] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: incidents, isLoading } = useDisciplineIncidents({
    kind: kind === "all" ? undefined : kind,
    severity: severity === "all" ? undefined : severity,
    resolved: resolved === "all" ? undefined : resolved,
    from: from || undefined,
    to: to || undefined,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editFor, setEditFor] = useState<DisciplineIncidentDto | null>(null);
  const [deleteFor, setDeleteFor] = useState<DisciplineIncidentDto | null>(null);

  const openCount = (incidents ?? []).filter((i) => i.resolvedAt === null && i.kind !== "merit").length;
  const meritCount = (incidents ?? []).filter((i) => i.kind === "merit").length;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">انضباط و رفتار</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ریکارد وقایع انضباطی و اقدامات مثبت شاگردان — محدود به شعبهٔ فعال شما.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {incidents ? (
            <>
              <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
                {faNum(openCount)} مورد حل‌نشده
              </Badge>
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                {faNum(meritCount)} اقدام مثبت
              </Badge>
            </>
          ) : null}
          {canManage ? (
            <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> ثبت ریکارد جدید</Button>
          ) : null}
        </div>
      </header>

      {/* Filters */}
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همهٔ انواع</SelectItem>
                {KIND_OPTIONS.map((k) => (
                  <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همهٔ شدت‌ها</SelectItem>
                {SEVERITY_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{SEVERITY_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={resolved} onValueChange={setResolved}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همهٔ وضعیت‌ها</SelectItem>
                <SelectItem value="false">حل‌نشده</SelectItem>
                <SelectItem value="true">حل‌شده</SelectItem>
              </SelectContent>
            </Select>
            <div className="w-36"><JalaliDateInput value={from} onChange={setFrom} placeholder="از تاریخ…" /></div>
            <div className="w-36"><JalaliDateInput value={to} onChange={setTo} placeholder="تا تاریخ…" /></div>
            {(kind !== "all" || severity !== "all" || resolved !== "all" || from || to) ? (
              <Button variant="ghost" size="sm" onClick={() => { setKind("all"); setSeverity("all"); setResolved("all"); setFrom(""); setTo(""); }}>
                پاک‌کردن صافی‌ها
              </Button>
            ) : null}
          </div>

          {isLoading ? (
            <div className="p-4"><TableSkeleton rows={6} cols={6} /></div>
          ) : (incidents ?? []).length === 0 ? (
            <div className="p-6">
              <EmptyState icon={ShieldAlert} title="ریکاردی موجود نیست" body="با ثبت ریکارد جدید، وقایع انضباطی و اقدامات مثبت شاگردان را دنبال کنید." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>شاگرد</TableHead>
                    <TableHead>تاریخ</TableHead>
                    <TableHead>نوع</TableHead>
                    <TableHead>شدت</TableHead>
                    <TableHead className="min-w-56">توضیح</TableHead>
                    <TableHead>اقدام</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>ثبت‌کننده</TableHead>
                    {canManage ? <TableHead className="w-28">عملیات</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(incidents ?? []).map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        <p className="font-medium">{i.firstName}</p>
                        <p className="text-xs text-muted-foreground">
                          ولد: {i.fatherName} · <Ltr className="text-xs">{i.studentNumber}</Ltr>
                        </p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{faDate(i.date)}</TableCell>
                      <TableCell><KindBadge kind={i.kind} /></TableCell>
                      <TableCell>
                        <Badge variant="outline" className={SEVERITY_BADGE[i.severity]}>
                          {SEVERITY_LABELS[i.severity] ?? i.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {i.description}
                        {i.followUpNote ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">پیگیری: {i.followUpNote}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {ACTION_LABELS[i.actionTaken] ?? i.actionTaken}
                      </TableCell>
                      <TableCell>
                        {i.resolvedAt ? (
                          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">حل‌شده</Badge>
                        ) : i.kind === "merit" ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">حل‌نشده</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{i.recorderName}</TableCell>
                      {canManage ? (
                        <TableCell>
                          <div className="flex gap-1">
                            {i.resolvedAt === null && i.kind !== "merit" ? (
                              <Button size="sm" variant="ghost" title="علامت‌گذاری به‌عنوان حل‌شده"
                                onClick={() => setEditFor(i)}>
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              </Button>
                            ) : (
                              <Button size="sm" variant="ghost" title="ویرایش" onClick={() => setEditFor(i)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" title="حذف" onClick={() => setDeleteFor(i)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
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
          {incidents && incidents.length === 0 ? null : null}
        </CardContent>
      </Card>

      {createOpen ? (
        <IncidentFormDialog
          onClose={() => setCreateOpen(false)}
        />
      ) : null}

      {editFor ? (
        <IncidentFormDialog
          incident={editFor}
          onClose={() => setEditFor(null)}
        />
      ) : null}

      {deleteFor ? (
        <Dialog open onOpenChange={(v) => { if (!v) setDeleteFor(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>حذف ریکارد انضباط</DialogTitle>
              <DialogDescription>
                ریکارد {deleteFor.firstName} — {faDate(deleteFor.date)} ({KIND_LABELS[deleteFor.kind] ?? deleteFor.kind})
                حذف می‌شود. عملیات در ریکارود نظارتی با تمام جزئیات ثبت می‌گردد.
              </DialogDescription>
            </DialogHeader>
            <DeleteButton incident={deleteFor} onDone={() => setDeleteFor(null)} />
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

function DeleteButton({ incident, onDone }: { incident: DisciplineIncidentDto; onDone: () => void }) {
  const del = useDeleteDisciplineIncident();
  return (
    <Button
      variant="destructive"
      className="w-full"
      disabled={del.isPending}
      onClick={async () => {
        try {
          await del.mutateAsync({ id: incident.id });
          toast.success("ریکارد انضباط حذف شد.");
          onDone();
        } catch (err) {
          toast.error(apiErrorMessage(err));
        }
      }}
    >
      {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      حذف قطعی
    </Button>
  );
}

/** Create dialog (no `incident`) and edit/resolve dialog (with `incident`). */
function IncidentFormDialog({
  incident, onClose,
}: {
  incident?: DisciplineIncidentDto;
  onClose: () => void;
}) {
  const create = useCreateDisciplineIncident();
  const update = useUpdateDisciplineIncident();
  const editing = incident !== undefined;

  const [studentQuery, setStudentQuery] = useState("");
  const [studentId, setStudentId] = useState("");
  const { data: students } = useStudents({ q: studentQuery || undefined, pageSize: 10 });

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [kind, setKind] = useState("late");
  const [severity, setSeverity] = useState("low");
  const [description, setDescription] = useState("");
  const [actionTaken, setActionTaken] = useState("none");
  const [followUpNote, setFollowUpNote] = useState("");
  const [isResolved, setIsResolved] = useState(false);

  // Prefill from the incident being edited.
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  if (incident && prefilledFor !== incident.id) {
    setDate(incident.date);
    setKind(incident.kind);
    setSeverity(incident.severity);
    setDescription(incident.description);
    setActionTaken(incident.actionTaken);
    setFollowUpNote(incident.followUpNote ?? "");
    setIsResolved(incident.resolvedAt !== null);
    setPrefilledFor(incident.id);
  }

  const valid = editing
    ? description.trim().length >= 3
    : studentId.length > 0 && description.trim().length >= 3;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `ویرایش ریکارد — ${incident?.firstName}` : "ثبت ریکارد انضباط / اقدام مثبت"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "تغییرها و راه‌حل نهایی در ریکارود نظارتی ثبت می‌شود."
              : "شاگرد باید در شعبهٔ فعال شما (یا برای استاد، در شعبهٔ صنف تخصیص‌یافته) شمولیت فعال داشته باشد."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {!editing ? (
            <>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>شاگرد *</Label>
                <Input
                  value={studentQuery}
                  onChange={(e) => setStudentQuery(e.target.value)}
                  placeholder="جستجوی نام یا شمارهٔ شاگرد…"
                />
                <Select value={studentId || "none"} onValueChange={(v) => setStudentId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="یک شاگرد انتخاب کنید" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— انتخاب شاگرد —</SelectItem>
                    {(students?.items ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.personal.firstName ?? "—"} {s.personal.fatherName ?? ""} ({s.studentNumber})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>تاریخ *</Label>
                <JalaliDateInput value={date} onChange={setDate} placeholder="۱۴۰۵/۰۹/۱۵" />
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label>تاریخ</Label>
              <JalaliDateInput value={date} onChange={setDate} placeholder="۱۴۰۵/۰۹/۱۵" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>نوع *</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {KIND_OPTIONS.map((k) => (
                  <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>شدت</Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SEVERITY_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{SEVERITY_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>اقدام اتخاذشده</Label>
            <Select value={actionTaken} onValueChange={setActionTaken}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTION_OPTIONS.map((a) => (
                  <SelectItem key={a} value={a}>{ACTION_LABELS[a]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>توضیح *</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="مثلاً: سه روز پیوسته با تأخیر به صنف آمد." />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>یادداشت پیگیری (اختیاری)</Label>
            <Textarea value={followUpNote} onChange={(e) => setFollowUpNote(e.target.value)} rows={2} placeholder="مثلاً: با ولی تلفنی صحبت شد؛ بهبود وعده داده شد." />
          </div>
          {kind !== "merit" ? (
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox id="incident-resolved" checked={isResolved} onCheckedChange={(v) => setIsResolved(Boolean(v))} />
              <Label htmlFor="incident-resolved">حل‌شده (پروندهٔ پیگیری بسته می‌شود)</Label>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>لغو</Button>
          <Button
            disabled={!valid || create.isPending || update.isPending}
            onClick={async () => {
              try {
                if (editing) {
                  await update.mutateAsync({
                    id: incident.id,
                    body: {
                      date,
                      kind,
                      severity,
                      description: description.trim(),
                      actionTaken,
                      followUpNote: followUpNote.trim() || null,
                      resolved: kind === "merit" ? true : isResolved,
                    },
                  });
                  toast.success("ریکارد انضباط به‌روزرسانی شد.");
                } else {
                  await create.mutateAsync({
                    studentId,
                    date,
                    kind,
                    severity,
                    description: description.trim(),
                    actionTaken,
                    followUpNote: followUpNote.trim() || null,
                    resolved: kind === "merit" ? true : isResolved,
                  });
                  toast.success("ریکارد انضباط ثبت شد.");
                }
                onClose();
              } catch (err) {
                toast.error(apiErrorMessage(err));
              }
            }}
          >
            {(create.isPending || update.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {editing ? "ذخیرهٔ تغییرات" : "ثبت ریکارد"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
