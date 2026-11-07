// In-app notifications + audit event listing + outbox drainer.
// The outbox drainer here is the lightweight in-process fallback used in
// this sandbox; the production worker (apps/worker) drains the same table.

import { z } from "zod";
import { db } from "@/lib/db";
import { writeAudit } from "@/server/shared/audit";
import type { AuthContext } from "@/server/auth/context";

export async function listMyNotifications(ctx: AuthContext) {
  const rows = await db.notification.findMany({
    where: { userId: ctx.user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return rows;
}

export async function markNotificationsRead(ctx: AuthContext, ids?: string[]) {
  await db.notification.updateMany({
    where: {
      userId: ctx.user.id,
      ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
    },
    data: { isRead: true },
  });
  return { ok: true };
}

export async function pushNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  link?: string,
) {
  await db.notification.create({
    data: { userId, type, title, body, link: link ?? null },
  });
}

// ── Audit listing (read-only, auditors & admins) ────────────────────────────

export const auditQuerySchema = z.object({
  entity: z.string().optional(),
  entityId: z.string().optional(),
  action: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export async function listAuditEvents(filters: z.infer<typeof auditQuerySchema>) {
  const where: Record<string, unknown> = {};
  if (filters.entity) where.entity = filters.entity;
  if (filters.entityId) where.entityId = filters.entityId;
  if (filters.action) where.action = { contains: filters.action };
  const [total, rows] = await Promise.all([
    db.auditEvent.count({ where }),
    db.auditEvent.findMany({
      where,
      orderBy: { at: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
  ]);
  return { items: rows, meta: { total, page: filters.page, pageSize: filters.pageSize } };
}

// ── Outbox drain (sandbox in-process worker step) ──────────────────────────

export async function drainOutbox(): Promise<number> {
  const pending = await db.outboxEvent.findMany({
    where: { processedAt: null },
    take: 20,
    orderBy: { createdAt: "asc" },
  });
  let processed = 0;
  for (const ev of pending) {
    try {
      // Phase 1 fanout: notify managers/registrar of key lifecycle events.
      if (ev.type === "application.submitted" || ev.type === "student.enrolled") {
        const staff = await db.userRole.findMany({
          where: { roleKey: { in: ["manager", "registrar"] } },
          select: { userId: true },
        });
        for (const s of staff) {
          let title = "اعلان جدید";
          let body = "";
          try {
            const p = JSON.parse(ev.payload);
            if (ev.type === "application.submitted") {
              title = "درخواست شمولیت جدید";
              body = `درخواست ${p.applicantNumber} ارائه شد و منتظر بررسی است.`;
            } else {
              title = "شمولیت شاگرد جدید";
              body = `شاگرد ${p.studentNumber} ثبت و شمول شد.`;
            }
          } catch { /* noop */ }
          await pushNotification(s.userId, ev.type, title, body);
        }
      }
      await db.outboxEvent.update({
        where: { id: ev.id },
        data: { processedAt: new Date() },
      });
      processed += 1;
    } catch (err) {
      await db.outboxEvent.update({
        where: { id: ev.id },
        data: { error: String(err).slice(0, 300) },
      });
    }
  }
  return processed;
}
