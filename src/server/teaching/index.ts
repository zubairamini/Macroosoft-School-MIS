// Teaching assignments + weekly timetable — Phase 2.
// Conflict rules: one teacher per (section, subject, year); a section has at
// most one slot per (weekday, period); a teacher is in at most one place per
// (weekday, period). Both are also enforced by DB unique constraints.

import { z } from "zod";
import { db } from "@/lib/db";
import { errors } from "@/server/shared/http";
import { writeAudit } from "@/server/shared/audit";
import { canAccessSection } from "@/server/rbac/scope";
import { dateInput } from "@/server/academic";
import type { AuthContext } from "@/server/auth/context";

// Afghan week: 0=شنبه(Saturday) .. 6=جمعه(Friday).
export const WEEKDAYS_DARI = [
  "شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه",
] as const;
export const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export function weekdayLabel(i: number): string {
  return WEEKDAYS_DARI[i] ?? String(i);
}

// ── DTOs ────────────────────────────────────────────────────────────────────

export const assignmentDto = z.object({
  academicYearId: z.string().min(1, "سال تعلیمی را انتخاب کنید."),
  classSectionId: z.string().min(1, "شعبهٔ صنف را انتخاب کنید."),
  subjectId: z.string().min(1, "مضمون را انتخاب کنید."),
  staffId: z.string().min(1, "استاد را انتخاب کنید."),
});

export const timetableSlotDto = z.object({
  classSectionId: z.string().min(1, "شعبهٔ صنف را انتخاب کنید."),
  weekday: z.coerce.number().int().min(0).max(6),
  period: z.coerce.number().int().min(1, "نفریزه باید بین ۱ تا ۸ باشد.").max(8, "نفریزه باید بین ۱ تا ۸ باشد."),
  subjectId: z.string().optional().nullable(),
  staffId: z.string().optional().nullable(),
  roomName: z.string().max(40).optional().nullable(),
});

// ── Teaching assignments ────────────────────────────────────────────────────

export async function listAssignments(ctx: AuthContext, filters: { academicYearId?: string; classSectionId?: string }) {
  return db.teachingAssignment.findMany({
    where: {
      academicYearId: filters.academicYearId,
      classSectionId: filters.classSectionId,
    },
    include: {
      staff: { select: { id: true, fullName: true, status: true } },
      subject: { select: { id: true, nameDari: true } },
      classSection: {
        select: {
          id: true, label: true,
          gradeLevel: { select: { level: true, nameDari: true } },
          branch: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ classSectionId: "asc" }, { subjectId: "asc" }],
  });
}

export async function setAssignment(ctx: AuthContext, dto: z.infer<typeof assignmentDto>) {
  const [year, section, subject, staff] = await Promise.all([
    db.academicYear.findUnique({ where: { id: dto.academicYearId } }),
    db.classSection.findUnique({ where: { id: dto.classSectionId } }),
    db.subject.findUnique({ where: { id: dto.subjectId } }),
    db.staffMember.findUnique({ where: { id: dto.staffId } }),
  ]);
  if (!year) throw errors.notFound("سال تعلیمی");
  if (!section) throw errors.notFound("شعبهٔ صنف");
  if (!subject) throw errors.notFound("مضمون");
  if (!staff) throw errors.notFound("استاد");
  if (staff.status !== "active") {
    throw errors.badRequest("فقط استادان فعال می‌توانند مضمون تدریس کنند.");
  }
  if (section.academicYearId !== year.id) {
    throw errors.badRequest("شعبهٔ صنف به این سال تعلیمی تعلق ندارد.");
  }

  return db.$transaction(async (tx) => {
    const existing = await tx.teachingAssignment.findFirst({
      where: {
        academicYearId: dto.academicYearId,
        classSectionId: dto.classSectionId,
        subjectId: dto.subjectId,
      },
      include: { staff: { select: { fullName: true } } },
    });
    if (existing && existing.staffId !== dto.staffId) {
      throw errors.conflict(
        `مضمون «${subject.nameDari}» برای این شعبهٔ صنف به ${existing.staff.fullName} سپرده شده است. ابتدا آن را تغییر دهید.`,
      );
    }
    const row = existing
      ? await tx.teachingAssignment.update({ where: { id: existing.id }, data: { staffId: dto.staffId } })
      : await tx.teachingAssignment.create({
          data: {
            academicYearId: dto.academicYearId,
            classSectionId: dto.classSectionId,
            subjectId: dto.subjectId,
            staffId: dto.staffId,
            createdById: ctx.user.id,
          },
        });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: existing ? "assignment.update" : "assignment.create",
      entity: "TeachingAssignment",
      entityId: row.id,
      before: existing ? { staffId: existing.staffId } : undefined,
      after: { staffId: dto.staffId, section: dto.classSectionId, subject: dto.subjectId },
      ip: ctx.ip,
    });
    return row;
  });
}

export async function removeAssignment(ctx: AuthContext, id: string) {
  const row = await db.teachingAssignment.findUnique({ where: { id } });
  if (!row) throw errors.notFound("تخصیص تدریس");
  return db.$transaction(async (tx) => {
    await tx.teachingAssignment.delete({ where: { id } });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "assignment.remove",
      entity: "TeachingAssignment",
      entityId: id,
      before: { staffId: row.staffId, sectionId: row.classSectionId, subjectId: row.subjectId },
      ip: ctx.ip,
    });
    return { ok: true };
  });
}

// ── Timetable ───────────────────────────────────────────────────────────────

export async function getTimetable(ctx: AuthContext, filters: { classSectionId?: string; staffId?: string }) {
  if (!filters.classSectionId && !filters.staffId) {
    throw errors.badRequest("شعبهٔ صنف یا استاد را مشخص کنید.");
  }
  const rows = await db.timetableSlot.findMany({
    where: {
      classSectionId: filters.classSectionId,
      staffId: filters.staffId,
    },
    include: {
      subject: { select: { id: true, nameDari: true } },
      staff: { select: { id: true, fullName: true } },
      classSection: {
        select: {
          id: true, label: true,
          gradeLevel: { select: { level: true, nameDari: true } },
          branch: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ weekday: "asc" }, { period: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    classSectionId: r.classSectionId,
    gradeName: r.classSection.gradeLevel.nameDari,
    sectionLabel: r.classSection.label,
    branchName: r.classSection.branch.name,
    weekday: r.weekday,
    weekdayLabel: weekdayLabel(r.weekday),
    period: r.period,
    subjectId: r.subjectId,
    subjectName: r.subject?.nameDari ?? null,
    staffId: r.staffId,
    staffName: r.staff?.fullName ?? null,
    roomName: r.roomName,
  }));
}

export async function upsertTimetableSlot(ctx: AuthContext, dto: z.infer<typeof timetableSlotDto>) {
  const section = await db.classSection.findUnique({ where: { id: dto.classSectionId } });
  if (!section) throw errors.notFound("شعبهٔ صنف");

  let subject: { id: string; nameDari: string } | null = null;
  if (dto.subjectId) {
    subject = await db.subject.findUnique({ where: { id: dto.subjectId }, select: { id: true, nameDari: true } });
    if (!subject) throw errors.notFound("مضمون");
  }
  let staff: { id: string; fullName: string; status: string } | null = null;
  if (dto.staffId) {
    staff = await db.staffMember.findUnique({ where: { id: dto.staffId } });
    if (!staff) throw errors.notFound("استاد");
    if (staff.status !== "active") throw errors.badRequest("فقط استادان فعال را می‌توان در برنامهٔ صنفی گماشت.");
  }

  return db.$transaction(async (tx) => {
    const existing = await tx.timetableSlot.findUnique({
      where: { classSectionId_weekday_period: { classSectionId: dto.classSectionId, weekday: dto.weekday, period: dto.period } },
    });

    // Conflict: the same teacher already busy at this weekday+period.
    if (staff) {
      const clash = await tx.timetableSlot.findFirst({
        where: { staffId: staff.id, weekday: dto.weekday, period: dto.period, NOT: { id: existing?.id ?? "" } },
        include: { classSection: { select: { label: true, gradeLevel: { select: { nameDari: true } } } } },
      });
      if (clash) {
        throw errors.conflict(
          `${staff.fullName} در ${weekdayLabel(dto.weekday)} نفریزهٔ ${dto.period} در ${clash.classSection.gradeLevel.nameDari} «${clash.classSection.label}» کلاس دارد.`,
        );
      }
    }

    const data = {
      classSectionId: dto.classSectionId,
      weekday: dto.weekday,
      period: dto.period,
      subjectId: dto.subjectId || null,
      staffId: dto.staffId || null,
      roomName: dto.roomName ?? null,
    };
    const row = existing
      ? await tx.timetableSlot.update({ where: { id: existing.id }, data })
      : await tx.timetableSlot.create({ data });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: existing ? "timetable.update" : "timetable.create",
      entity: "TimetableSlot",
      entityId: row.id,
      before: existing ? { subjectId: existing.subjectId, staffId: existing.staffId } : undefined,
      after: { subjectId: row.subjectId, staffId: row.staffId, weekday: row.weekday, period: row.period },
      ip: ctx.ip,
    });
    return row;
  });
}

export async function deleteTimetableSlot(ctx: AuthContext, id: string) {
  const row = await db.timetableSlot.findUnique({ where: { id } });
  if (!row) throw errors.notFound("برنامهٔ صنفی");
  return db.$transaction(async (tx) => {
    await tx.timetableSlot.delete({ where: { id } });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "timetable.delete",
      entity: "TimetableSlot",
      entityId: id,
      before: { weekday: row.weekday, period: row.period, subjectId: row.subjectId, staffId: row.staffId },
      ip: ctx.ip,
    });
    return { ok: true };
  });
}

/** Sections whose timetable the viewer may see (timetable.view scope). */
export async function canViewTimetable(ctx: AuthContext, sectionId: string): Promise<boolean> {
  return canAccessSection(ctx, "timetable.view", sectionId);
}

/** The signed-in teacher's own weekly schedule: slots of their staff record,
 *  in sections they teach (teaching assignment) or can access by scope. */
export async function getMyTimetable(ctx: AuthContext) {
  const staff = await db.staffMember.findFirst({
    where: { userId: ctx.user.id },
    select: { id: true, fullName: true },
  });
  if (!staff) return { staff: null, slots: [] };
  const slots = await getTimetable(ctx, { staffId: staff.id });
  return {
    staff: { id: staff.id, fullName: staff.fullName },
    slots,
  };
}

export { dateInput };
