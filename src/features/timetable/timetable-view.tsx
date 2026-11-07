// Timetable view — weekly grid for a selected section (managers edit cells
// with conflict detection from the API), or the signed-in teacher's own
// schedule (read-only). RTL grid: weekdays right-to-left like the paper chart.

"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CalendarClock, Loader2, PencilLine, Trash2 } from "lucide-react";
import { useMe, useSections, useSubjects, useTimetable, useUpsertTimetableSlot, useDeleteTimetableSlot, useStaff } from "@/lib/api/hooks";
import { EmptyState, TableSkeleton, Ltr } from "@/components/shared";
import { faNum, staffPositionLabel } from "@/lib/format";
import { hasGrant } from "@/app-shell/shell";

const WEEKDAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

export function TimetableView() {
  const { data: me } = useMe();
  const isTeacherOnly = !hasGrant(me, "timetable.manage") && hasGrant(me, "timetable.view");
  const { data: sections } = useSections({});
  const [sectionId, setSectionId] = useState("");
  const [editing, setEditing] = useState<{ weekday: number; period: number } | null>(null);

  const teacherSections = useMemo(() => {
    const ids = new Set(
      (me?.grants ?? [])
        .filter((g) => g.scope === "section")
        .flatMap((g) => g.sectionIds ?? []),
    );
    return (sections ?? []).filter((s) => ids.size === 0 || ids.has(s.id));
  }, [me, sections]);

  const effectiveSectionId = sectionId || teacherSections[0]?.id || "";
  const useMine = isTeacherOnly && !hasGrant(me, "timetable.manage") && !effectiveSectionId;

  const { data, isLoading } = useTimetable(
    useMine ? { mine: true } : { classSectionId: effectiveSectionId || undefined },
  );

  const canManage = hasGrant(me, "timetable.manage");

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">برنامهٔ صنفی</h1>
        <Card><CardContent className="p-4"><TableSkeleton rows={6} cols={6} /></CardContent></Card>
      </div>
    );
  }

  const slots = data?.slots ?? [];
  const slotMap = new Map<string, (typeof slots)[number]>();
  for (const s of slots) slotMap.set(`${s.weekday}-${s.period}`, s);

  const maxPeriod = Math.max(4, ...slots.map((s) => s.period));

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">برنامهٔ صنفی</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {useMine && data?.staff
              ? `برنامهٔ هفتگیٔ ${data.staff.fullName}`
              : "شبکهٔ هفتگیٔ دروس — تضاد استاد به صورت خودکار تشخیص می‌شود"}
          </p>
        </div>
        {!useMine && (teacherSections.length > 0 || sections) ? (
          <Select value={effectiveSectionId} onValueChange={setSectionId}>
            <SelectTrigger className="w-64"><SelectValue placeholder="انتخاب شعبهٔ صنف" /></SelectTrigger>
            <SelectContent>
              {(canManage ? (sections ?? []) : teacherSections).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.gradeLevel.nameDari} «{s.label}» — {s.branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </header>

      {slots.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="برنامه‌ای ثبت نشده است"
          body={canManage ? "برای این شعبهٔ صنف هنوز برنامهٔ هفتگی تنظیم نشده است. روی خانه‌های خیر جدول کلیک کنید." : "برای این شعبهٔ صنف برنامه‌ای موجود نیست."}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="w-16 p-2 text-xs font-semibold text-muted-foreground">نفریزه</th>
                    {WEEKDAYS.slice(0, 6).map((d, i) => (
                      <th key={d} className="min-w-28 border-s p-2 text-xs font-semibold">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERIODS.slice(0, maxPeriod).map((p) => (
                    <tr key={p} className="border-b last:border-0">
                      <td className="bg-muted/30 p-2 text-center text-xs font-bold tabular-nums">{faNum(p)}</td>
                      {WEEKDAYS.slice(0, 6).map((d, i) => {
                        const slot = slotMap.get(`${i}-${p}`);
                        const clickable = canManage && !useMine;
                        return (
                          <td
                            key={`${i}-${p}`}
                            className={`border-s p-1.5 align-top ${clickable ? "cursor-pointer hover:bg-primary/5" : ""}`}
                            onClick={clickable ? () => setEditing({ weekday: i, period: p }) : undefined}
                          >
                            {slot ? (
                              <div className="rounded-md border border-border bg-card p-1.5">
                                <p className="text-xs font-semibold leading-5">{slot.subjectName ?? "— بدون مضمون"}</p>
                                {slot.staffName ? (
                                  <p className="truncate text-[11px] leading-4 text-muted-foreground">{slot.staffName}</p>
                                ) : null}
                                {slot.roomName ? (
                                  <p className="text-[11px] leading-4 text-muted-foreground">اتاق: {slot.roomName}</p>
                                ) : null}
                                {clickable ? (
                                  <div className="mt-1 flex items-center gap-1">
                                    <PencilLine className="h-3 w-3 text-muted-foreground" />
                                  </div>
                                ) : null}
                              </div>
                            ) : clickable ? (
                              <div className="flex h-10 items-center justify-center rounded-md border border-dashed text-[11px] text-muted-foreground/70">
                                + افزودن
                              </div>
                            ) : (
                              <div className="flex h-10 items-center justify-center text-[11px] text-muted-foreground/40">—</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {editing && canManage ? (
        <SlotDialog
          weekday={editing.weekday}
          period={editing.period}
          sectionId={effectiveSectionId}
          existing={slotMap.get(`${editing.weekday}-${editing.period}`) ?? null}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function SlotDialog({
  weekday, period, sectionId, existing, onClose,
}: {
  weekday: number; period: number; sectionId: string;
  existing: { id: string; subjectId: string | null; staffId: string | null; roomName: string | null } | null;
  onClose: () => void;
}) {
  const { data: subjects } = useSubjects();
  const { data: staff } = useStaff({ position: "teacher", status: "active" });
  const upsert = useUpsertTimetableSlot();
  const del = useDeleteTimetableSlot();
  const [subjectId, setSubjectId] = useState(existing?.subjectId ?? "");
  const [staffId, setStaffId] = useState(existing?.staffId ?? "");
  const [roomName, setRoomName] = useState(existing?.roomName ?? "");

  async function save() {
    try {
      await upsert.mutateAsync({
        classSectionId: sectionId,
        weekday,
        period,
        subjectId: subjectId || null,
        staffId: staffId || null,
        roomName: roomName || null,
      });
      toast.success("برنامهٔ صنفی ذخیره شد.");
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function remove() {
    if (!existing) return;
    try {
      await del.mutateAsync(existing.id);
      toast.success("خانهٔ برنامه حذف شد.");
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{WEEKDAYS[weekday]} — نفریزهٔ {faNum(period)}</DialogTitle>
          <DialogDescription>مضمون و استاد این خانه از برنامه را مشخص کنید. تضاد زمانی استاد به صورت خودکار بررسی می‌شود.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>مضمون</Label>
            <Select value={subjectId || "none"} onValueChange={setSubjectId}>
              <SelectTrigger><SelectValue placeholder="انتخاب مضمون" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— بدون مضمون —</SelectItem>
                {(subjects ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.nameDari}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>استاد</Label>
            <Select value={staffId || "none"} onValueChange={setStaffId}>
              <SelectTrigger><SelectValue placeholder="انتخاب استاد" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— تعین نشده —</SelectItem>
                {(staff ?? []).filter((s) => s.position === "teacher").map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.fullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>اتاق</Label>
            <Input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="مثلاً اتاق ۴۱" />
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={upsert.isPending} className="flex-1">
              {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} ذخیره
            </Button>
            {existing ? (
              <Button variant="outline" onClick={remove} disabled={del.isPending}>
                <Trash2 className="h-4 w-4" /> حذف
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
