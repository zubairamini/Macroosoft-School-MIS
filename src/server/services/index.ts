// Services module — Phase 5: transport routes & passengers, inventory
// (انبار) with an append-only movement ledger, the guest register and the
// event calendar.
//
// INVARIANTS:
//  - BRANCH ISOLATION: transport/inventory/guest rows carry a concrete
//    branchId; branch roles see only their own branch. SchoolEvent with
//    branchId null is org-wide and visible to every branch. Only admin /
//    general_manager cross branch boundaries.
//  - STOCK IS A LEDGER: every receive/issue appends an InventoryMovement
//    row and updates item.quantity in the SAME transaction; issuing more
//    than available aborts. Movements are never edited or deleted.
//  - CAPACITY: a transport route's ACTIVE passengers cannot exceed capacity
//    (transactional count check).
//  - GUEST REGISTER: arrival is an instant; checkout stamps leftAt —
//    records are closed, never deleted.

import { z } from "zod";
import { db } from "@/lib/db";
import { errors } from "@/server/shared/http";
import { writeAudit } from "@/server/shared/audit";
import { directBranchFilter, canAccessBranch } from "@/server/rbac/scope";
import { dateInput } from "@/server/academic";
import type { AuthContext } from "@/server/auth/context";
import type { Prisma } from "@prisma/client";

// ── Labels (Dari) ───────────────────────────────────────────────────────────

export const TRANSPORT_PASSENGER_STATUS_LABELS: Record<string, string> = {
  active: "فعال",
  stopped: "توقف‌شده",
};

export const EVENT_KINDS = ["meeting", "exam", "holiday", "ceremony", "other"] as const;
export const EVENT_KIND_LABELS: Record<string, string> = {
  meeting: "جلسه",
  exam: "امتحان",
  holiday: "رخصتی",
  ceremony: "مراسم",
  other: "دیگر",
};

// ── Branch scope helper ─────────────────────────────────────────────────────

function scopedBranchIds(ctx: AuthContext, permission: string): string[] | null | "deny" {
  const f = directBranchFilter(ctx, permission);
  if (!f) return "deny";
  return f.branchIds;
}

/** Branch the service action should record/be limited to. */
async function resolveActionBranch(
  ctx: AuthContext,
  permission: string,
  requested?: string | null,
): Promise<string> {
  if (requested) {
    const branch = await db.branch.findUnique({ where: { id: requested } });
    if (!branch || !branch.isActive) throw errors.notFound("شعبهٔ مکتب");
    if (!canAccessBranch(ctx, permission, requested)) {
      throw errors.forbidden("این عمل روی شعبهٔ دیگری مجاز نیست.");
    }
    return requested;
  }
  if (!ctx.isCrossBranch) {
    if (!ctx.branchId) {
      throw errors.badRequest("شعبهٔ مکتب شما هنوز مشخص نشده است؛ با مدیر سیستم تماس بگیرید.");
    }
    return ctx.branchId;
  }
  if (ctx.branchId) return ctx.branchId;
  throw errors.badRequest("برای این عمل، شعبهٔ مکتب را انتخاب کنید.");
}

// ── Transport ───────────────────────────────────────────────────────────────

export const transportRouteDto = z.object({
  branchId: z.string().optional().nullable(),
  name: z.string().min(3, "نام مسیر را وارد کنید.").max(80),
  driverName: z.string().max(80).optional().nullable(),
  vehicle: z.string().max(80).optional().nullable(),
  capacity: z.coerce.number().int().min(1, "ظرفیت باید بیشتر از صفر باشد.").max(80),
  monthlyFeeDiram: z.coerce.number().int().min(0).max(10_000_000).default(0),
  stops: z.array(z.string().max(60)).max(20).default([]),
  note: z.string().max(200).optional().nullable(),
});

export const transportRouteUpdateDto = transportRouteDto.partial().extend({
  isActive: z.boolean().optional(),
});

export const transportPassengerDto = z.object({
  // Optional when posted under /services/transport/[id]/passengers — the
  // path segment supplies the route id.
  routeId: z.string().optional(),
  studentId: z.string().min(1, "شاگرد را انتخاب کنید."),
  stopName: z.string().max(60).optional().nullable(),
  note: z.string().max(200).optional().nullable(),
});

export const transportPassengerUpdateDto = z.object({
  status: z.enum(["active", "stopped"]),
  stopName: z.string().max(60).optional().nullable(),
  note: z.string().max(200).optional().nullable(),
});

function publicRoute(row: {
  id: string; branchId: string; name: string; driverName: string | null; vehicle: string | null;
  capacity: number; monthlyFeeDiram: number; stops: string; isActive: boolean; note: string | null;
  createdAt: Date;
  _count?: { passengers: number };
}) {
  let stops: string[] = [];
  try { stops = JSON.parse(row.stops ?? "[]"); } catch { /* noop */ }
  return {
    id: row.id,
    branchId: row.branchId,
    name: row.name,
    driverName: row.driverName,
    vehicle: row.vehicle,
    capacity: row.capacity,
    monthlyFeeDiram: row.monthlyFeeDiram,
    stops,
    isActive: row.isActive,
    note: row.note,
    activePassengers: row._count?.passengers ?? 0,
  };
}

export async function listTransportRoutes(ctx: AuthContext, filters: { isActive?: string }) {
  const ids = scopedBranchIds(ctx, "services.view");
  if (ids === "deny") return [];
  const rows = await db.transportRoute.findMany({
    where: {
      AND: [
        ids === null ? {} : { branchId: { in: ids } },
        ...(filters.isActive !== undefined ? [{ isActive: filters.isActive === "true" }] : []),
      ],
    },
    include: { _count: { select: { passengers: { where: { status: "active" } } } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(publicRoute);
}

export async function createTransportRoute(ctx: AuthContext, dto: z.infer<typeof transportRouteDto>) {
  const org = await db.organization.findFirst({ select: { id: true } });
  if (!org) throw errors.notFound("مکتب");
  const branchId = await resolveActionBranch(ctx, "services.manage", dto.branchId);
  const duplicate = await db.transportRoute.findFirst({ where: { branchId, name: dto.name } });
  if (duplicate) throw errors.conflict("مسیری با همین نام در این شعبه قبلاً ثبت شده است.");
  return db.$transaction(async (tx) => {
    const row = await tx.transportRoute.create({
      data: {
        orgId: org.id,
        branchId,
        name: dto.name,
        driverName: dto.driverName ?? null,
        vehicle: dto.vehicle ?? null,
        capacity: dto.capacity,
        monthlyFeeDiram: dto.monthlyFeeDiram,
        stops: JSON.stringify(dto.stops ?? []),
        note: dto.note ?? null,
        createdById: ctx.user.id,
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "transport.route.create", entity: "TransportRoute", entityId: row.id,
      after: { name: row.name, capacity: row.capacity, branchId },
      ip: ctx.ip,
    });
    return publicRoute({ ...row, _count: { passengers: 0 } });
  });
}

export async function updateTransportRoute(ctx: AuthContext, id: string, dto: z.infer<typeof transportRouteUpdateDto>) {
  const row = await db.transportRoute.findUnique({
    where: { id },
    include: { _count: { select: { passengers: { where: { status: "active" } } } } },
  });
  if (!row) throw errors.notFound("مسیر ترانسپورت");
  if (!canAccessBranch(ctx, "services.manage", row.branchId)) {
    throw errors.forbidden("این مسیر به شعبهٔ دیگری تعلق دارد.");
  }
  if (dto.isActive === true && row.isActive === false) {
    throw errors.badRequest("مسیر غیرفعال را نمی‌توان دوباره فعال کرد؛ مسیر جدید ثبت کنید.");
  }
  const updated = await db.$transaction(async (tx) => {
    const next = await tx.transportRoute.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.driverName !== undefined ? { driverName: dto.driverName ?? null } : {}),
        ...(dto.vehicle !== undefined ? { vehicle: dto.vehicle ?? null } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.monthlyFeeDiram !== undefined ? { monthlyFeeDiram: dto.monthlyFeeDiram } : {}),
        ...(dto.stops !== undefined ? { stops: JSON.stringify(dto.stops) } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.note !== undefined ? { note: dto.note ?? null } : {}),
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "transport.route.update", entity: "TransportRoute", entityId: id,
      before: { name: row.name, isActive: row.isActive },
      after: { name: next.name, isActive: next.isActive },
      ip: ctx.ip,
    });
    return next;
  });
  return publicRoute({ ...updated, _count: row._count });
}

const PASSENGER_INCLUDE = {
  route: { select: { id: true, name: true, capacity: true, branchId: true } },
  student: { select: { id: true, studentNumber: true, personal: true } },
} as const;

function publicPassenger(row: {
  id: string; routeId: string; studentId: string; stopName: string | null; status: string;
  note: string | null; createdAt: Date;
  route: { id: string; name: string; capacity: number; branchId: string };
  student: { id: string; studentNumber: string; personal: string } | null;
}) {
  let firstName = "";
  let fatherName = "";
  try {
    const p = JSON.parse(row.student?.personal ?? "{}");
    firstName = p.firstName ?? "";
    fatherName = p.fatherName ?? "";
  } catch { /* noop */ }
  return {
    id: row.id,
    routeId: row.routeId,
    routeName: row.route.name,
    studentId: row.studentId,
    studentNumber: row.student?.studentNumber ?? "",
    studentName: firstName,
    fatherName,
    stopName: row.stopName,
    status: row.status,
    statusLabel: TRANSPORT_PASSENGER_STATUS_LABELS[row.status] ?? row.status,
    note: row.note,
    createdAt: row.createdAt,
  };
}

export async function listPassengers(ctx: AuthContext, filters: { routeId?: string; status?: string }) {
  const ids = scopedBranchIds(ctx, "services.view");
  if (ids === "deny") return [];
  const rows = await db.transportPassenger.findMany({
    where: {
      AND: [
        ids === null ? {} : { route: { branchId: { in: ids } } },
        ...(filters.routeId ? [{ routeId: filters.routeId }] : []),
        ...(filters.status ? [{ status: filters.status }] : []),
      ],
    },
    include: PASSENGER_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return rows.map(publicPassenger);
}

export async function addPassenger(ctx: AuthContext, dto: z.infer<typeof transportPassengerDto>) {
  const route = await db.transportRoute.findUnique({ where: { id: dto.routeId } });
  if (!route) throw errors.notFound("مسیر ترانسپورت");
  if (!route.isActive) throw errors.badRequest("این مسیر غیرفعال است.");
  if (!canAccessBranch(ctx, "services.manage", route.branchId)) {
    throw errors.forbidden("این مسیر به شعبهٔ دیگری تعلق دارد.");
  }
  const student = await db.student.findUnique({ where: { id: dto.studentId } });
  if (!student) throw errors.notFound("شاگرد");
  if (student.status !== "active") throw errors.badRequest("فقط شاگردان فعال قابل ثبت‌اند.");
  const year = await db.academicYear.findFirst({ where: { orgId: student.orgId, isCurrent: true } });
  if (!year) throw errors.badRequest("سال تعلیمی جاری پیدا نشد.");
  const enrollment = await db.enrollment.findFirst({
    where: {
      studentId: student.id,
      academicYearId: year.id,
      status: "active",
      classSection: { branchId: route.branchId },
    },
    select: { id: true },
  });
  if (!enrollment) {
    throw errors.badRequest("این شاگرد در شعبهٔ این مسیر ثبت نشده است.");
  }
  const existing = await db.transportPassenger.findUnique({
    where: { routeId_studentId: { routeId: route.id, studentId: student.id } },
  });
  if (existing && existing.status === "active") {
    throw errors.conflict("این شاگرد قبلاً در این مسیر ثبت شده است.");
  }

  return db.$transaction(async (tx) => {
    // Capacity check inside the transaction — concurrent adds that would
    // exceed capacity abort here.
    const activeCount = await tx.transportPassenger.count({
      where: { routeId: route.id, status: "active" },
    });
    if (activeCount >= route.capacity) {
      throw errors.conflict("ظرفیت این مسیر تکمیل است.");
    }
    const row = existing
      ? await tx.transportPassenger.update({
          where: { id: existing.id },
          data: { status: "active", stoppedAt: null, stopName: dto.stopName ?? null, note: dto.note ?? null },
          include: PASSENGER_INCLUDE,
        })
      : await tx.transportPassenger.create({
          data: {
            routeId: route.id,
            studentId: student.id,
            stopName: dto.stopName ?? null,
            status: "active",
            note: dto.note ?? null,
          },
          include: PASSENGER_INCLUDE,
        });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "transport.passenger.add", entity: "TransportPassenger", entityId: row.id,
      after: { routeId: route.id, studentId: student.id },
      ip: ctx.ip,
    });
    return publicPassenger(row);
  });
}

export async function updatePassenger(ctx: AuthContext, id: string, dto: z.infer<typeof transportPassengerUpdateDto>) {
  const row = await db.transportPassenger.findUnique({ where: { id }, include: PASSENGER_INCLUDE });
  if (!row) throw errors.notFound("مسافر");
  if (!canAccessBranch(ctx, "services.manage", row.route.branchId)) {
    throw errors.forbidden("این مسافر به شعبهٔ دیگری تعلق دارد.");
  }
  const updated = await db.$transaction(async (tx) => {
    const next = await tx.transportPassenger.update({
      where: { id },
      data: {
        ...(dto.status !== undefined
          ? { status: dto.status, stoppedAt: dto.status === "stopped" ? new Date() : null }
          : {}),
        ...(dto.stopName !== undefined ? { stopName: dto.stopName ?? null } : {}),
        ...(dto.note !== undefined ? { note: dto.note ?? null } : {}),
      },
      include: PASSENGER_INCLUDE,
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "transport.passenger.update", entity: "TransportPassenger", entityId: id,
      before: { status: row.status },
      after: { status: next.status },
      ip: ctx.ip,
    });
    return next;
  });
  return publicPassenger(updated);
}

// ── Inventory (انبار) ───────────────────────────────────────────────────────

export const inventoryItemDto = z.object({
  branchId: z.string().optional().nullable(),
  name: z.string().min(2, "نام قلم را وارد کنید.").max(80),
  unit: z.string().min(1).max(20).default("عدد"),
  minQuantity: z.coerce.number().int().min(0).max(100_000).default(0),
  note: z.string().max(200).optional().nullable(),
});

export const inventoryMovementDto = z.object({
  delta: z.coerce.number().int("مقدار باید عدد صحیح باشد.").refine((v) => v !== 0, {
    message: "مقدار باید مثبت (ورود) یا منفی (صرف) باشد.",
  }),
  reason: z.string().min(3, "دلیل را بنویسید.").max(120),
});

function publicItem(row: {
  id: string; branchId: string; name: string; unit: string; quantity: number;
  minQuantity: number; isActive: boolean; note: string | null; createdAt: Date;
}) {
  return {
    id: row.id,
    branchId: row.branchId,
    name: row.name,
    unit: row.unit,
    quantity: row.quantity,
    minQuantity: row.minQuantity,
    isLow: row.quantity <= row.minQuantity,
    isActive: row.isActive,
    note: row.note,
  };
}

export async function listInventoryItems(ctx: AuthContext) {
  const ids = scopedBranchIds(ctx, "services.view");
  if (ids === "deny") return [];
  const rows = await db.inventoryItem.findMany({
    where: ids === null ? {} : { branchId: { in: ids } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(publicItem);
}

export async function createInventoryItem(ctx: AuthContext, dto: z.infer<typeof inventoryItemDto>) {
  const org = await db.organization.findFirst({ select: { id: true } });
  if (!org) throw errors.notFound("مکتب");
  const branchId = await resolveActionBranch(ctx, "services.manage", dto.branchId);
  const duplicate = await db.inventoryItem.findFirst({ where: { branchId, name: dto.name } });
  if (duplicate) throw errors.conflict("قلمی با همین نام در این شعبه قبلاً ثبت شده است.");
  return db.$transaction(async (tx) => {
    // Items are created with zero stock; the FIRST movement receives stock.
    const row = await tx.inventoryItem.create({
      data: {
        orgId: org.id,
        branchId,
        name: dto.name,
        unit: dto.unit,
        quantity: 0,
        minQuantity: dto.minQuantity,
        note: dto.note ?? null,
        createdById: ctx.user.id,
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "inventory.item.create", entity: "InventoryItem", entityId: row.id,
      after: { name: row.name, unit: row.unit, branchId },
      ip: ctx.ip,
    });
    return publicItem(row);
  });
}

export async function listMovements(ctx: AuthContext, itemId: string) {
  const item = await db.inventoryItem.findUnique({ where: { id: itemId } });
  if (!item) throw errors.notFound("قلم انبار");
  const ids = scopedBranchIds(ctx, "services.view");
  if (ids !== null && !(ids as string[]).includes(item.branchId)) {
    throw errors.forbidden("این قلم به شعبهٔ دیگری تعلق دارد.");
  }
  const rows = await db.inventoryMovement.findMany({
    where: { itemId },
    orderBy: { at: "desc" },
    take: 100,
  });
  return rows.map((m) => ({
    id: m.id,
    itemId: m.itemId,
    delta: m.delta,
    reason: m.reason,
    at: m.at,
  }));
}

export async function recordMovement(ctx: AuthContext, itemId: string, dto: z.infer<typeof inventoryMovementDto>) {
  const item = await db.inventoryItem.findUnique({ where: { id: itemId } });
  if (!item) throw errors.notFound("قلم انبار");
  if (!item.isActive) throw errors.badRequest("این قلم غیرفعال است.");
  if (!canAccessBranch(ctx, "services.manage", item.branchId)) {
    throw errors.forbidden("این قلم به شعبهٔ دیگری تعلق دارد.");
  }
  return db.$transaction(async (tx) => {
    // Conditional quantity guard: issuing more than available updates 0
    // rows and aborts — the stock can never go negative.
    const updated = await tx.inventoryItem.updateMany({
      where: { id: item.id, quantity: { gte: -dto.delta } },
      data: { quantity: { increment: dto.delta } },
    });
    if (updated.count === 0) {
      throw errors.conflict("موجودی انبار کافی نیست؛ این مقدار را نمی‌توان صرف کرد.");
    }
    const movement = await tx.inventoryMovement.create({
      data: {
        itemId: item.id,
        delta: dto.delta,
        reason: dto.reason,
        byId: ctx.user.id,
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: dto.delta > 0 ? "inventory.receive" : "inventory.issue",
      entity: "InventoryItem", entityId: item.id,
      after: { delta: dto.delta, reason: dto.reason },
      ip: ctx.ip,
    });
    const fresh = await tx.inventoryItem.findUnique({ where: { id: item.id } });
    return { movement, item: publicItem(fresh ?? item) };
  });
}

// ── Guest register (ثبت مهمان‌ها) ───────────────────────────────────────────

export const guestVisitDto = z.object({
  branchId: z.string().optional().nullable(),
  fullName: z.string().min(3, "نام مهمان را وارد کنید.").max(80),
  purpose: z.string().min(3, "هدف از آمدن را بنویسید.").max(120),
  hostName: z.string().max(80).optional().nullable(),
  idNumber: z.string().max(40).optional().nullable(),
  visitorCount: z.coerce.number().int().min(1).max(20).default(1),
  note: z.string().max(200).optional().nullable(),
});

export const guestCheckoutDto = z.object({
  note: z.string().max(200).optional().nullable(),
});

function publicGuest(row: {
  id: string; branchId: string; fullName: string; purpose: string; hostName: string | null;
  idNumber: string | null; visitorCount: number; arrivedAt: Date; leftAt: Date | null;
  note: string | null; createdAt: Date;
}) {
  return {
    id: row.id,
    branchId: row.branchId,
    fullName: row.fullName,
    purpose: row.purpose,
    hostName: row.hostName,
    idNumber: row.idNumber,
    visitorCount: row.visitorCount,
    arrivedAt: row.arrivedAt,
    leftAt: row.leftAt,
    isInside: row.leftAt === null,
    note: row.note,
  };
}

export async function listGuests(ctx: AuthContext, filters: { inside?: string; from?: string; to?: string }) {
  const ids = scopedBranchIds(ctx, "services.view");
  if (ids === "deny") return [];
  const rows = await db.guestVisit.findMany({
    where: {
      AND: [
        ids === null ? {} : { branchId: { in: ids } },
        ...(filters.inside !== undefined ? [{ leftAt: filters.inside === "true" ? null : { not: null } }] : []),
      ],
    },
    orderBy: { arrivedAt: "desc" },
    take: 200,
  });
  return rows.map(publicGuest);
}

export async function createGuestVisit(ctx: AuthContext, dto: z.infer<typeof guestVisitDto>) {
  const org = await db.organization.findFirst({ select: { id: true } });
  if (!org) throw errors.notFound("مکتب");
  const branchId = await resolveActionBranch(ctx, "services.manage", dto.branchId);
  return db.$transaction(async (tx) => {
    const row = await tx.guestVisit.create({
      data: {
        orgId: org.id,
        branchId,
        fullName: dto.fullName,
        purpose: dto.purpose,
        hostName: dto.hostName ?? null,
        idNumber: dto.idNumber ?? null,
        visitorCount: dto.visitorCount,
        arrivedAt: new Date(),
        note: dto.note ?? null,
        createdById: ctx.user.id,
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "guest.arrive", entity: "GuestVisit", entityId: row.id,
      after: { fullName: row.fullName, purpose: row.purpose, branchId },
      ip: ctx.ip,
    });
    return publicGuest(row);
  });
}

export async function checkoutGuest(ctx: AuthContext, id: string, dto: z.infer<typeof guestCheckoutDto>) {
  const row = await db.guestVisit.findUnique({ where: { id } });
  if (!row) throw errors.notFound("مهمان");
  if (!canAccessBranch(ctx, "services.manage", row.branchId)) {
    throw errors.forbidden("این ثبت به شعبهٔ دیگری تعلق دارد.");
  }
  if (row.leftAt !== null) throw errors.badRequest("خروج این مهمان قبلاً ثبت شده است.");
  const updated = await db.$transaction(async (tx) => {
    const next = await tx.guestVisit.update({
      where: { id },
      data: { leftAt: new Date(), ...(dto.note !== undefined ? { note: dto.note ?? row.note } : {}) },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "guest.leave", entity: "GuestVisit", entityId: id,
      before: { leftAt: null },
      after: { leftAt: next.leftAt },
      ip: ctx.ip,
    });
    return next;
  });
  return publicGuest(updated);
}

// ── Event calendar (تقویم رویدادها) ─────────────────────────────────────────

const schoolEventBase = z.object({
  branchId: z.string().optional().nullable(), // null = org-wide event
  title: z.string().min(3, "عنوان رویداد را وارد کنید.").max(120),
  kind: z.enum(EVENT_KINDS).default("other"),
  startsOn: dateInput,
  endsOn: dateInput.optional().nullable(),
  note: z.string().max(200).optional().nullable(),
});

export const schoolEventDto = schoolEventBase.refine((d) => !d.endsOn || d.endsOn >= d.startsOn, {
  message: "تاریخ خاتمه نمی‌تواند قبل از شروع باشد.",
  path: ["endsOn"],
});

// Partial updates re-validate the date order server-side (updateEvent).
export const schoolEventUpdateDto = schoolEventBase.partial();

function publicEvent(row: {
  id: string; branchId: string | null; title: string; kind: string; startsOn: string;
  endsOn: string | null; note: string | null; createdAt: Date;
}) {
  return {
    id: row.id,
    branchId: row.branchId,
    title: row.title,
    kind: row.kind,
    kindLabel: EVENT_KIND_LABELS[row.kind] ?? row.kind,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    note: row.note,
  };
}

export async function listEvents(ctx: AuthContext, filters: { from?: string; kind?: string }) {
  const ids = scopedBranchIds(ctx, "services.view");
  if (ids === "deny") return [];
  // Org-wide events (branchId null) are visible to every branch.
  const where: Prisma.SchoolEventWhereInput = {
    AND: [
      ids === null ? {} : { OR: [{ branchId: null }, { branchId: { in: ids } }] },
      ...(filters.from ? [{ startsOn: { gte: filters.from } }] : []),
      ...(filters.kind ? [{ kind: filters.kind }] : []),
    ],
  };
  const rows = await db.schoolEvent.findMany({
    where,
    orderBy: { startsOn: "asc" },
    take: 200,
  });
  return rows.map(publicEvent);
}

export async function createEvent(ctx: AuthContext, dto: z.infer<typeof schoolEventDto>) {
  const org = await db.organization.findFirst({ select: { id: true } });
  if (!org) throw errors.notFound("مکتب");
  let branchId: string | null = null;
  if (dto.branchId) {
    branchId = await resolveActionBranch(ctx, "services.manage", dto.branchId);
  } else if (!ctx.isCrossBranch) {
    // Branch-bound roles always file events under their own branch.
    branchId = await resolveActionBranch(ctx, "services.manage", null);
  }
  if (dto.endsOn && dto.endsOn < dto.startsOn) {
    throw errors.badRequest("تاریخ خاتمه نمی‌تواند قبل از شروع باشد.");
  }
  return db.$transaction(async (tx) => {
    const row = await tx.schoolEvent.create({
      data: {
        orgId: org.id,
        branchId,
        title: dto.title,
        kind: dto.kind,
        startsOn: dto.startsOn,
        endsOn: dto.endsOn ?? null,
        note: dto.note ?? null,
        createdById: ctx.user.id,
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "event.create", entity: "SchoolEvent", entityId: row.id,
      after: { title: row.title, startsOn: row.startsOn, branchId },
      ip: ctx.ip,
    });
    return publicEvent(row);
  });
}

export async function updateEvent(ctx: AuthContext, id: string, dto: z.infer<typeof schoolEventUpdateDto>) {
  const row = await db.schoolEvent.findUnique({ where: { id } });
  if (!row) throw errors.notFound("رویداد");
  if (row.branchId && !canAccessBranch(ctx, "services.manage", row.branchId)) {
    throw errors.forbidden("این رویداد به شعبهٔ دیگری تعلق دارد.");
  }
  const startsOn = dto.startsOn ?? row.startsOn;
  const endsOn = dto.endsOn !== undefined ? dto.endsOn : row.endsOn;
  if (endsOn && endsOn < startsOn) {
    throw errors.badRequest("تاریخ خاتمه نمی‌تواند قبل از شروع باشد.");
  }
  const updated = await db.$transaction(async (tx) => {
    const next = await tx.schoolEvent.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(dto.startsOn !== undefined ? { startsOn: dto.startsOn } : {}),
        ...(dto.endsOn !== undefined ? { endsOn: dto.endsOn ?? null } : {}),
        ...(dto.note !== undefined ? { note: dto.note ?? null } : {}),
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "event.update", entity: "SchoolEvent", entityId: id,
      before: { title: row.title },
      after: { title: next.title },
      ip: ctx.ip,
    });
    return next;
  });
  return publicEvent(updated);
}
