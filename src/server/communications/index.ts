// Communications module — Phase 4: announcements with per-user read
// receipts, and the SMS/email message log.
//
// INVARIANTS:
//  - AUDIENCE: an announcement targets a branch, optionally narrowed to ONE
//    class section, and an audience ("all" | "staff" | "guardians").
//  - PUBLISHING is the gate: drafts are invisible to non-managers; only
//    PUBLISHED announcements reach the audience.
//  - READ RECEIPTS: one row per user per announcement (DB unique); the list
//    view marks "read/unread" for the CURRENT user only.
//  - BRANCH ISOLATION: staff see their branch's announcements; guardians see
//    guardian-audience announcements of the branches/sections where their
//    children study; students see "all"-audience announcements of their own
//    enrollment branch. Only admin / general_manager see every branch.
//  - MESSAGES ARE RECORDED, NOT FAKED: sendMessages writes MessageLog rows
//    with status "queued" plus an OutboxEvent. No gateway is wired in this
//    deployment — delivery is a production integration point (see
//    docs/KNOWN-LIMITATIONS.md). Nothing is ever marked "sent" locally.

import { z } from "zod";
import { db } from "@/lib/db";
import { errors } from "@/server/shared/http";
import { writeAudit, writeOutbox } from "@/server/shared/audit";
import { directBranchFilter, canAccessBranch } from "@/server/rbac/scope";
import type { AuthContext } from "@/server/auth/context";
import type { Prisma } from "@prisma/client";

// ── Labels (Dari) ───────────────────────────────────────────────────────────

export const AUDIENCES = ["all", "staff", "guardians"] as const;
export const AUDIENCE_LABELS: Record<string, string> = {
  all: "همه (کادر + اولیا)",
  staff: "فقط کادر مکتب",
  guardians: "فقط اولیا",
};

export const ANNOUNCEMENT_STATUS_LABELS: Record<string, string> = {
  draft: "پیش‌نویس",
  published: "منتشرشده",
};

export const MESSAGE_CHANNELS = ["sms", "email"] as const;
export const MESSAGE_CHANNEL_LABELS: Record<string, string> = {
  sms: "پیام متنی (SMS)",
  email: "ایمیل",
};

export const MESSAGE_STATUS_LABELS: Record<string, string> = {
  queued: "در صف ارسال",
  sent: "ارسال‌شده",
  failed: "ناموفق",
};

// ── DTOs ────────────────────────────────────────────────────────────────────

export const announcementDto = z.object({
  branchId: z.string().optional().nullable(),
  classSectionId: z.string().optional().nullable(),
  audience: z.enum(AUDIENCES).default("all"),
  title: z.string().min(3, "عنوان اعلان را وارد کنید.").max(120),
  body: z.string().min(5, "متن اعلان را وارد کنید.").max(2000),
});

export const announcementUpdateDto = announcementDto.partial();

export const announcementPublishDto = z.object({
  action: z.enum(["publish", "unpublish"]),
});

export const messageSendDto = z.object({
  branchId: z.string().optional().nullable(),
  // "guardians" | "staff" — who receives the message
  target: z.enum(["guardians", "staff"]),
  // Optional narrowing to one class section (guardians target only)
  classSectionId: z.string().optional().nullable(),
  channel: z.enum(MESSAGE_CHANNELS),
  subject: z.string().max(120).optional().nullable(),
  body: z.string().min(3, "متن پیام را وارد کنید.").max(1000),
});

// ── Branch scope resolution ─────────────────────────────────────────────────

function scopedBranchIds(ctx: AuthContext, permission: string): string[] | null | "deny" {
  const f = directBranchFilter(ctx, permission);
  if (!f) return "deny";
  return f.branchIds;
}

/** Branches whose announcements the CURRENT viewer may see (guardian path). */
async function guardianBranchIds(ctx: AuthContext): Promise<{ branchIds: string[]; sectionIds: string[] }> {
  if (!ctx.guardianId) return { branchIds: [], sectionIds: [] };
  const links = await db.studentGuardian.findMany({
    where: { guardianId: ctx.guardianId, contactRights: true },
    select: { studentId: true },
  });
  const studentIds = links.map((l) => l.studentId);
  if (studentIds.length === 0) return { branchIds: [], sectionIds: [] };
  const enrollments = await db.enrollment.findMany({
    where: { studentId: { in: studentIds }, status: "active" },
    select: { classSectionId: true, classSection: { select: { branchId: true } } },
  });
  const branchIds = new Set<string>();
  const sectionIds = new Set<string>();
  for (const e of enrollments) {
    if (e.classSection) branchIds.add(e.classSection.branchId);
    if (e.classSectionId) sectionIds.add(e.classSectionId);
  }
  return { branchIds: [...branchIds], sectionIds: [...sectionIds] };
}

/** Branches where the signed-in student account is enrolled. */
async function ownStudentBranchIds(ctx: AuthContext): Promise<string[]> {
  if (!ctx.linkedStudentId) return [];
  const enrollments = await db.enrollment.findMany({
    where: { studentId: ctx.linkedStudentId, status: "active" },
    select: { classSection: { select: { branchId: true } } },
  });
  return [...new Set(enrollments.map((e) => e.classSection?.branchId).filter((b): b is string => Boolean(b)))];
}

// ── Announcements ───────────────────────────────────────────────────────────

const ANNOUNCEMENT_INCLUDE = {
  branch: { select: { id: true, name: true } },
  classSection: {
    select: {
      id: true, label: true,
      gradeLevel: { select: { nameDari: true } },
    },
  },
  _count: { select: { reads: true } },
  reads: { where: { userId: "" }, select: { id: true } }, // replaced per-query
} as const;

function publicAnnouncement(
  row: {
    id: string; branchId: string; classSectionId: string | null; audience: string;
    title: string; body: string; status: string; publishedAt: Date | null;
    createdAt: Date; updatedAt: Date;
    branch: { id: string; name: string } | null;
    classSection: { id: string; label: string; gradeLevel: { nameDari: string } } | null;
    _count?: { reads: number };
    reads?: Array<{ id: string }>;
  },
  readByMe: boolean,
) {
  return {
    id: row.id,
    branchId: row.branchId,
    branchName: row.branch?.name ?? null,
    classSectionId: row.classSectionId,
    sectionLabel: row.classSection
      ? `${row.classSection.gradeLevel.nameDari} — ${row.classSection.label}`
      : null,
    audience: row.audience,
    audienceLabel: AUDIENCE_LABELS[row.audience] ?? row.audience,
    title: row.title,
    body: row.body,
    status: row.status,
    statusLabel: ANNOUNCEMENT_STATUS_LABELS[row.status] ?? row.status,
    publishedAt: row.publishedAt,
    readCount: row._count?.reads ?? 0,
    readByMe,
    createdAt: row.createdAt,
  };
}

export async function listAnnouncements(ctx: AuthContext, filters: { status?: string; audience?: string }) {
  const grants = ctx.grants.filter((g) => g.permission === "announcements.view");
  if (grants.length === 0) return [];

  const and: Prisma.AnnouncementWhereInput[] = [];

  if (grants.some((g) => g.scope === "all")) {
    if (ctx.branchId) and.push({ branchId: ctx.branchId });
  } else if (ctx.guardianId && grants.some((g) => g.scope === "guardian")) {
    // Guardian portal: guardian-audience announcements of the branches (and
    // optionally sections) where their children study.
    const { branchIds, sectionIds } = await guardianBranchIds(ctx);
    if (branchIds.length === 0) return [];
    and.push({ audience: { in: ["all", "guardians"] } });
    and.push({
      OR: [
        { classSectionId: null, branchId: { in: branchIds } },
        { classSectionId: { in: sectionIds } },
      ],
    });
  } else if (ctx.linkedStudentId && grants.some((g) => g.scope === "own")) {
    // Student portal: "all"-audience announcements of the own branch.
    const branchIds = await ownStudentBranchIds(ctx);
    if (branchIds.length === 0) return [];
    and.push({ audience: "all" });
    and.push({ classSectionId: null, branchId: { in: branchIds } });
  } else {
    const ids = grants
      .filter((g) => g.scope === "branch" && g.branchId)
      .map((g) => g.branchId as string);
    if (ids.length === 0) return []; // fail closed
    and.push({ branchId: { in: ids } });
  }

  // Non-managers only ever see published announcements.
  const canManage = grants.some((g) => g.permission === "announcements.manage");
  if (!canManage) and.push({ status: "published" });
  if (filters.status) and.push({ status: filters.status });
  if (filters.audience) and.push({ audience: filters.audience });

  const rows = await db.announcement.findMany({
    where: { AND: and },
    include: {
      branch: { select: { id: true, name: true } },
      classSection: {
        select: { id: true, label: true, gradeLevel: { select: { nameDari: true } } },
      },
      _count: { select: { reads: true } },
      reads: { where: { userId: ctx.user.id }, select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rows.map((r) => publicAnnouncement(r, (r.reads ?? []).length > 0));
}

export async function createAnnouncement(ctx: AuthContext, dto: z.infer<typeof announcementDto>) {
  const org = await db.organization.findFirst({ select: { id: true } });
  if (!org) throw errors.notFound("مکتب");
  const branch = await db.branch.findFirst({
    where: dto.branchId ? { id: dto.branchId } : { id: ctx.branchId ?? undefined },
    select: { id: true, isActive: true },
  });
  if (!branch || !branch.isActive) throw errors.notFound("شعبهٔ مکتب");
  if (!canAccessBranch(ctx, "announcements.manage", branch.id)) {
    throw errors.forbidden("این عمل روی شعبهٔ دیگری مجاز نیست.");
  }
  let sectionBranch: string | null = null;
  if (dto.classSectionId) {
    const section = await db.classSection.findUnique({
      where: { id: dto.classSectionId },
      select: { branchId: true, academicYearId: true },
    });
    if (!section) throw errors.notFound("شعبهٔ صنفی");
    if (section.branchId !== branch.id) {
      throw errors.badRequest("شعبهٔ صنفی انتخاب‌شده به این شعبهٔ مکتب تعلق ندارد.");
    }
    sectionBranch = section.branchId;
    void sectionBranch;
  }
  return db.$transaction(async (tx) => {
    const row = await tx.announcement.create({
      data: {
        orgId: org.id,
        branchId: branch.id,
        classSectionId: dto.classSectionId ?? null,
        audience: dto.audience,
        title: dto.title,
        body: dto.body,
        status: "draft",
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "announcement.create", entity: "Announcement", entityId: row.id,
      after: { title: row.title, audience: row.audience, branchId: branch.id },
      ip: ctx.ip,
    });
    return { id: row.id, status: row.status };
  });
}

export async function updateAnnouncement(ctx: AuthContext, id: string, dto: z.infer<typeof announcementUpdateDto>) {
  const row = await db.announcement.findUnique({ where: { id } });
  if (!row) throw errors.notFound("اعلان");
  if (!canAccessBranch(ctx, "announcements.manage", row.branchId)) {
    throw errors.forbidden("این اعلان به شعبهٔ دیگری تعلق دارد.");
  }
  if (row.status === "published") {
    throw errors.badRequest("اعلان منتشرشده قابل ویرایش نیست؛ ابتدا آن را از انتشار بردارید.");
  }
  const updated = await db.$transaction(async (tx) => {
    const next = await tx.announcement.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.audience !== undefined ? { audience: dto.audience } : {}),
        ...(dto.classSectionId !== undefined ? { classSectionId: dto.classSectionId ?? null } : {}),
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "announcement.update", entity: "Announcement", entityId: id,
      before: { title: row.title },
      after: { title: next.title },
      ip: ctx.ip,
    });
    return next;
  });
  return { id: updated.id, status: updated.status };
}

export async function setAnnouncementStatus(
  ctx: AuthContext,
  id: string,
  dto: z.infer<typeof announcementPublishDto>,
) {
  const row = await db.announcement.findUnique({ where: { id } });
  if (!row) throw errors.notFound("اعلان");
  if (!canAccessBranch(ctx, "announcements.manage", row.branchId)) {
    throw errors.forbidden("این اعلان به شعبهٔ دیگری تعلق دارد.");
  }
  if (dto.action === "publish" && row.status === "published") {
    throw errors.badRequest("این اعلان قبلاً منتشر شده است.");
  }
  if (dto.action === "unpublish" && row.status === "draft") {
    throw errors.badRequest("این اعلان منتشر نشده است.");
  }
  await db.$transaction(async (tx) => {
    await tx.announcement.update({
      where: { id },
      data:
        dto.action === "publish"
          ? { status: "published", publishedById: ctx.user.id, publishedAt: new Date() }
          : { status: "draft" },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: `announcement.${dto.action}`, entity: "Announcement", entityId: id,
      before: { status: row.status },
      after: { status: dto.action === "publish" ? "published" : "draft" },
      ip: ctx.ip,
    });
    if (dto.action === "publish") {
      // Fanout hook: a worker may push notifications/SMS for this event.
      await writeOutbox(tx, "announcement.published", {
        announcementId: id,
        branchId: row.branchId,
        audience: row.audience,
      });
    }
  });
  return { ok: true };
}

export async function markAnnouncementRead(ctx: AuthContext, id: string) {
  const row = await db.announcement.findUnique({ where: { id } });
  if (!row) throw errors.notFound("اعلان");
  if (row.status !== "published") {
    throw errors.badRequest("فقط اعلان‌های منتشرشده قابل خواندن هستند.");
  }
  // Visibility check mirrors listAnnouncements.
  const grants = ctx.grants.filter((g) => g.permission === "announcements.view");
  if (grants.length === 0) throw errors.forbidden();
  if (grants.some((g) => g.scope === "all")) {
    // cross-branch roles see everything
  } else if (ctx.guardianId && grants.some((g) => g.scope === "guardian")) {
    const { branchIds, sectionIds } = await guardianBranchIds(ctx);
    const ok =
      (row.classSectionId === null && branchIds.includes(row.branchId)) ||
      (row.classSectionId !== null && sectionIds.includes(row.classSectionId));
    if (!ok) throw errors.forbidden("این اعلان به شما تعلق ندارد.");
  } else if (ctx.linkedStudentId && grants.some((g) => g.scope === "own")) {
    const branchIds = await ownStudentBranchIds(ctx);
    if (!branchIds.includes(row.branchId)) throw errors.forbidden("این اعلان به شما تعلق ندارد.");
  } else {
    const ids = grants
      .filter((g) => g.scope === "branch" && g.branchId)
      .map((g) => g.branchId as string);
    if (!ids.includes(row.branchId)) throw errors.forbidden("این اعلان به شعبهٔ دیگری تعلق دارد.");
  }
  // Idempotent read receipt (DB unique keeps one row per user).
  await db.announcementRead.upsert({
    where: { announcementId_userId: { announcementId: id, userId: ctx.user.id } },
    create: { announcementId: id, userId: ctx.user.id },
    update: {},
  });
  return { ok: true };
}

// ── Messages (SMS/email log) ────────────────────────────────────────────────

export async function listMessages(ctx: AuthContext, filters: { channel?: string; status?: string }) {
  const ids = scopedBranchIds(ctx, "announcements.manage");
  if (ids === "deny") return [];
  const where: Prisma.MessageLogWhereInput = {
    AND: [
      ids === null ? {} : { OR: [{ branchId: null }, { branchId: { in: ids } }] },
      ...(filters.channel ? [{ channel: filters.channel }] : []),
      ...(filters.status ? [{ status: filters.status }] : []),
    ],
  };
  const rows = await db.messageLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rows.map((m) => ({
    id: m.id,
    branchId: m.branchId,
    channel: m.channel,
    channelLabel: MESSAGE_CHANNEL_LABELS[m.channel] ?? m.channel,
    recipient: m.recipient,
    subject: m.subject,
    body: m.body,
    status: m.status,
    statusLabel: MESSAGE_STATUS_LABELS[m.status] ?? m.status,
    error: m.error,
    relatedType: m.relatedType,
    relatedId: m.relatedId,
    createdAt: m.createdAt,
    sentAt: m.sentAt,
  }));
}

/** Recipients for a guardians-target send: primary contact phones of the
 *  guardians of active students in the branch (optionally one section). */
async function guardianRecipients(branchId: string, sectionId?: string | null): Promise<string[]> {
  const students = await db.student.findMany({
    where: {
      status: "active",
      enrollments: {
        some: {
          status: "active",
          classSection: sectionId ? { id: sectionId, branchId } : { branchId },
        },
      },
    },
    select: { id: true },
  });
  const studentIds = students.map((s) => s.id);
  if (studentIds.length === 0) return [];
  const guardianLinks = await db.studentGuardian.findMany({
    where: { studentId: { in: studentIds }, contactRights: true },
    select: { guardianId: true },
  });
  const guardianIds = [...new Set(guardianLinks.map((l) => l.guardianId))];
  if (guardianIds.length === 0) return [];
  const guardians = await db.guardian.findMany({
    where: { id: { in: guardianIds } },
    select: { phone: true, phone2: true },
  });
  const phones = new Set<string>();
  for (const g of guardians) {
    if (g.phone) phones.add(g.phone);
    if (g.phone2) phones.add(g.phone2);
  }
  return [...phones];
}

/** Recipients for a staff-target send: active portal users bound to the
 *  branch (UserRole.branchId = branch) with a phone on file. */
async function staffRecipients(branchId: string): Promise<string[]> {
  const roleRows = await db.userRole.findMany({
    where: { branchId },
    select: { userId: true },
  });
  const userIds = [...new Set(roleRows.map((r) => r.userId))];
  if (userIds.length === 0) return [];
  const users = await db.user.findMany({
    where: { id: { in: userIds }, isActive: true },
    select: { phone: true, email: true },
  });
  const out = new Set<string>();
  for (const u of users) {
    if (u.phone) out.add(u.phone);
    if (u.email) out.add(u.email);
  }
  return [...out];
}

export async function sendMessages(ctx: AuthContext, dto: z.infer<typeof messageSendDto>) {
  const org = await db.organization.findFirst({ select: { id: true } });
  if (!org) throw errors.notFound("مکتب");
  const branch = await db.branch.findFirst({
    where: dto.branchId ? { id: dto.branchId } : { id: ctx.branchId ?? undefined },
    select: { id: true, isActive: true },
  });
  if (!branch || !branch.isActive) throw errors.notFound("شعبهٔ مکتب");
  if (!canAccessBranch(ctx, "announcements.manage", branch.id)) {
    throw errors.forbidden("این عمل روی شعبهٔ دیگری مجاز نیست.");
  }

  let recipients: string[] = [];
  if (dto.target === "guardians") {
    recipients = await guardianRecipients(branch.id, dto.classSectionId ?? null);
  } else {
    recipients = (await staffRecipients(branch.id)).filter((r) =>
      dto.channel === "sms" ? r.startsWith("+") : r.includes("@"),
    );
  }
  if (dto.channel === "email") {
    recipients = recipients.filter((r) => r.includes("@"));
  } else {
    recipients = recipients.filter((r) => r.startsWith("+"));
  }
  if (recipients.length === 0) {
    throw errors.badRequest(
      dto.target === "guardians"
        ? "هیچ شمارهٔ تماس برای اولیا این شعبه ثبت نشده است."
        : "هیچ مخاطب مناسب برای کادر این شعبه ثبت نشده است.",
    );
  }

  await db.$transaction(async (tx) => {
    for (const recipient of recipients) {
      await tx.messageLog.create({
        data: {
          orgId: org.id,
          branchId: branch.id,
          channel: dto.channel,
          recipient,
          subject: dto.subject ?? null,
          body: dto.body,
          status: "queued",
          sentById: ctx.user.id,
        },
      });
    }
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "messages.send", entity: "MessageLog", entityId: branch.id,
      after: { target: dto.target, channel: dto.channel, count: recipients.length, sectionId: dto.classSectionId ?? null },
      ip: ctx.ip,
    });
    // The outbox worker delivers these in production; nothing is faked here.
    await writeOutbox(tx, "messages.queued", {
      target: dto.target,
      channel: dto.channel,
      branchId: branch.id,
      count: recipients.length,
    });
  });

  return { queuedCount: recipients.length, channel: dto.channel };
}
