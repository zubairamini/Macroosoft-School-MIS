// Discipline & behavior register — Phase 7 (انضباط و رفتار).
//
// INVARIANTS:
//  - ONE REGISTER, BOTH POLARITIES: kind "merit" records positive behavior;
//    every other kind is an incident. Incidents carry a severity and a
//    follow-up trail (actionTaken / followUpNote / resolvedAt).
//  - BRANCH ISOLATION: every row carries the branch of the student's active
//    enrollment at recording time. Branch roles see only their own branch;
//    teachers (scope "section") see only incidents of students currently
//    enrolled in their own class sections; admin / مدیر عام cross branches
//    (narrowed to the active branch context when one is selected).
//  - FULL CRUD WITH AUDIT: create / update / delete all write an audit event;
//    delete stores a full before snapshot — the register is correctable but
//    never silently rewritten.
//  - Dates are date-only ISO strings (Asia/Kabul local dates), like the rest
//    of the academic records.

import { z } from "zod";
import { db } from "@/lib/db";
import { errors } from "@/server/shared/http";
import { writeAudit } from "@/server/shared/audit";
import { dateInput } from "@/server/academic";
import type { AuthContext } from "@/server/auth/context";
import type { Prisma } from "@prisma/client";

// ── Catalog (Dari labels) ───────────────────────────────────────────────────

export const INCIDENT_KINDS = [
  "late", "absent", "misconduct", "damage", "fight", "dress", "other", "merit",
] as const;
export type IncidentKind = (typeof INCIDENT_KINDS)[number];

export const INCIDENT_KIND_LABELS: Record<IncidentKind, string> = {
  late: "تأخیر",
  absent: "غیبت",
  misconduct: "بدرفتاری",
  damage: "خرابی عمدی",
  fight: "زد و خورد",
  dress: "عدم رعایت لباس مکتبی",
  other: "سایر",
  merit: "اقدام مثبت",
};

export const SEVERITIES = ["low", "medium", "high"] as const;
export const SEVERITY_LABELS: Record<string, string> = {
  low: "کم",
  medium: "متوسط",
  high: "زیاد",
};

export const ACTIONS_TAKEN = ["none", "counseling", "parent_notified", "warning", "suspension"] as const;
export const ACTION_LABELS: Record<string, string> = {
  none: "—",
  counseling: "مشوره",
  parent_notified: "اطلاع به ولی",
  warning: "تنبیه کتبی",
  suspension: "محرومیت موقت",
};

// ── DTOs ────────────────────────────────────────────────────────────────────

export const incidentCreateDto = z.object({
  studentId: z.string().min(1, "شاگرد را انتخاب کنید."),
  date: dateInput,
  kind: z.enum(INCIDENT_KINDS, { message: "نوع ریکارد را انتخاب کنید." }),
  severity: z.enum(SEVERITIES).default("low"),
  description: z.string().min(3, "توضیح را بنویسید.").max(500),
  actionTaken: z.enum(ACTIONS_TAKEN).default("none"),
  followUpNote: z.string().max(500).optional().nullable(),
  resolved: z.boolean().default(false),
});

export const incidentUpdateDto = z.object({
  date: dateInput.optional(),
  kind: z.enum(INCIDENT_KINDS).optional(),
  severity: z.enum(SEVERITIES).optional(),
  description: z.string().min(3, "توضیح را بنویسید.").max(500).optional(),
  actionTaken: z.enum(ACTIONS_TAKEN).optional(),
  followUpNote: z.string().max(500).optional().nullable(),
  resolved: z.boolean().optional(),
});

// ── Scope resolution ────────────────────────────────────────────────────────

interface StudentScope {
  allowed: boolean;
  /** Branch of the student's active enrollment (null when not resolvable). */
  branchId: string | null;
}

/** Whether `ctx` may see/record discipline data of `studentId` under
 *  `permission`, and in which branch that student currently studies. */
async function studentDisciplineScope(
  ctx: AuthContext,
  permission: string,
  studentId: string,
): Promise<StudentScope> {
  const grants = ctx.grants.filter((g) => g.permission === permission);
  if (grants.length === 0) return { allowed: false, branchId: null };

  // Current active enrollment (latest first) with its section + branch.
  const enr = await db.enrollment.findFirst({
    where: { studentId, status: "active" },
    orderBy: { createdAt: "desc" },
    select: { classSectionId: true, classSection: { select: { branchId: true } } },
  });
  // Enrollment without a concrete section cannot be scoped — treat as none.
  const sectionBranchId = enr?.classSection?.branchId ?? null;
  const sectionId = enr?.classSectionId ?? null;

  // Section scope (teacher): student enrolled in one of the assigned sections.
  const sectionGrants = grants.filter((g) => g.scope === "section");
  if (sectionGrants.length > 0) {
    const sections = new Set(sectionGrants.flatMap((g) => g.sectionIds ?? []));
    if (sections.size > 0 && sectionId && sections.has(sectionId) && sectionBranchId) {
      return { allowed: true, branchId: sectionBranchId };
    }
  }

  // Branch scope: student studies in an explicitly bound branch.
  const branchGrants = grants.filter((g) => g.scope === "branch" && g.branchId);
  if (branchGrants.length > 0 && sectionBranchId) {
    if (branchGrants.some((g) => g.branchId === sectionBranchId)) {
      return { allowed: true, branchId: sectionBranchId };
    }
  }

  // Organization-wide scope (admin / مدیر عام) — narrowed to the active
  // branch context when one is selected in the shell.
  if (grants.some((g) => g.scope === "all")) {
    if (ctx.branchId && sectionBranchId && sectionBranchId !== ctx.branchId) {
      return { allowed: false, branchId: sectionBranchId };
    }
    return { allowed: true, branchId: sectionBranchId };
  }

  return { allowed: false, branchId: null };
}

/** Prisma `where` for LIST queries, following the same isolation policy. */
async function incidentListWhere(ctx: AuthContext, permission: string): Promise<Prisma.DisciplineIncidentWhereInput | null> {
  const grants = ctx.grants.filter((g) => g.permission === permission);
  if (grants.length === 0) return null;

  if (grants.some((g) => g.scope === "all")) {
    return ctx.branchId ? { branchId: ctx.branchId } : {};
  }

  const or: Prisma.DisciplineIncidentWhereInput[] = [];

  // Branch-scoped grants — only with a concrete branchId (fail closed).
  const branchIds = [
    ...new Set(
      grants.filter((g) => g.scope === "branch" && g.branchId).map((g) => g.branchId as string),
    ),
  ];
  if (branchIds.length > 0) or.push({ branchId: { in: branchIds } });

  // Section-scoped grants (teacher): students currently in those sections.
  const sectionIds = [
    ...new Set(grants.filter((g) => g.scope === "section").flatMap((g) => g.sectionIds ?? [])),
  ];
  if (sectionIds.length > 0) {
    const enrollments = await db.enrollment.findMany({
      where: { classSectionId: { in: sectionIds }, status: "active" },
      select: { studentId: true },
    });
    const studentIds = [...new Set(enrollments.map((e) => e.studentId))];
    or.push(studentIds.length > 0 ? { studentId: { in: studentIds } } : { id: "__none__" });
  }

  if (or.length === 0) return { id: "__none__" }; // grants without parameters
  return { OR: or };
}

// ── Serialization ───────────────────────────────────────────────────────────

function safeJson(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
}

const INCIDENT_INCLUDE = {
  branch: { select: { name: true } },
  student: { select: { studentNumber: true, personal: true } },
  recordedBy: { select: { fullName: true } },
} as const;

function publicIncident(row: {
  id: string; branchId: string; studentId: string; date: string; kind: string;
  severity: string; description: string; actionTaken: string | null;
  followUpNote: string | null; resolvedAt: Date | null; createdAt: Date;
  branch: { name: string };
  student: { studentNumber: string; personal: string };
  recordedBy: { fullName: string };
}) {
  const personal = safeJson(row.student.personal);
  return {
    id: row.id,
    branchId: row.branchId,
    branchName: row.branch.name,
    studentId: row.studentId,
    studentNumber: row.student.studentNumber,
    firstName: (personal.firstName as string) ?? "",
    fatherName: (personal.fatherName as string) ?? "",
    date: row.date,
    kind: row.kind,
    severity: row.severity,
    description: row.description,
    actionTaken: row.actionTaken ?? "none",
    followUpNote: row.followUpNote,
    resolvedAt: row.resolvedAt,
    recorderName: row.recordedBy.fullName,
    createdAt: row.createdAt,
  };
}

// ── Queries ─────────────────────────────────────────────────────────────────

export async function listIncidents(
  ctx: AuthContext,
  filters: {
    studentId?: string; kind?: string; severity?: string;
    resolved?: string; from?: string; to?: string;
  },
) {
  const scope = await incidentListWhere(ctx, "discipline.view");
  if (scope === null) return [];

  // Optional student narrowing (must itself be visible under view scope).
  if (filters.studentId) {
    const see = await studentDisciplineScope(ctx, "discipline.view", filters.studentId);
    if (!see.allowed) throw errors.forbidden("شما اجازهٔ مشاهدهٔ انضباط این شاگرد را ندارید.");
  }

  const rows = await db.disciplineIncident.findMany({
    where: {
      AND: [
        scope,
        ...(filters.studentId ? [{ studentId: filters.studentId }] : []),
        ...(filters.kind ? [{ kind: filters.kind }] : []),
        ...(filters.severity ? [{ severity: filters.severity }] : []),
        ...(filters.resolved !== undefined
          ? [{ resolvedAt: filters.resolved === "true" ? { not: null } : null }]
          : []),
        ...(filters.from || filters.to ? [{ date: { gte: filters.from, lte: filters.to } }] : []),
      ],
    },
    include: INCIDENT_INCLUDE,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  return rows.map(publicIncident);
}

export async function createIncident(ctx: AuthContext, dto: z.infer<typeof incidentCreateDto>) {
  const student = await db.student.findUnique({
    where: { id: dto.studentId },
    select: { id: true, status: true },
  });
  if (!student || student.status !== "active") {
    throw errors.notFound("شاگرد فعال با این شناسه پیدا نشد.");
  }

  const scope = await studentDisciplineScope(ctx, "discipline.manage", dto.studentId);
  if (!scope.allowed) {
    throw errors.forbidden("شما اجازهٔ ثبت انضباط برای این شاگرد را ندارید.");
  }
  if (!scope.branchId) {
    throw errors.badRequest("شعبهٔ مکتب این شاگرد قابل تعیین نیست — ثبت‌نام فعال ندارد.");
  }

  const org = await db.organization.findFirst({ select: { id: true } });
  if (!org) throw errors.notFound("مکتب");

  return db.$transaction(async (tx) => {
    const row = await tx.disciplineIncident.create({
      data: {
        orgId: org.id,
        branchId: scope.branchId as string,
        studentId: dto.studentId,
        date: dto.date,
        kind: dto.kind,
        severity: dto.severity,
        description: dto.description,
        actionTaken: dto.actionTaken,
        followUpNote: dto.followUpNote ?? null,
        resolvedAt: dto.resolved ? new Date() : null,
        recordedById: ctx.user.id,
      },
      include: INCIDENT_INCLUDE,
    });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "discipline.create",
      entity: "DisciplineIncident",
      entityId: row.id,
      after: { studentId: dto.studentId, date: dto.date, kind: dto.kind, severity: dto.severity },
      ip: ctx.ip,
    });
    return publicIncident(row);
  });
}

export async function updateIncident(
  ctx: AuthContext,
  incidentId: string,
  dto: z.infer<typeof incidentUpdateDto>,
) {
  const incident = await db.disciplineIncident.findUnique({ where: { id: incidentId } });
  if (!incident) throw errors.notFound("ریکارد انضباط");

  const scope = await studentDisciplineScope(ctx, "discipline.manage", incident.studentId);
  if (!scope.allowed) {
    throw errors.forbidden("شما اجازهٔ ویرایش این ریکارد انضباط را ندارید.");
  }

  return db.$transaction(async (tx) => {
    const row = await tx.disciplineIncident.update({
      where: { id: incidentId },
      data: {
        date: dto.date ?? incident.date,
        kind: dto.kind ?? incident.kind,
        severity: dto.severity ?? incident.severity,
        description: dto.description ?? incident.description,
        actionTaken: dto.actionTaken ?? incident.actionTaken,
        followUpNote: dto.followUpNote !== undefined ? dto.followUpNote : incident.followUpNote,
        resolvedAt:
          dto.resolved === undefined
            ? incident.resolvedAt
            : dto.resolved
              ? (incident.resolvedAt ?? new Date())
              : null,
      },
      include: INCIDENT_INCLUDE,
    });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "discipline.update",
      entity: "DisciplineIncident",
      entityId: incidentId,
      before: {
        kind: incident.kind, severity: incident.severity,
        resolvedAt: incident.resolvedAt, followUpNote: incident.followUpNote,
      },
      after: {
        kind: row.kind, severity: row.severity,
        resolvedAt: row.resolvedAt, followUpNote: row.followUpNote,
      },
      ip: ctx.ip,
    });
    return publicIncident(row);
  });
}

export async function deleteIncident(ctx: AuthContext, incidentId: string) {
  const incident = await db.disciplineIncident.findUnique({ where: { id: incidentId } });
  if (!incident) throw errors.notFound("ریکارد انضباط");

  const scope = await studentDisciplineScope(ctx, "discipline.manage", incident.studentId);
  if (!scope.allowed) {
    throw errors.forbidden("شما اجازهٔ حذف این ریکارد انضباط را ندارید.");
  }

  return db.$transaction(async (tx) => {
    await tx.disciplineIncident.delete({ where: { id: incidentId } });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "discipline.delete",
      entity: "DisciplineIncident",
      entityId: incidentId,
      before: {
        studentId: incident.studentId, date: incident.date, kind: incident.kind,
        severity: incident.severity, description: incident.description,
      },
      ip: ctx.ip,
    });
    return { ok: true };
  });
}
