// Finance module — Phase 3: fee structures, discounts, invoices, payments,
// expenses, payroll and finance reports.
//
// INVARIANTS:
//  - MONEY: every amount is an integer in diram (100 diram = 1 AFN).
//    Floats never touch a monetary column.
//  - HISTORY: no deletes. Corrections are voids carrying a reason and an
//    audit event; invoice.paidDiram is maintained transactionally.
//  - BRANCH ISOLATION: every row carries branchId; branch-bound roles see
//    and touch only their own branch. Only admin / general_manager
//    (all-scope grants) cross branch boundaries.
//  - NUMBERING: monotonic counters (invoice/receipt/expense/payslip) inside
//    the same transaction as the row they number.
//  - MISSING PAYMENT ≠ PAID: an invoice with no payments shows as «صادرشده»
//    (issued) with the full balance outstanding — never as settled.

import { z } from "zod";
import { db } from "@/lib/db";
import { errors, ApiError } from "@/server/shared/http";
import { writeAudit, nextDocNumber } from "@/server/shared/audit";
import { directBranchFilter, canAccessBranch } from "@/server/rbac/scope";
import { dateInput } from "@/server/academic";
import { todayIsoKabul, isoToJalali, jalaliToIso, AFGHAN_MONTHS } from "@/server/shared/jalali";
import { toPersianDigits } from "@/server/shared/normalization";
import type { AuthContext } from "@/server/auth/context";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

// ── Solar Hijri month helpers ───────────────────────────────────────────────

/** ISO date → machine month key, e.g. "1405-08" (میزان). */
export function jalaliMonthKey(iso: string): string {
  const j = isoToJalali(iso);
  return `${j.jy}-${String(j.jm).padStart(2, "0")}`;
}

/** Month key → human label, e.g. "1405-08" → «میزان ۱۴۰۵». */
export function jalaliMonthLabel(key: string): string {
  const [ys, ms] = key.split("-");
  const jm = Number(ms);
  const month = AFGHAN_MONTHS[jm - 1] ?? key;
  return `${month} ${toPersianDigits(ys)}`;
}

export function currentMonthKey(): string {
  return jalaliMonthKey(todayIsoKabul());
}

/** The last `n` month keys ending at (and including) `endKey`. */
export function recentMonthKeys(endKey: string, n: number): string[] {
  const [y, m] = endKey.split("-").map(Number);
  const out: string[] = [];
  let jy = y;
  let jm = m;
  for (let i = 0; i < n; i++) {
    out.unshift(`${jy}-${String(jm).padStart(2, "0")}`);
    jm -= 1;
    if (jm === 0) { jm = 12; jy -= 1; }
  }
  return out;
}

/** ISO date range of a Solar Hijri month (start inclusive, end exclusive). */
export function monthRange(key: string): { start: string; end: string } {
  const [y, m] = key.split("-").map(Number);
  const start = jalaliToIso({ jy: y, jm: m, jd: 1 });
  const next = m === 12 ? { jy: y + 1, jm: 1 } : { jy: y, jm: m + 1 };
  const end = jalaliToIso({ ...next, jd: 1 });
  return { start, end };
}

// ── Labels (Dari) ───────────────────────────────────────────────────────────

export const PAYMENT_METHODS = ["cash", "bank", "hawala", "cheque"] as const;
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "نقدی",
  bank: "حساب بانکی",
  hawala: "حواله",
  cheque: "چک",
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  issued: "صادرشده",
  partially_paid: "بخشی پرداخت‌شده",
  paid: "پرداخت‌شده",
  void: "باطل‌شده",
};

export const EXPENSE_CATEGORIES = [
  "utilities", "maintenance", "supplies", "transport", "salaries", "other",
] as const;
export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  utilities: "برق و آب",
  maintenance: "ترمیم و نگهداری",
  supplies: "لوازم تعلیمی",
  transport: "ترانسپورت",
  salaries: "معاشات",
  other: "مصارف دیگر",
};

export const PERIOD_KIND_LABELS: Record<string, string> = {
  one_time: "یک‌بار",
  monthly: "ماهانه",
  termly: "نیم‌سالانه",
};

export const PAYROLL_STATUS_LABELS: Record<string, string> = {
  draft: "پیش‌نویس",
  approved: "تاییدشده",
  paid: "پرداخت‌شده",
};

// ── DTOs ────────────────────────────────────────────────────────────────────

const diram = z.coerce.number().int("مبلغ باید عدد صحیح باشد.").min(1, "مبلغ باید بیشتر از صفر باشد.");

export const feeStructureDto = z.object({
  academicYearId: z.string().min(1, "سال تعلیمی را انتخاب کنید."),
  branchId: z.string().optional().nullable(),
  name: z.string().min(3, "نام فیس را وارد کنید.").max(80),
  gradeLevels: z.array(z.coerce.number().int().min(1).max(12)).min(1, "حداقل یک صنف را انتخاب کنید."),
  periodKind: z.enum(["one_time", "monthly", "termly"]),
  amountDiram: diram.max(100_000_000, "مبلغ بیش از حد بزرگ است."),
  note: z.string().max(200).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const feeStructureUpdateDto = feeStructureDto.partial().extend({
  version: z.number().int().min(1),
});

export const discountDto = z.object({
  academicYearId: z.string().min(1, "سال تعلیمی را انتخاب کنید."),
  studentId: z.string().min(1, "شاگرد را انتخاب کنید."),
  kind: z.enum(["percent", "fixed_diram"]),
  value: z.coerce.number().int().min(1).max(100_000_000),
  reason: z.string().min(3, "دلیل تخفیف را بنویسید.").max(200),
});

export const invoiceIssueDto = z.object({
  feeStructureId: z.string().min(1, "پلان فیس را انتخاب کنید."),
  periodKey: z.string().min(1, "دوره را مشخص کنید.").max(40),
  periodLabel: z.string().min(2, "عنوان دوره را بنویسید.").max(80),
  dueDate: dateInput.optional().nullable(),
  branchId: z.string().optional().nullable(),
  studentIds: z.array(z.string()).optional(),
});

export const invoiceVoidDto = z.object({
  reason: z.string().min(3, "دلیل باطل‌کردن را بنویسید.").max(200),
});

export const paymentCollectDto = z.object({
  invoiceId: z.string().min(1, "فاکتور را انتخاب کنید."),
  amountDiram: diram.max(100_000_000, "مبلغ بیش از حد بزرگ است."),
  method: z.enum(PAYMENT_METHODS),
  date: dateInput.optional(),
  note: z.string().max(200).optional().nullable(),
});

export const paymentVoidDto = z.object({
  reason: z.string().min(3, "دلیل باطل‌کردن رسید را بنویسید.").max(200),
});

export const expenseDto = z.object({
  branchId: z.string().optional().nullable(),
  date: dateInput,
  category: z.enum(EXPENSE_CATEGORIES),
  payee: z.string().max(80).optional().nullable(),
  amountDiram: diram.max(100_000_000, "مبلغ بیش از حد بزرگ است."),
  note: z.string().max(200).optional().nullable(),
});

export const expenseVoidDto = z.object({
  reason: z.string().min(3, "دلیل باطل‌کردن مصرف را بنویسید.").max(200),
});

export const payrollCreateDto = z.object({
  branchId: z.string().optional().nullable(),
  periodKey: z.string().regex(/^\d{4}-\d{2}$/, "دوره باید به شکل «1405-08» باشد."),
  periodLabel: z.string().max(80).optional().nullable(),
  note: z.string().max(200).optional().nullable(),
});

export const payrollUpdateDto = z.object({
  items: z.array(z.object({
    id: z.string().min(1),
    allowanceDiram: z.coerce.number().int().min(0).max(100_000_000),
    bonusDiram: z.coerce.number().int().min(0).max(100_000_000),
    deductionDiram: z.coerce.number().int().min(0).max(100_000_000),
    note: z.string().max(200).optional().nullable(),
  })).max(200),
});

export const payrollActionDto = z.object({
  action: z.enum(["approve", "pay"]),
  note: z.string().max(200).optional().nullable(),
});

// ── Branch scope helper (direct branchId columns) ──────────────────────────

function scopedBranchIds(
  ctx: AuthContext,
  permission: string,
): string[] | null | "deny" {
  const f = directBranchFilter(ctx, permission);
  if (!f) return "deny";
  return f.branchIds; // null = all branches
}

/** Branch the finance action should record/be limited to. */
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

// ── Fee structures ──────────────────────────────────────────────────────────

const FEE_INCLUDE = {
  branch: { select: { id: true, name: true } },
} as const;

function publicFee(row: {
  id: string; academicYearId: string; branchId: string | null; name: string;
  gradeLevels: string; periodKind: string; amountDiram: number; isActive: boolean;
  note: string | null; createdAt: Date; updatedAt: Date;
  branch: { id: string; name: string } | null;
  _count?: { invoices: number };
}) {
  let gradeLevels: number[] = [];
  try { gradeLevels = JSON.parse(row.gradeLevels ?? "[]"); } catch { /* noop */ }
  return {
    id: row.id,
    academicYearId: row.academicYearId,
    branchId: row.branchId,
    branchName: row.branch?.name ?? null,
    name: row.name,
    gradeLevels,
    periodKind: row.periodKind,
    periodKindLabel: PERIOD_KIND_LABELS[row.periodKind] ?? row.periodKind,
    amountDiram: row.amountDiram,
    isActive: row.isActive,
    note: row.note,
    invoiceCount: row._count?.invoices ?? 0,
    createdAt: row.createdAt,
  };
}

export async function listFeeStructures(ctx: AuthContext, filters: { academicYearId?: string; isActive?: string }) {
  const ids = scopedBranchIds(ctx, "fees.view");
  if (ids === "deny") return [];
  // Org-wide structures (branchId null) are visible to every branch.
  const where: Prisma.FeeStructureWhereInput = {
    AND: [
      ids === null
        ? {}
        : { OR: [{ branchId: null }, { branchId: { in: ids } }] },
      ...(filters.academicYearId ? [{ academicYearId: filters.academicYearId }] : []),
      ...(filters.isActive !== undefined ? [{ isActive: filters.isActive === "true" }] : []),
    ],
  };
  const rows = await db.feeStructure.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { ...FEE_INCLUDE, _count: { select: { invoices: true } } },
  });
  return rows.map(publicFee);
}

export async function createFeeStructure(ctx: AuthContext, dto: z.infer<typeof feeStructureDto>) {
  const org = await db.organization.findFirst({ select: { id: true } });
  if (!org) throw errors.notFound("مکتب");
  const year = await db.academicYear.findUnique({ where: { id: dto.academicYearId } });
  if (!year || year.orgId !== org.id) throw errors.notFound("سال تعلیمی");
  const branchId = dto.branchId ?? null;
  if (branchId && !canAccessBranch(ctx, "fees.manage", branchId)) {
    throw errors.forbidden("این فیس به شعبهٔ دیگری تعلق دارد.");
  }
  return db.$transaction(async (tx) => {
    const row = await tx.feeStructure.create({
      data: {
        orgId: org.id,
        academicYearId: year.id,
        branchId,
        name: dto.name,
        gradeLevels: JSON.stringify(dto.gradeLevels),
        periodKind: dto.periodKind,
        amountDiram: dto.amountDiram,
        isActive: dto.isActive,
        note: dto.note ?? null,
        createdById: ctx.user.id,
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "fee.create", entity: "FeeStructure", entityId: row.id,
      after: { name: row.name, amountDiram: row.amountDiram, branchId },
      ip: ctx.ip,
    });
    return publicFee({ ...row, branch: null });
  });
}

export async function updateFeeStructure(ctx: AuthContext, id: string, dto: z.infer<typeof feeStructureUpdateDto>) {
  const row = await db.feeStructure.findUnique({ where: { id }, include: FEE_INCLUDE });
  if (!row) throw errors.notFound("پلان فیس");
  if (row.branchId && !canAccessBranch(ctx, "fees.manage", row.branchId)) {
    throw errors.forbidden("این فیس به شعبهٔ دیگری تعلق دارد.");
  }
  const updated = await db.$transaction(async (tx) => {
    const next = await tx.feeStructure.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.gradeLevels !== undefined ? { gradeLevels: JSON.stringify(dto.gradeLevels) } : {}),
        ...(dto.periodKind !== undefined ? { periodKind: dto.periodKind } : {}),
        ...(dto.amountDiram !== undefined ? { amountDiram: dto.amountDiram } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "fee.update", entity: "FeeStructure", entityId: id,
      before: { amountDiram: row.amountDiram, isActive: row.isActive },
      after: { amountDiram: next.amountDiram, isActive: next.isActive },
      ip: ctx.ip,
    });
    return next;
  });
  return publicFee({ ...updated, branch: row.branch });
}

// ── Discounts ───────────────────────────────────────────────────────────────

export async function listDiscounts(ctx: AuthContext, filters: { academicYearId?: string; studentId?: string }) {
  const ids = scopedBranchIds(ctx, "fees.view");
  if (ids === "deny") return [];
  const rows = await db.discount.findMany({
    where: {
      AND: [
        // Branch isolation via the student's enrollment branch.
        ids === null
          ? {}
          : { student: { enrollments: { some: { classSection: { branchId: { in: ids } } } } } },
        ...(filters.academicYearId ? [{ academicYearId: filters.academicYearId }] : []),
        ...(filters.studentId ? [{ studentId: filters.studentId }] : []),
      ],
    },
    include: { student: { select: { id: true, studentNumber: true, personal: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rows.map((d) => {
    let firstName = "";
    try { firstName = JSON.parse(d.student.personal).firstName ?? ""; } catch { /* noop */ }
    return {
      id: d.id,
      academicYearId: d.academicYearId,
      studentId: d.studentId,
      studentNumber: d.student.studentNumber,
      studentName: firstName,
      kind: d.kind,
      value: d.value,
      reason: d.reason,
      status: d.status,
      createdAt: d.createdAt,
    };
  });
}

export async function createDiscount(ctx: AuthContext, dto: z.infer<typeof discountDto>) {
  const org = await db.organization.findFirst({ select: { id: true } });
  if (!org) throw errors.notFound("مکتب");
  const year = await db.academicYear.findUnique({ where: { id: dto.academicYearId } });
  if (!year || year.orgId !== org.id) throw errors.notFound("سال تعلیمی");
  const student = await db.student.findUnique({ where: { id: dto.studentId } });
  if (!student) throw errors.notFound("شاگرد");
  if (dto.kind === "percent" && dto.value > 100) {
    throw new ApiError(400, "VALIDATION_ERROR", "درصد تخفیف نمی‌تواند بیش از ۱۰۰ باشد.");
  }
  return db.$transaction(async (tx) => {
    const row = await tx.discount.create({
      data: {
        orgId: org.id,
        academicYearId: year.id,
        studentId: dto.studentId,
        kind: dto.kind,
        value: dto.value,
        reason: dto.reason,
        approvedById: ctx.user.id,
        status: "approved",
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "discount.create", entity: "Discount", entityId: row.id,
      after: { studentId: dto.studentId, kind: dto.kind, value: dto.value, reason: dto.reason },
      ip: ctx.ip,
    });
    return row;
  });
}

export async function revokeDiscount(ctx: AuthContext, id: string) {
  const row = await db.discount.findUnique({ where: { id } });
  if (!row) throw errors.notFound("تخفیف");
  if (row.status !== "approved") throw errors.badRequest("این تخفیف قبلاً لغو شده است.");
  await db.$transaction(async (tx) => {
    await tx.discount.update({
      where: { id },
      data: { status: "revoked", revokedById: ctx.user.id, revokedAt: new Date() },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "discount.revoke", entity: "Discount", entityId: id,
      before: { status: "approved" }, after: { status: "revoked" },
      ip: ctx.ip,
    });
  });
  return { ok: true };
}

// ── Invoices ────────────────────────────────────────────────────────────────

const INVOICE_INCLUDE = {
  branch: { select: { id: true, name: true } },
  student: { select: { id: true, studentNumber: true, personal: true } },
  feeStructure: { select: { id: true, name: true } },
  payments: { orderBy: { createdAt: "desc" } as const },
} as const;

function publicInvoice(row: {
  id: string; invoiceNumber: string; academicYearId: string; branchId: string;
  studentId: string; feeStructureId: string | null; periodKey: string; periodLabel: string;
  amountDiram: number; discountDiram: number; netDiram: number; paidDiram: number;
  status: string; dueDate: string | null; note: string | null; voidReason: string | null;
  createdAt: Date; updatedAt: Date;
  branch: { id: string; name: string } | null;
  student: { id: string; studentNumber: string; personal: string } | null;
  feeStructure: { id: string; name: string } | null;
  payments?: Array<{
    id: string; receiptNumber: string; amountDiram: number; method: string;
    date: string; note: string | null; voidedAt: Date | null; createdAt: Date;
  }>;
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
    invoiceNumber: row.invoiceNumber,
    academicYearId: row.academicYearId,
    branchId: row.branchId,
    branchName: row.branch?.name ?? null,
    studentId: row.studentId,
    studentNumber: row.student?.studentNumber ?? "",
    studentName: firstName,
    fatherName,
    feeStructureId: row.feeStructureId,
    feeStructureName: row.feeStructure?.name ?? null,
    periodKey: row.periodKey,
    periodLabel: row.periodLabel,
    amountDiram: row.amountDiram,
    discountDiram: row.discountDiram,
    netDiram: row.netDiram,
    paidDiram: row.paidDiram,
    balanceDiram: row.status === "void" ? 0 : Math.max(0, row.netDiram - row.paidDiram),
    status: row.status,
    statusLabel: INVOICE_STATUS_LABELS[row.status] ?? row.status,
    dueDate: row.dueDate,
    note: row.note,
    voidReason: row.voidReason,
    createdAt: row.createdAt,
    payments: (row.payments ?? []).map((p) => ({
      id: p.id,
      receiptNumber: p.receiptNumber,
      amountDiram: p.amountDiram,
      method: p.method,
      methodLabel: PAYMENT_METHOD_LABELS[p.method] ?? p.method,
      date: p.date,
      note: p.note,
      voidedAt: p.voidedAt,
      createdAt: p.createdAt,
    })),
  };
}

export async function listInvoices(
  ctx: AuthContext,
  filters: { status?: string; periodKey?: string; studentId?: string; q?: string; outstanding?: string },
) {
  const grants = ctx.grants.filter((g) => g.permission === "invoices.view");
  if (grants.length === 0) return [];

  const and: Prisma.InvoiceWhereInput[] = [];

  if (grants.some((g) => g.scope === "all")) {
    if (ctx.branchId) and.push({ branchId: ctx.branchId });
  } else if (ctx.guardianId && grants.some((g) => g.scope === "guardian")) {
    // Parent portal: invoices of the guardian's own children only.
    and.push({ student: { guardians: { some: { guardianId: ctx.guardianId, contactRights: true } } } });
  } else {
    const ids = grants
      .filter((g) => g.scope === "branch" && g.branchId)
      .map((g) => g.branchId as string);
    if (ids.length === 0) return []; // fail closed
    and.push({ branchId: { in: ids } });
  }

  if (filters.status) and.push({ status: filters.status });
  if (filters.periodKey) and.push({ periodKey: filters.periodKey });
  if (filters.studentId) and.push({ studentId: filters.studentId });
  if (filters.outstanding === "true") {
    and.push({ status: { in: ["issued", "partially_paid"] }, paidDiram: { lt: db.invoice.fields.netDiram } });
  }
  if (filters.q) {
    and.push({
      OR: [
        { invoiceNumber: { contains: filters.q } },
        { student: { studentNumber: { contains: filters.q } } },
        { student: { personal: { contains: filters.q } } },
      ],
    });
  }

  const rows = await db.invoice.findMany({
    where: { AND: and },
    include: INVOICE_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return rows.map(publicInvoice);
}

export async function getInvoice(ctx: AuthContext, id: string) {
  const row = await db.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE });
  if (!row) throw errors.notFound("فاکتور");
  const grants = ctx.grants.filter((g) => g.permission === "invoices.view");
  if (grants.length === 0) throw errors.forbidden();
  if (grants.some((g) => g.scope === "all")) {
    // cross-branch: allowed (branch context is a list filter, not a record gate)
  } else if (ctx.guardianId && grants.some((g) => g.scope === "guardian")) {
    const link = await db.studentGuardian.findFirst({
      where: { studentId: row.studentId, guardianId: ctx.guardianId, contactRights: true },
      select: { id: true },
    });
    if (!link) throw errors.forbidden("این فاکتور به فرزندان شما تعلق ندارد.");
  } else {
    const ids = grants.filter((g) => g.scope === "branch" && g.branchId).map((g) => g.branchId as string);
    if (!ids.includes(row.branchId)) throw errors.forbidden("این فاکتور به شعبهٔ دیگری تعلق دارد.");
  }
  return publicInvoice(row);
}

/** Snapshot of the largest active discount for the student (diram). */
async function discountForStudent(tx: Tx, studentId: string, academicYearId: string, amountDiram: number): Promise<number> {
  const rows = await tx.discount.findMany({
    where: { studentId, academicYearId, status: "approved" },
  });
  let best = 0;
  for (const d of rows) {
    const val = d.kind === "percent"
      ? Math.round((amountDiram * d.value) / 100)
      : Math.min(d.value, amountDiram);
    if (val > best) best = val;
  }
  return best;
}

export async function issueInvoices(ctx: AuthContext, dto: z.infer<typeof invoiceIssueDto>) {
  const fee = await db.feeStructure.findUnique({ where: { id: dto.feeStructureId } });
  if (!fee) throw errors.notFound("پلان فیس");
  if (!fee.isActive) throw errors.badRequest("این پلان فیس غیرفعال است.");
  if (fee.branchId && !canAccessBranch(ctx, "invoices.manage", fee.branchId)) {
    throw errors.forbidden("این فیس به شعبهٔ دیگری تعلق دارد.");
  }
  const branchId = await resolveActionBranch(ctx, "invoices.manage", dto.branchId ?? fee.branchId);
  if (fee.branchId && fee.branchId !== branchId) {
    throw errors.badRequest("این پلان فیس به شعبهٔ دیگری تعلق دارد؛ شعبهٔ صحیح را انتخاب کنید.");
  }

  const year = await db.academicYear.findUnique({ where: { id: fee.academicYearId } });
  if (!year) throw errors.notFound("سال تعلیمی");

  // Target students: active enrollment in the branch's sections matching the
  // fee's grade levels (or the explicit list for single-student invoicing).
  let targets: Array<{ studentId: string }>;
  if (dto.studentIds && dto.studentIds.length > 0) {
    const rows = await db.enrollment.findMany({
      where: {
        academicYearId: year.id,
        status: "active",
        studentId: { in: dto.studentIds },
        classSection: { branchId },
      },
      select: { studentId: true },
    });
    targets = rows;
  } else {
    const gradeLevels = JSON.parse(fee.gradeLevels ?? "[]") as number[];
    const sections = await db.classSection.findMany({
      where: { academicYearId: year.id, branchId },
      select: { id: true, gradeLevel: { select: { level: true } } },
    });
    const sectionIds = sections
      .filter((s) => gradeLevels.length === 0 || gradeLevels.includes(s.gradeLevel.level))
      .map((s) => s.id);
    if (sectionIds.length === 0) {
      throw errors.badRequest("در این شعبه، شعبهٔ صنفی مطابق با صنف‌های این فیس وجود ندارد.");
    }
    const rows = await db.enrollment.findMany({
      where: { academicYearId: year.id, status: "active", classSectionId: { in: sectionIds } },
      select: { studentId: true },
    });
    targets = rows;
  }

  if (targets.length === 0) {
    throw errors.badRequest("شاگردی برای صدور فاکتور در این دوره پیدا نشد.");
  }

  const created: string[] = [];
  const skipped: string[] = [];
  await db.$transaction(async (tx) => {
    // Skip students that already have a live invoice for this period.
    const existing = await tx.invoice.findMany({
      where: { studentId: { in: targets.map((t) => t.studentId) }, periodKey: dto.periodKey, status: { not: "void" } },
      select: { studentId: true },
    });
    const have = new Set(existing.map((e) => e.studentId));
    for (const t of targets) {
      if (have.has(t.studentId)) { skipped.push(t.studentId); continue; }
      const discountDiram = await discountForStudent(tx, t.studentId, year.id, fee.amountDiram);
      const netDiram = fee.amountDiram - discountDiram;
      const seq = await nextDocNumber(tx, "invoice", year.name);
      const row = await tx.invoice.create({
        data: {
          orgId: fee.orgId,
          invoiceNumber: `F-${year.name}-${String(seq).padStart(4, "0")}`,
          academicYearId: year.id,
          branchId,
          studentId: t.studentId,
          feeStructureId: fee.id,
          periodKey: dto.periodKey,
          periodLabel: dto.periodLabel,
          amountDiram: fee.amountDiram,
          discountDiram,
          netDiram,
          paidDiram: 0,
          status: "issued",
          dueDate: dto.dueDate ?? null,
          note: fee.name,
          issuedById: ctx.user.id,
        },
      });
      created.push(row.invoiceNumber);
    }
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "invoice.issue", entity: "Invoice", entityId: branchId,
      after: { periodKey: dto.periodKey, periodLabel: dto.periodLabel, count: created.length, branchId },
      ip: ctx.ip,
    });
  });

  return { createdCount: created.length, skippedCount: skipped.length, numbers: created.slice(0, 20) };
}

export async function voidInvoice(ctx: AuthContext, id: string, reason: string) {
  const row = await db.invoice.findUnique({ where: { id } });
  if (!row) throw errors.notFound("فاکتور");
  if (!canAccessBranch(ctx, "invoices.manage", row.branchId)) {
    throw errors.forbidden("این فاکتور به شعبهٔ دیگری تعلق دارد.");
  }
  if (row.status === "void") throw errors.badRequest("این فاکتور قبلاً باطل شده است.");
  if (row.paidDiram > 0) {
    throw errors.badRequest("فاکتور با پرداخت ثبت‌شده را نمی‌توان باطل کرد؛ ابتدا رسیدهای پرداخت را باطل کنید.");
  }
  await db.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id },
      data: { status: "void", voidedById: ctx.user.id, voidedAt: new Date(), voidReason: reason },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "invoice.void", entity: "Invoice", entityId: id,
      before: { status: row.status },
      after: { status: "void" },
      reason,
      ip: ctx.ip,
    });
  });
  return { ok: true };
}

// ── Payments ────────────────────────────────────────────────────────────────

const PAYMENT_INCLUDE = {
  branch: { select: { id: true, name: true } },
  student: { select: { id: true, studentNumber: true, personal: true } },
  invoice: { select: { id: true, invoiceNumber: true, periodLabel: true, netDiram: true, paidDiram: true, status: true } },
} as const;

function publicPayment(row: {
  id: string; receiptNumber: string; invoiceId: string; studentId: string; branchId: string;
  amountDiram: number; method: string; date: string; note: string | null; voidReason: string | null;
  voidedAt: Date | null; createdAt: Date;
  branch: { id: string; name: string } | null;
  student: { id: string; studentNumber: string; personal: string } | null;
  invoice: { id: string; invoiceNumber: string; periodLabel: string; netDiram: number; paidDiram: number; status: string } | null;
}) {
  let firstName = "";
  try { firstName = JSON.parse(row.student?.personal ?? "{}").firstName ?? ""; } catch { /* noop */ }
  return {
    id: row.id,
    receiptNumber: row.receiptNumber,
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoice?.invoiceNumber ?? "",
    periodLabel: row.invoice?.periodLabel ?? "",
    studentId: row.studentId,
    studentNumber: row.student?.studentNumber ?? "",
    studentName: firstName,
    branchId: row.branchId,
    branchName: row.branch?.name ?? null,
    amountDiram: row.amountDiram,
    method: row.method,
    methodLabel: PAYMENT_METHOD_LABELS[row.method] ?? row.method,
    date: row.date,
    note: row.note,
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
    createdAt: row.createdAt,
  };
}

export async function listPayments(
  ctx: AuthContext,
  filters: { from?: string; to?: string; method?: string; q?: string; invoiceId?: string; studentId?: string },
) {
  const ids = scopedBranchIds(ctx, "payments.view");
  if (ids === "deny") return [];
  const and: Prisma.PaymentWhereInput[] = [
    ids === null ? {} : { branchId: { in: ids } },
  ];
  if (filters.from || filters.to) and.push({ date: { gte: filters.from, lte: filters.to } });
  if (filters.method) and.push({ method: filters.method });
  if (filters.invoiceId) and.push({ invoiceId: filters.invoiceId });
  if (filters.studentId) and.push({ studentId: filters.studentId });
  if (filters.q) {
    and.push({
      OR: [
        { receiptNumber: { contains: filters.q } },
        { student: { studentNumber: { contains: filters.q } } },
        { student: { personal: { contains: filters.q } } },
      ],
    });
  }
  const rows = await db.payment.findMany({
    where: { AND: and },
    include: PAYMENT_INCLUDE,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 300,
  });
  return rows.map(publicPayment);
}

function invoiceStatusAfter(paid: number, net: number): string {
  if (paid >= net) return "paid";
  if (paid > 0) return "partially_paid";
  return "issued";
}

export async function collectPayment(ctx: AuthContext, dto: z.infer<typeof paymentCollectDto>) {
  const invoice = await db.invoice.findUnique({ where: { id: dto.invoiceId } });
  if (!invoice) throw errors.notFound("فاکتور");
  if (!canAccessBranch(ctx, "payments.collect", invoice.branchId)) {
    throw errors.forbidden("این فاکتور به شعبهٔ دیگری تعلق دارد.");
  }
  if (invoice.status === "void") throw errors.badRequest("فاکتور باطل‌شده را نمی‌توان پرداخت کرد.");
  const remaining = invoice.netDiram - invoice.paidDiram;
  if (remaining <= 0) throw errors.badRequest("این فاکتور قبلاً به‌طور کامل پرداخت شده است.");
  if (dto.amountDiram > remaining) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "مبلغ پرداخت بیش از بقیهٔ فاکتور است.",
    );
  }
  const org = await db.organization.findFirst({ select: { id: true } });
  if (!org) throw errors.notFound("مکتب");
  const year = await db.academicYear.findUnique({ where: { id: invoice.academicYearId } });

  return db.$transaction(async (tx) => {
    // Re-read inside the transaction and compare paidDiram so concurrent
    // collections cannot overpay the invoice.
    const fresh = await tx.invoice.findUnique({ where: { id: invoice.id } });
    if (!fresh || fresh.status === "void" || fresh.paidDiram !== invoice.paidDiram) {
      throw errors.conflict("وضعیت فاکتور هم‌زمان تغییر کرده است. صفحه را دوباره بارگذاری کنید.");
    }
    const seq = await nextDocNumber(tx, "receipt", year?.name ?? "0000");
    const payment = await tx.payment.create({
      data: {
        orgId: org.id,
        receiptNumber: `R-${year?.name ?? "0000"}-${String(seq).padStart(4, "0")}`,
        invoiceId: fresh.id,
        studentId: fresh.studentId,
        branchId: fresh.branchId,
        amountDiram: dto.amountDiram,
        method: dto.method,
        date: dto.date ?? todayIsoKabul(),
        note: dto.note ?? null,
        receivedById: ctx.user.id,
      },
    });
    const paid = fresh.paidDiram + dto.amountDiram;
    await tx.invoice.update({
      where: { id: fresh.id },
      data: { paidDiram: paid, status: invoiceStatusAfter(paid, fresh.netDiram) },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "payment.collect", entity: "Payment", entityId: payment.id,
      after: { receiptNumber: payment.receiptNumber, amountDiram: dto.amountDiram, method: dto.method },
      ip: ctx.ip,
    });
    return publicPayment({
      ...payment,
      branch: null,
      student: null,
      invoice: { id: fresh.id, invoiceNumber: fresh.invoiceNumber, periodLabel: fresh.periodLabel, netDiram: fresh.netDiram, paidDiram: paid, status: invoiceStatusAfter(paid, fresh.netDiram) },
    });
  });
}

export async function voidPayment(ctx: AuthContext, id: string, reason: string) {
  const row = await db.payment.findUnique({ where: { id } });
  if (!row) throw errors.notFound("رسید پرداخت");
  if (!canAccessBranch(ctx, "payments.void", row.branchId)) {
    throw errors.forbidden("این رسید به شعبهٔ دیگری تعلق دارد.");
  }
  if (row.voidedAt) throw errors.badRequest("این رسید قبلاً باطل شده است.");
  await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id },
      data: { voidedById: ctx.user.id, voidedAt: new Date(), voidReason: reason },
    });
    const invoice = await tx.invoice.findUnique({ where: { id: row.invoiceId } });
    if (invoice && invoice.status !== "void") {
      const paid = Math.max(0, invoice.paidDiram - row.amountDiram);
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { paidDiram: paid, status: invoiceStatusAfter(paid, invoice.netDiram) },
      });
    }
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "payment.void", entity: "Payment", entityId: id,
      before: { amountDiram: row.amountDiram },
      after: { voided: true },
      reason,
      ip: ctx.ip,
    });
  });
  return { ok: true };
}

// ── Expenses ────────────────────────────────────────────────────────────────

export async function listExpenses(ctx: AuthContext, filters: { from?: string; to?: string; category?: string }) {
  const ids = scopedBranchIds(ctx, "expenses.view");
  if (ids === "deny") return [];
  const rows = await db.expense.findMany({
    where: {
      AND: [
        ids === null ? {} : { branchId: { in: ids } },
        ...(filters.from || filters.to ? [{ date: { gte: filters.from, lte: filters.to } }] : []),
        ...(filters.category ? [{ category: filters.category }] : []),
      ],
    },
    include: { branch: { select: { id: true, name: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 300,
  });
  return rows.map((e) => ({
    id: e.id,
    expenseNumber: e.expenseNumber,
    branchId: e.branchId,
    branchName: e.branch?.name ?? null,
    date: e.date,
    category: e.category,
    categoryLabel: EXPENSE_CATEGORY_LABELS[e.category] ?? e.category,
    payee: e.payee,
    amountDiram: e.amountDiram,
    note: e.note,
    voidedAt: e.voidedAt,
    voidReason: e.voidReason,
    createdAt: e.createdAt,
  }));
}

export async function createExpense(ctx: AuthContext, dto: z.infer<typeof expenseDto>) {
  const org = await db.organization.findFirst({ select: { id: true } });
  if (!org) throw errors.notFound("مکتب");
  const branchId = await resolveActionBranch(ctx, "expenses.manage", dto.branchId);
  return db.$transaction(async (tx) => {
    const year = await tx.academicYear.findFirst({ where: { isCurrent: true }, select: { name: true } });
    const seq = await nextDocNumber(tx, "expense", year?.name ?? "0000");
    const row = await tx.expense.create({
      data: {
        orgId: org.id,
        expenseNumber: `E-${year?.name ?? "0000"}-${String(seq).padStart(4, "0")}`,
        branchId,
        date: dto.date,
        category: dto.category,
        payee: dto.payee ?? null,
        amountDiram: dto.amountDiram,
        note: dto.note ?? null,
        paidById: ctx.user.id,
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "expense.create", entity: "Expense", entityId: row.id,
      after: { expenseNumber: row.expenseNumber, amountDiram: dto.amountDiram, category: dto.category, branchId },
      ip: ctx.ip,
    });
    return row;
  });
}

export async function voidExpense(ctx: AuthContext, id: string, reason: string) {
  const row = await db.expense.findUnique({ where: { id } });
  if (!row) throw errors.notFound("مصرف");
  if (!canAccessBranch(ctx, "expenses.manage", row.branchId)) {
    throw errors.forbidden("این مصرف به شعبهٔ دیگری تعلق دارد.");
  }
  if (row.voidedAt) throw errors.badRequest("این مصرف قبلاً باطل شده است.");
  await db.$transaction(async (tx) => {
    await tx.expense.update({
      where: { id },
      data: { voidedById: ctx.user.id, voidedAt: new Date(), voidReason: reason },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "expense.void", entity: "Expense", entityId: id,
      before: { amountDiram: row.amountDiram },
      after: { voided: true },
      reason,
      ip: ctx.ip,
    });
  });
  return { ok: true };
}

// ── Payroll ─────────────────────────────────────────────────────────────────

const PAYROLL_INCLUDE = {
  branch: { select: { id: true, name: true } },
  items: {
    include: { staff: { select: { id: true, fullName: true, position: true } } },
    orderBy: { staff: { fullName: "asc" } } as const,
  },
} as const;

function publicRun(row: {
  id: string; branchId: string; academicYearId: string; periodKey: string; periodLabel: string;
  status: string; totalsDiram: number; note: string | null; approvedAt: Date | null; paidAt: Date | null;
  createdAt: Date;
  branch: { id: string; name: string } | null;
  items: Array<{
    id: string; staffId: string; payslipNumber: string; baseDiram: number; allowanceDiram: number;
    bonusDiram: number; deductionDiram: number; netDiram: number; note: string | null;
    staff: { id: string; fullName: string; position: string } | null;
  }>;
}) {
  return {
    id: row.id,
    branchId: row.branchId,
    branchName: row.branch?.name ?? null,
    academicYearId: row.academicYearId,
    periodKey: row.periodKey,
    periodLabel: row.periodLabel,
    status: row.status,
    statusLabel: PAYROLL_STATUS_LABELS[row.status] ?? row.status,
    totalsDiram: row.totalsDiram,
    staffCount: row.items.length,
    note: row.note,
    approvedAt: row.approvedAt,
    paidAt: row.paidAt,
    createdAt: row.createdAt,
    items: row.items.map((it) => ({
      id: it.id,
      staffId: it.staffId,
      staffName: it.staff?.fullName ?? "",
      position: it.staff?.position ?? "",
      payslipNumber: it.payslipNumber,
      baseDiram: it.baseDiram,
      allowanceDiram: it.allowanceDiram,
      bonusDiram: it.bonusDiram,
      deductionDiram: it.deductionDiram,
      netDiram: it.netDiram,
      note: it.note,
    })),
  };
}

export async function listPayrollRuns(ctx: AuthContext, filters: { periodKey?: string; status?: string }) {
  const ids = scopedBranchIds(ctx, "payroll.view");
  if (ids === "deny") return [];
  const rows = await db.payrollRun.findMany({
    where: {
      AND: [
        ids === null ? {} : { branchId: { in: ids } },
        ...(filters.periodKey ? [{ periodKey: filters.periodKey }] : []),
        ...(filters.status ? [{ status: filters.status }] : []),
      ],
    },
    include: PAYROLL_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map(publicRun);
}

export async function getPayrollRun(ctx: AuthContext, id: string) {
  const row = await db.payrollRun.findUnique({ where: { id }, include: PAYROLL_INCLUDE });
  if (!row) throw errors.notFound("سیشن معاشات");
  if (!canAccessBranch(ctx, "payroll.view", row.branchId)) {
    throw errors.forbidden("این سیشن معاشات به شعبهٔ دیگری تعلق دارد.");
  }
  return publicRun(row);
}

export async function createPayrollRun(ctx: AuthContext, dto: z.infer<typeof payrollCreateDto>) {
  const org = await db.organization.findFirst({ select: { id: true } });
  if (!org) throw errors.notFound("مکتب");
  const year = await db.academicYear.findFirst({ where: { isCurrent: true } });
  if (!year) throw errors.notFound("سال تعلیمی جاری");
  const branchId = await resolveActionBranch(ctx, "payroll.manage", dto.branchId);

  const duplicate = await db.payrollRun.findFirst({
    where: { branchId, periodKey: dto.periodKey, status: { not: "paid" } },
  });
  if (duplicate) {
    throw errors.conflict("برای این شعبه و ماه قبلاً سیشن معاشات ساخته شده است.");
  }

  const staff = await db.staffMember.findMany({
    where: { branchId, status: "active", salaryDiram: { not: null } },
    select: { id: true, fullName: true, salaryDiram: true },
    orderBy: { fullName: "asc" },
  });
  if (staff.length === 0) {
    throw errors.badRequest("کارمند فعالی با معاش ثبت‌شده در این شعبه وجود ندارد؛ ابتدا معاش کارمندان را در بخش کادر مکتب ثبت کنید.");
  }

  const periodLabel = dto.periodLabel?.trim() || `معاشات ${jalaliMonthLabel(dto.periodKey)}`;

  return db.$transaction(async (tx) => {
    const run = await tx.payrollRun.create({
      data: {
        orgId: org.id,
        branchId,
        academicYearId: year.id,
        periodKey: dto.periodKey,
        periodLabel,
        status: "draft",
        totalsDiram: 0,
        note: dto.note ?? null,
        createdById: ctx.user.id,
      },
    });
    let totals = 0;
    for (const s of staff) {
      const base = s.salaryDiram as number;
      const seq = await nextDocNumber(tx, "payslip", dto.periodKey);
      const net = base; // no adjustments at generation time
      totals += net;
      await tx.payrollItem.create({
        data: {
          payrollRunId: run.id,
          staffId: s.id,
          payslipNumber: `P-${dto.periodKey}-${String(seq).padStart(4, "0")}`,
          baseDiram: base,
          allowanceDiram: 0,
          bonusDiram: 0,
          deductionDiram: 0,
          netDiram: net,
        },
      });
    }
    await tx.payrollRun.update({ where: { id: run.id }, data: { totalsDiram: totals } });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "payroll.create", entity: "PayrollRun", entityId: run.id,
      after: { periodKey: dto.periodKey, branchId, staffCount: staff.length, totalsDiram: totals },
      ip: ctx.ip,
    });
    return publicRun({
      ...run, totalsDiram: totals,
      branch: null,
      items: staff.map((s) => ({
        id: "pending", staffId: s.id, payslipNumber: "—", baseDiram: s.salaryDiram as number,
        allowanceDiram: 0, bonusDiram: 0, deductionDiram: 0, netDiram: s.salaryDiram as number,
        note: null, staff: { id: s.id, fullName: s.fullName, position: "" },
      })),
    });
  });
}

export async function updatePayrollItems(ctx: AuthContext, id: string, dto: z.infer<typeof payrollUpdateDto>) {
  const run = await db.payrollRun.findUnique({ where: { id } });
  if (!run) throw errors.notFound("سیشن معاشات");
  if (!canAccessBranch(ctx, "payroll.manage", run.branchId)) {
    throw errors.forbidden("این سیشن معاشات به شعبهٔ دیگری تعلق دارد.");
  }
  if (run.status !== "draft") {
    throw errors.badRequest("فقط سیشن در حالت پیش‌نویس قابل ویرایش است.");
  }
  await db.$transaction(async (tx) => {
    for (const it of dto.items) {
      const existing = await tx.payrollItem.findFirst({
        where: { id: it.id, payrollRunId: id },
      });
      if (!existing) continue;
      const net = existing.baseDiram + it.allowanceDiram + it.bonusDiram - it.deductionDiram;
      if (net < 0) {
        throw new ApiError(400, "VALIDATION_ERROR", "کسری نمی‌تواند بیش از معاش پایه و افزودنی‌ها باشد.");
      }
      await tx.payrollItem.update({
        where: { id: it.id },
        data: {
          allowanceDiram: it.allowanceDiram,
          bonusDiram: it.bonusDiram,
          deductionDiram: it.deductionDiram,
          netDiram: net,
          note: it.note ?? null,
        },
      });
    }
    const totals = await tx.payrollItem.aggregate({
      where: { payrollRunId: id },
      _sum: { netDiram: true },
    });
    await tx.payrollRun.update({
      where: { id },
      data: { totalsDiram: totals._sum.netDiram ?? 0 },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "payroll.update", entity: "PayrollRun", entityId: id,
      after: { items: dto.items.length, totalsDiram: totals._sum.netDiram ?? 0 },
      ip: ctx.ip,
    });
  });
  return getPayrollRun(ctx, id);
}

export async function payrollAction(ctx: AuthContext, id: string, dto: z.infer<typeof payrollActionDto>) {
  const run = await db.payrollRun.findUnique({ where: { id } });
  if (!run) throw errors.notFound("سیشن معاشات");
  if (!canAccessBranch(ctx, "payroll.manage", run.branchId)) {
    throw errors.forbidden("این سیشن معاشات به شعبهٔ دیگری تعلق دارد.");
  }

  if (dto.action === "approve") {
    if (run.status !== "draft") throw errors.badRequest("فقط سیشن پیش‌نویس قابل تایید است.");
    await db.$transaction(async (tx) => {
      await tx.payrollRun.update({
        where: { id },
        data: { status: "approved", approvedById: ctx.user.id, approvedAt: new Date() },
      });
      await writeAudit(tx, {
        actorId: ctx.user.id, actorName: ctx.user.fullName,
        action: "payroll.approve", entity: "PayrollRun", entityId: id,
        before: { status: run.status }, after: { status: "approved" },
        ip: ctx.ip,
      });
    });
    return { ok: true, status: "approved" };
  }

  // pay: approved → paid; records a salaries Expense in the same transaction.
  if (run.status !== "approved") throw errors.badRequest("ابتدا سیشن را تایید کنید، سپس پرداخت را ثبت نمایید.");
  const result = await db.$transaction(async (tx) => {
    await tx.payrollRun.update({
      where: { id },
      data: { status: "paid", paidById: ctx.user.id, paidAt: new Date() },
    });
    const year = await tx.academicYear.findFirst({ where: { isCurrent: true }, select: { name: true } });
    const seq = await nextDocNumber(tx, "expense", year?.name ?? "0000");
    const expense = await tx.expense.create({
      data: {
        orgId: run.orgId,
        expenseNumber: `E-${year?.name ?? "0000"}-${String(seq).padStart(4, "0")}`,
        branchId: run.branchId,
        date: todayIsoKabul(),
        category: "salaries",
        payee: run.periodLabel,
        amountDiram: run.totalsDiram,
        note: `پرداخت ${run.periodLabel} — سیشن معاشات`,
        paidById: ctx.user.id,
        approvedById: ctx.user.id,
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "payroll.pay", entity: "PayrollRun", entityId: id,
      before: { status: run.status },
      after: { status: "paid", totalsDiram: run.totalsDiram, expenseNumber: expense.expenseNumber },
      ip: ctx.ip,
    });
    return { ok: true, status: "paid", expenseNumber: expense.expenseNumber };
  });
  return result;
}

// ── Finance reports ─────────────────────────────────────────────────────────

export async function financeReports(ctx: AuthContext, monthKey?: string) {
  const month = monthKey && /^\d{4}-\d{2}$/.test(monthKey) ? monthKey : currentMonthKey();
  const months = recentMonthKeys(month, 6);

  const payIds = scopedBranchIds(ctx, "payments.view");
  const invIds = scopedBranchIds(ctx, "invoices.view");
  const expIds = scopedBranchIds(ctx, "expenses.view");
  const payIdsArr = payIds === "deny" ? ["__none__"] : payIds ?? null;
  const expIdsArr = expIds === "deny" ? ["__none__"] : expIds ?? null;
  const invIdsArr = invIds === "deny" ? ["__none__"] : invIds ?? null;

  const cur = monthRange(month);

  // Payments within the month (by value date).
  const [collected, monthPaymentsCount] = await Promise.all([
    db.payment.aggregate({
      where: {
        voidedAt: null,
        date: { gte: cur.start, lt: cur.end },
        ...(payIdsArr ? { branchId: { in: payIdsArr } } : {}),
      },
      _sum: { amountDiram: true },
    }),
    db.payment.count({
      where: {
        voidedAt: null,
        date: { gte: cur.start, lt: cur.end },
        ...(payIdsArr ? { branchId: { in: payIdsArr } } : {}),
      },
    }),
  ]);

  // Invoices issued for the period.
  const [invoiced, invoiceCount] = await Promise.all([
    db.invoice.aggregate({
      where: { periodKey: month, status: { not: "void" }, ...(invIdsArr ? { branchId: { in: invIdsArr } } : {}) },
      _sum: { netDiram: true },
    }),
    db.invoice.count({
      where: { periodKey: month, status: { not: "void" }, ...(invIdsArr ? { branchId: { in: invIdsArr } } : {}) },
    }),
  ]);

  // Outstanding balances (live invoices with paid < net).
  const outstandingRows = await db.invoice.findMany({
    where: {
      status: { in: ["issued", "partially_paid"] },
      ...(invIdsArr ? { branchId: { in: invIdsArr } } : {}),
    },
    include: {
      student: { select: { id: true, studentNumber: true, personal: true } },
      branch: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  const outstandingTotal = outstandingRows.reduce((s, r) => s + (r.netDiram - r.paidDiram), 0);

  // Expenses of the month.
  const [expenses, expenseCount] = await Promise.all([
    db.expense.aggregate({
      where: {
        voidedAt: null,
        date: { gte: cur.start, lt: cur.end },
        ...(expIdsArr ? { branchId: { in: expIdsArr } } : {}),
      },
      _sum: { amountDiram: true },
    }),
    db.expense.count({
      where: {
        voidedAt: null,
        date: { gte: cur.start, lt: cur.end },
        ...(expIdsArr ? { branchId: { in: expIdsArr } } : {}),
      },
    }),
  ]);

  // Payroll runs of the period.
  const runs = await db.payrollRun.findMany({
    where: { periodKey: month, status: "paid", ...(payIdsArr ? { branchId: { in: payIdsArr } } : {}) },
    select: { id: true, branchId: true, totalsDiram: true },
  });

  // Six-month income vs expense series.
  const series: Array<{ key: string; label: string; incomeDiram: number; expenseDiram: number }> = [];
  for (const key of months) {
    const r = monthRange(key);
    const [inc, exp] = await Promise.all([
      db.payment.aggregate({
        where: { voidedAt: null, date: { gte: r.start, lt: r.end }, ...(payIdsArr ? { branchId: { in: payIdsArr } } : {}) },
        _sum: { amountDiram: true },
      }),
      db.expense.aggregate({
        where: { voidedAt: null, date: { gte: r.start, lt: r.end }, ...(expIdsArr ? { branchId: { in: expIdsArr } } : {}) },
        _sum: { amountDiram: true },
      }),
    ]);
    series.push({
      key,
      label: jalaliMonthLabel(key),
      incomeDiram: inc._sum.amountDiram ?? 0,
      expenseDiram: exp._sum.amountDiram ?? 0,
    });
  }

  // Top debtors.
  const debtorMap = new Map<string, {
    studentId: string; studentNumber: string; name: string; balance: number; branchName: string;
  }>();
  for (const r of outstandingRows) {
    const bal = r.netDiram - r.paidDiram;
    if (bal <= 0) continue;
    let name = "";
    try { name = JSON.parse(r.student.personal).firstName ?? ""; } catch { /* noop */ }
    const prev = debtorMap.get(r.studentId);
    const entry = {
      studentId: r.studentId,
      studentNumber: r.student.studentNumber,
      name,
      balance: (prev?.balance ?? 0) + bal,
      branchName: r.branch?.name ?? "",
    };
    debtorMap.set(r.studentId, entry);
  }
  const topDebtors = [...debtorMap.values()].sort((a, b) => b.balance - a.balance).slice(0, 10);

  return {
    month: { key: month, label: jalaliMonthLabel(month) },
    collection: { totalDiram: collected._sum.amountDiram ?? 0, count: monthPaymentsCount },
    invoiced: { totalNetDiram: invoiced._sum.netDiram ?? 0, count: invoiceCount },
    outstanding: { totalDiram: outstandingTotal, count: outstandingRows.length },
    expenses: { totalDiram: expenses._sum.amountDiram ?? 0, count: expenseCount },
    payroll: {
      totalDiram: runs.reduce((s, r) => s + r.totalsDiram, 0),
      runsCount: runs.length,
    },
    series,
    topDebtors,
  };
}

export { dateInput };
