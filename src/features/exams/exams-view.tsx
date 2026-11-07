// Exams & gradebook view — list assessments, open the gradebook grid,
// enter scores (missing ≠ zero), and publish (locks + policy snapshot).
// Teachers see/enter only their own sections; managers create & publish.

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
import { FileSpreadsheet, Loader2, Plus, Send, X } from "lucide-react";
import {
  useMe, useSections, useSubjects, useAssessments, useAssessment,
  useCreateAssessment, useEnterGrades, usePublishAssessment, useStaff,
} from "@/lib/api/hooks";
import { StatusBadge, EmptyState, NoResultsState, TableSkeleton, Ltr, JalaliDateInput } from "@/components/shared";
import { faNum, faDate, faPercent, assessmentTypeLabel, assessmentStatusLabel } from "@/lib/format";
import { hasGrant } from "@/app-shell/shell";

export function ExamsView() {
  const { data: me } = useMe();
  const canManage = hasGrant(me, "assessments.manage");
  const { data: sections } = useSections({});
  const [sectionId, setSectionId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const mySections = useMemo(() => {
    const ids = new Set(
      (me?.grants ?? [])
        .filter((g) => g.scope === "section")
        .flatMap((g) => g.sectionIds ?? []),
    );
    const list = sections ?? [];
    return ids.size > 0 ? list.filter((s) => ids.has(s.id)) : list;
  }, [me, sections]);

  const { data, isLoading } = useAssessments({
    classSectionId: sectionId || undefined,
    status: statusFilter || undefined,
  });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">امتحانات و نتایج</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            نمرهٔ ثبت‌نشده هرگز صفر شمرده نمی‌شود — نتایج فقط بعد از انتشار قطعی می‌شود.
          </p>
        </div>
        {canManage ? <CreateAssessmentDialog open={createOpen} onOpenChange={setCreateOpen} sections={sections ?? []} /> : null}
      </header>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <Select value={sectionId || "all"} onValueChange={(v) => setSectionId(v === "all" ? "" : v)}>
            <SelectTrigger className="w-56"><SelectValue placeholder="همهٔ شعبه‌های صنف" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همهٔ شعبه‌های صنف</SelectItem>
              {mySections.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.gradeLevel.nameDari} «{s.label}» — {s.branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-44"><SelectValue placeholder="همهٔ وضعیت‌ها" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همهٔ وضعیت‌ها</SelectItem>
              <SelectItem value="grading">در حال ثبت نمرات</SelectItem>
              <SelectItem value="published">منتشرشده</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><TableSkeleton rows={5} cols={6} /></div>
          ) : !data || data.length === 0 ? (
            <div className="p-6"><NoResultsState /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>عنوان</TableHead>
                    <TableHead>نوع</TableHead>
                    <TableHead>مضمون</TableHead>
                    <TableHead>شعبهٔ صنف</TableHead>
                    <TableHead>تاریخ</TableHead>
                    <TableHead>نمرهٔ کل</TableHead>
                    <TableHead>نمرات ثبت‌شده</TableHead>
                    <TableHead>وضعیت</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((a) => (
                    <TableRow key={a.id} className="cursor-pointer" onClick={() => setOpenId(a.id)}>
                      <TableCell className="font-medium">{a.title}</TableCell>
                      <TableCell className="text-muted-foreground">{assessmentTypeLabel(a.type)}</TableCell>
                      <TableCell>{a.subjectName}</TableCell>
                      <TableCell className="text-muted-foreground">{a.gradeName} «{a.sectionLabel}»</TableCell>
                      <TableCell className="tabular-nums">{faDate(a.date)}</TableCell>
                      <TableCell className="tabular-nums">{faNum(a.maxScore)}</TableCell>
                      <TableCell className="tabular-nums">{faNum(a.gradeCount)}</TableCell>
                      <TableCell>
                        <StatusBadge status={a.status === "published" ? "enrolled" : a.status === "grading" ? "under_review" : "draft"} label={assessmentStatusLabel(a.status)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {openId ? <GradebookDialog assessmentId={openId} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

function GradebookDialog({ assessmentId, onClose }: { assessmentId: string; onClose: () => void }) {
  const { data: a } = useAssessment(assessmentId);
  const enter = useEnterGrades();
  const publish = usePublishAssessment();
  const [scores, setScores] = useState<Record<string, string>>({});
  const [absent, setAbsent] = useState<Record<string, boolean>>({});
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  if (a && loadedFor !== a.id) {
    const s: Record<string, string> = {};
    const ab: Record<string, boolean> = {};
    for (const r of a.roster) {
      s[r.studentId] = r.score !== null ? String(r.score) : "";
      ab[r.studentId] = r.isAbsent;
    }
    setScores(s);
    setAbsent(ab);
    setLoadedFor(a.id);
  }

  async function save() {
    if (!a) return;
    try {
      await enter.mutateAsync({
        assessmentId: a.id,
        version: a.version,
        grades: a.roster.map((r) => {
          const raw = (scores[r.studentId] ?? "").trim();
          return {
            studentId: r.studentId,
            score: raw === "" ? null : Number(raw),
            isAbsent: Boolean(absent[r.studentId]),
          };
        }),
      });
      toast.success("نمرات ذخیره شد.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function doPublish() {
    if (!a) return;
    try {
      await publish.mutateAsync({ assessmentId: a.id, version: a.version });
      toast.success("نتایج منتشر شد؛ نمرات قطعی شد و برای شاگردان و والدین قابل مشاهده است.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (!a) {
    return (
      <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>دفتر نمرات</DialogTitle>
            <DialogDescription className="sr-only">در حال بارگذاری معلومات امتحان…</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const editable = a.canEnterGrades && a.status !== "published";
  const entered = a.roster.filter((r) => (scores[r.studentId] ?? "") !== "" || absent[r.studentId]).length;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            {a.title}
            <StatusBadge status={a.status === "published" ? "enrolled" : a.status === "grading" ? "under_review" : "draft"} label={assessmentStatusLabel(a.status)} />
          </DialogTitle>
          <DialogDescription>
            {a.gradeName} «{a.sectionLabel}» — {a.subjectName}
            {a.staffName ? ` · استاد: ${a.staffName}` : ""} · نمرهٔ کل {faNum(a.maxScore)} · وزن {faNum(a.weight)}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto">
          {a.roster.length === 0 ? (
            <EmptyState title="در این شعبهٔ صنف شاگرد فعال ثبت‌نام نشده است" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>شاگرد</TableHead>
                  <TableHead className="w-28">نمره</TableHead>
                  <TableHead className="w-20">غیرحاضر</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.roster.map((r, i) => (
                  <TableRow key={r.studentId}>
                    <TableCell className="tabular-nums text-muted-foreground">{faNum(i + 1)}</TableCell>
                    <TableCell>
                      <p className="font-medium">{r.firstName}</p>
                      <p className="text-xs text-muted-foreground">ولد: {r.fatherName}</p>
                    </TableCell>
                    <TableCell>
                      {editable ? (
                        <Input
                          dir="ltr"
                          inputMode="numeric"
                          className="h-8 text-center tabular-nums"
                          value={scores[r.studentId] ?? ""}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 4);
                            setScores((s) => ({ ...s, [r.studentId]: v }));
                            if (v) setAbsent((ab) => ({ ...ab, [r.studentId]: false }));
                          }}
                          placeholder="—"
                          disabled={Boolean(absent[r.studentId])}
                        />
                      ) : (
                        <span className="tabular-nums font-semibold">
                          {r.isAbsent ? "غیرحاضر" : r.score !== null ? faNum(r.score) : <span className="text-muted-foreground">نا-ثبت</span>}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editable ? (
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary"
                          checked={Boolean(absent[r.studentId])}
                          onChange={(e) => {
                            setAbsent((ab) => ({ ...ab, [r.studentId]: e.target.checked }));
                            if (e.target.checked) setScores((s) => ({ ...s, [r.studentId]: "" }));
                          }}
                          aria-label={`غیرحاضر در امتحان — ${r.firstName}`}
                        />
                      ) : r.isAbsent ? (
                        <Badge variant="outline" className="bg-red-50 text-red-800 border-red-200">غیرحاضر</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground tabular-nums">
            {faNum(entered)} از {faNum(a.roster.length)} شاگرد نمره دارد — خالی یعنی «نا-ثبت»، نه صفر.
          </p>
          <div className="flex items-center gap-2">
            {editable ? (
              <Button variant="outline" onClick={save} disabled={enter.isPending || a.roster.length === 0}>
                {enter.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} ذخیرهٔ نمرات
              </Button>
            ) : null}
            {a.canPublish ? (
              <Button onClick={doPublish} disabled={publish.isPending || entered === 0}>
                {publish.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                انتشار نتایج
              </Button>
            ) : a.status === "published" ? (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-300">
                نتایج قطعی و منتشر شده
              </Badge>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateAssessmentDialog({
  open, onOpenChange, sections,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sections: Array<{ id: string; label: string; gradeLevel: { nameDari: string }; branch: { name: string } }>;
}) {
  const { data: subjects } = useSubjects();
  const { data: staff } = useStaff({ position: "teacher", status: "active" });
  const create = useCreateAssessment();

  const [classSectionId, setClassSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState("quiz");
  const [date, setDate] = useState("");
  const [maxScore, setMaxScore] = useState("10");
  const [weight, setWeight] = useState("1");

  const valid = classSectionId && subjectId && title.trim().length >= 3 && Number(maxScore) >= 1 && Number(weight) >= 1;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        classSectionId,
        subjectId,
        staffId: staffId || null,
        title: title.trim(),
        type,
        date: date || null,
        maxScore: Number(maxScore),
        weight: Number(weight),
      });
      toast.success("امتحان ایجاد شد؛ نمرات اکنون قابل ثبت است.");
      onOpenChange(false);
      setTitle(""); setDate("");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" /> ایجاد امتحان</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>ایجاد امتحان / ارزیابی</DialogTitle>
          <DialogDescription>
            بعد از ایجاد، استاد مضمون نمرات را ثبت می‌کند و مدیر تعلیمی نتایج را منتشر می‌کند.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>عنوان</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: کوئیز فصل سوم" required />
            </div>
            <div className="space-y-1.5">
              <Label>شعبهٔ صنف</Label>
              <Select value={classSectionId || "none"} onValueChange={setClassSectionId}>
                <SelectTrigger><SelectValue placeholder="انتخاب…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled>انتخاب…</SelectItem>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.gradeLevel.nameDari} «{s.label}»</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>مضمون</Label>
              <Select value={subjectId || "none"} onValueChange={setSubjectId}>
                <SelectTrigger><SelectValue placeholder="انتخاب…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled>انتخاب…</SelectItem>
                  {(subjects ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nameDari}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>نوع</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="quiz">کوئیز</SelectItem>
                  <SelectItem value="assignment">مشق</SelectItem>
                  <SelectItem value="midterm">امتحان میان‌ترم</SelectItem>
                  <SelectItem value="final">امتحان نهایی</SelectItem>
                  <SelectItem value="project">پروژه</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>تاریخ (شمسی)</Label>
              <JalaliDateInput value={date} onChange={setDate} />
            </div>
            <div className="space-y-1.5">
              <Label>نمرهٔ کل</Label>
              <Input dir="ltr" inputMode="numeric" className="text-center" value={maxScore} onChange={(e) => setMaxScore(e.target.value.replace(/[^0-9]/g, ""))} />
            </div>
            <div className="space-y-1.5">
              <Label>وزن در میانگین</Label>
              <Input dir="ltr" inputMode="numeric" className="text-center" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^0-9]/g, ""))} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>استاد مسئول (اختیاری)</Label>
              <Select value={staffId || "none"} onValueChange={setStaffId}>
                <SelectTrigger><SelectValue placeholder="تعین نشده" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— تعین نشده —</SelectItem>
                  {(staff ?? []).filter((s) => s.position === "teacher").map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={!valid || create.isPending}>
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} ایجاد
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
