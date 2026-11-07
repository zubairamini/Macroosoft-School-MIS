// Attendance view — the teacher's daily roster workflow:
// pick section + date → open session → quick-mark (حاضر/غیرحاضر/ناوقت/رخصت)
// → save → submit (locks). Managers view rosters read-only and can reopen
// submitted sessions with a mandatory reason. A summary table shows the
// «نا-ثبت» column: unrecorded is never counted as present or absent.

"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ClipboardCheck, Loader2, Lock, LockOpen, Save, Trash2, Users } from "lucide-react";
import {
  useMe, useSections, useAttendanceSessions, useAttendanceSession,
  useUpsertAttendanceSession, useSaveAttendanceRecords, useSubmitAttendanceSession,
  useReopenAttendanceSession, useAttendanceSummary, useDeleteAttendanceSession,
} from "@/lib/api/hooks";
import { StatusBadge, EmptyState, NoResultsState, TableSkeleton, JalaliDateInput, Ltr } from "@/components/shared";
import { faNum, faDate, attendanceStatusLabel, sessionStatusLabel } from "@/lib/format";
import { hasGrant } from "@/app-shell/shell";

type Mark = "present" | "absent" | "late" | "excused";

const MARK_BUTTONS: Array<{ key: Mark; label: string; active: string }> = [
  { key: "present", label: "حاضر", active: "bg-emerald-600 text-white border-emerald-700" },
  { key: "absent", label: "غیرحاضر", active: "bg-red-600 text-white border-red-700" },
  { key: "late", label: "ناوقت", active: "bg-amber-500 text-white border-amber-600" },
  { key: "excused", label: "رخصت", active: "bg-sky-600 text-white border-sky-700" },
];

export function AttendanceView() {
  const { data: me } = useMe();
  const canRecord = hasGrant(me, "attendance.record");
  const canCorrect = hasGrant(me, "attendance.correct");
  const { data: sections } = useSections({});

  const mySections = useMemo(() => {
    const ids = new Set(
      (me?.grants ?? [])
        .filter((g) => g.scope === "section")
        .flatMap((g) => g.sectionIds ?? []),
    );
    const list = sections ?? [];
    return ids.size > 0 ? list.filter((s) => ids.has(s.id)) : list;
  }, [me, sections]);

  const [sectionId, setSectionId] = useState("");
  const effectiveSectionId = sectionId || mySections[0]?.id || "";
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [reopenTarget, setReopenTarget] = useState<string | null>(null);

  const { data: sessions, isLoading: loadingSessions } = useAttendanceSessions({
    classSectionId: effectiveSectionId || undefined,
  });
  const { data: summary } = useAttendanceSummary({
    classSectionId: effectiveSectionId || undefined,
  });

  const sessionForDate = (sessions ?? []).find((s) => s.date === date && s.period === 0);
  const effectiveSessionId = activeSessionId ?? sessionForDate?.id ?? null;
  const { data: session } = useAttendanceSession(effectiveSessionId);
  const upsert = useUpsertAttendanceSession();
  const save = useSaveAttendanceRecords();
  const submit = useSubmitAttendanceSession();
  const reopen = useReopenAttendanceSession();
  const del = useDeleteAttendanceSession();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; date: string } | null>(null);

  // Local draft marks: studentId → status (initialized from server records).
  const [draft, setDraft] = useState<Record<string, Mark>>({});
  const [draftLoadedFor, setDraftLoadedFor] = useState<string | null>(null);
  if (session && draftLoadedFor !== session.id) {
    const next: Record<string, Mark> = {};
    for (const r of session.roster) {
      if (r.record) next[r.studentId] = r.record.status as Mark;
      else next[r.studentId] = "present";
    }
    setDraft(next);
    setDraftLoadedFor(session.id);
  }

  function setMark(studentId: string, mark: Mark) {
    setDraft((d) => ({ ...d, [studentId]: mark }));
  }

  function markAll(mark: Mark) {
    if (!session) return;
    const next: Record<string, Mark> = {};
    for (const r of session.roster) next[r.studentId] = mark;
    setDraft(next);
  }

  async function openSession() {
    if (!effectiveSectionId) return;
    try {
      const res = await upsert.mutateAsync({ classSectionId: effectiveSectionId, date });
      setActiveSessionId((res as { id: string }).id);
      toast.success("سیشن حاضری برای این روز باز شد.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function saveRecords() {
    if (!session) return;
    try {
      await save.mutateAsync({
        sessionId: session.id,
        version: session.version,
        records: session.roster.map((r) => ({ studentId: r.studentId, status: draft[r.studentId] ?? "present" })),
      });
      toast.success("حاضری ذخیره شد (هنوز قطعی نشده).");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function submitSession() {
    if (!session) return;
    try {
      // Save the current draft first, then submit — one atomic user action.
      // saveRecords bumps the session version, so submit uses version+1.
      await save.mutateAsync({
        sessionId: session.id,
        version: session.version,
        records: session.roster.map((r) => ({ studentId: r.studentId, status: draft[r.studentId] ?? "present" })),
      });
      await submit.mutateAsync({ sessionId: session.id, version: session.version + 1 });
      toast.success("حاضری قطعی شد و در آمار محاسبه می‌شود.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const readOnly = !canRecord || session?.status === "submitted";

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">حاضری</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ثبت روزانهٔ حاضری شاگردان — «نا-ثبت» هرگز به‌صورت حاضر یا غیرحاطر شمرده نمی‌شود.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={effectiveSectionId} onValueChange={(v) => { setSectionId(v); setActiveSessionId(null); setDraftLoadedFor(null); }}>
            <SelectTrigger className="w-56"><SelectValue placeholder="انتخاب شعبهٔ صنف" /></SelectTrigger>
            <SelectContent>
              {mySections.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.gradeLevel.nameDari} «{s.label}» — {s.branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="w-40">
            <JalaliDateInput value={date} onChange={(v) => { setDate(v); setActiveSessionId(null); setDraftLoadedFor(null); }} />
          </div>
        </div>
      </header>

      {/* Roster */}
      <Card>
        <CardContent className="space-y-4 p-4">
          {!effectiveSectionId ? (
            <EmptyState icon={Users} title="شعبهٔ صنف را انتخاب کنید" body="برای ثبت حاضری ابتدا شعبهٔ صنف و تاریخ را انتخاب کنید." />
          ) : loadingSessions ? (
            <TableSkeleton rows={5} cols={4} />
          ) : !sessionForDate && !effectiveSessionId ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <ClipboardCheck className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                برای {faDate(date)} هنوز سیشن حاضری باز نشده است.
              </p>
              {canRecord ? (
                <Button onClick={openSession} disabled={upsert.isPending}>
                  {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  شروع ثبت حاضری این روز
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">شما اجازهٔ ثبت حاضری ندارید.</p>
              )}
            </div>
          ) : session ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StatusBadge status={session.status} label={sessionStatusLabel(session.status)} />
                  <p className="text-sm font-medium">
                    {session.gradeName} «{session.sectionLabel}» — {faDate(session.date)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!readOnly && session.roster.length > 0 ? (
                    <Button variant="outline" size="sm" onClick={() => markAll("present")}>
                      همه حاضر
                    </Button>
                  ) : null}
                  {canCorrect && session.status === "submitted" ? (
                    <Button variant="outline" size="sm" onClick={() => setReopenTarget(session.id)}>
                      <LockOpen className="h-3.5 w-3.5" /> بازکردن مجدد
                    </Button>
                  ) : null}
                </div>
              </div>

              {session.roster.length === 0 ? (
                <EmptyState title="در این شعبهٔ صنف شاگرد فعال ثبت‌نام نشده است" />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>شاگرد</TableHead>
                        <TableHead>شمارهٔ شاگردی</TableHead>
                        <TableHead className="min-w-64">وضعیت</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {session.roster.map((r, i) => {
                        const mark = draft[r.studentId] ?? "present";
                        return (
                          <TableRow key={r.studentId}>
                            <TableCell className="tabular-nums text-muted-foreground">{faNum(i + 1)}</TableCell>
                            <TableCell>
                              <p className="font-medium">{r.firstName}</p>
                              <p className="text-xs text-muted-foreground">ولد: {r.fatherName}</p>
                            </TableCell>
                            <TableCell><Ltr className="text-xs">{r.studentNumber}</Ltr></TableCell>
                            <TableCell>
                              {readOnly ? (
                                r.record ? (
                                  <StatusBadge status={r.record.status} label={attendanceStatusLabel(r.record.status)} />
                                ) : (
                                  <span className="text-xs text-muted-foreground">نا-ثبت</span>
                                )
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {MARK_BUTTONS.map((b) => (
                                    <button
                                      key={b.key}
                                      type="button"
                                      onClick={() => setMark(r.studentId, b.key)}
                                      className={`transition-soft rounded-md border px-2.5 py-1 text-xs font-medium ${
                                        mark === b.key ? b.active : "bg-card text-muted-foreground hover:border-primary/50"
                                      }`}
                                    >
                                      {b.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {!readOnly ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <Button variant="outline" onClick={saveRecords} disabled={save.isPending || session.roster.length === 0}>
                    {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    ذخیره (موقت)
                  </Button>
                  <Button onClick={submitSession} disabled={submit.isPending || session.roster.length === 0}>
                    {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                    قطعی کردن حاضری
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    ذخیرهٔ موقت قابل ویرایش است؛ فقط حاضری قطعی‌شده در آمار محاسبه می‌شود.
                  </p>
                </div>
              ) : (
                <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                  {session.status === "submitted"
                    ? "این حاضری قطعی شده و قابل ویرایش نیست. برای تصحیح، مدیر تعلیمی آن را بازگرداند."
                    : "شما اجازهٔ ثبت حاضری این شعبهٔ صنف را ندارید."}
                </p>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* Summary + recent sessions */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <h2 className="mb-3 text-sm font-semibold">آمار حاضری (فقط سیشن‌های قطعی‌شده)</h2>
            {summary && summary.students.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>شاگرد</TableHead>
                      <TableHead>حاضر</TableHead>
                      <TableHead>غیرحاضر</TableHead>
                      <TableHead>ناوقت</TableHead>
                      <TableHead>رخصت</TableHead>
                      <TableHead>نا-ثبت</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.students.map((s) => (
                      <TableRow key={s.studentId}>
                        <TableCell className="font-medium">{s.firstName}</TableCell>
                        <TableCell className="tabular-nums text-emerald-700">{faNum(s.present)}</TableCell>
                        <TableCell className="tabular-nums text-red-700">{faNum(s.absent)}</TableCell>
                        <TableCell className="tabular-nums text-amber-700">{faNum(s.late)}</TableCell>
                        <TableCell className="tabular-nums text-sky-700">{faNum(s.excused)}</TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">{faNum(s.notRecorded)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="mt-2 text-xs text-muted-foreground">
                  مجموع سیشن‌های قطعی‌شده: {faNum(summary.sessions)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">هنوز حاضری قطعی‌شده‌ای برای این شعبهٔ صنف موجود نیست.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h2 className="mb-3 text-sm font-semibold">سیشن‌های اخیر</h2>
            {(sessions ?? []).length === 0 ? (
              <NoResultsState />
            ) : (
              <div className="space-y-1.5">
                {(sessions ?? []).slice(0, 8).map((s) => (
                  <div key={s.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => { setDate(s.date); setActiveSessionId(s.id); setDraftLoadedFor(null); }}
                      className="transition-soft flex flex-1 items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:border-primary/50"
                    >
                      <span className="font-medium">{faDate(s.date)}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {s.recordCount !== null ? `${faNum(s.recordCount)} ثبت` : ""}
                        </span>
                        <StatusBadge status={s.status} label={sessionStatusLabel(s.status)} />
                      </span>
                    </button>
                    {canRecord && s.status === "open" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        title="حذف پیش‌نویس"
                        disabled={del.isPending}
                        onClick={() => setDeleteTarget({ id: s.id, date: s.date })}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {reopenTarget ? (
        <ReopenDialog sessionId={reopenTarget} onClose={() => setReopenTarget(null)} reopen={reopen} />
      ) : null}

      {deleteTarget ? (
        <Dialog open onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>حذف پیش‌نویس حاضری — {faDate(deleteTarget.date)}</DialogTitle>
              <DialogDescription>
                فقط سیشن‌های باز (قطعی‌نشده) قابل حذف‌اند. علائم ذخیره‌شدهٔ این پیش‌نویس نیز
                حذف می‌شود و عملیات در ریکارود نظارتی ثبت می‌گردد.
              </DialogDescription>
            </DialogHeader>
            <Button
              variant="destructive"
              className="w-full"
              disabled={del.isPending}
              onClick={async () => {
                try {
                  await del.mutateAsync({ sessionId: deleteTarget.id });
                  toast.success("پیش‌نویس حاضری حذف شد.");
                  if (activeSessionId === deleteTarget.id) {
                    setActiveSessionId(null);
                    setDraftLoadedFor(null);
                  }
                  setDeleteTarget(null);
                } catch (err) {
                  toast.error((err as Error).message);
                }
              }}
            >
              {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              حذف قطعی پیش‌نویس
            </Button>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

function ReopenDialog({
  sessionId, onClose, reopen,
}: {
  sessionId: string;
  onClose: () => void;
  reopen: ReturnType<typeof useReopenAttendanceSession>;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>بازکردن مجدد حاضری قطعی‌شده</DialogTitle>
          <DialogDescription>
            این عمل در ریکارد نظارتی ثبت می‌شود. دلیل بازگرداندن را حتماً بنویسید.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>دلیل</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: ثبت اشتباه توسط استاد" />
          </div>
          <Button
            className="w-full"
            disabled={reason.trim().length < 3 || reopen.isPending}
            onClick={async () => {
              try {
                await reopen.mutateAsync({ sessionId, reason: reason.trim() });
                toast.success("حاضری بازگردانده شد؛ اکنون قابل ویرایش است.");
                onClose();
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          >
            {reopen.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />}
            بازگرداندن
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
