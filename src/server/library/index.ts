// Library module — Phase 4: catalog (titles), physical copies, loans and
// fines linked to the finance module.
//
// INVARIANTS:
//  - TITLE vs COPY: BookTitle is the catalog entry; BookCopy is the physical
//    item. Only copies circulate.
//  - ONE ACTIVE LOAN PER COPY: checkout flips copy.status "available" →
//    "loaned" with a CONDITIONAL updateMany inside the transaction — a
//    second concurrent checkout of the same copy updates 0 rows and aborts
//    (409). SQLite cannot express a partial unique index, so this
//    transactional check IS the constraint.
//  - FINES ARE INVOICES: lost/late charges are issued as Invoice rows
//    (periodKey "fine:<loanId>") — money handling stays in one place, with
//    payments, voiding and audit already implemented there.
//  - BRANCH ISOLATION: catalog, copies and loans carry branchId; branch
//    roles see only their own branch. Only admin / general_manager cross.
//  - NUMBERING: copy codes "B-<yearName>-<NNNN>" from the monotonic Counter
//    table inside the owning transaction.

import { z } from "zod";
import { db } from "@/lib/db";
import { errors } from "@/server/shared/http";
import { writeAudit, nextDocNumber } from "@/server/shared/audit";
import { directBranchFilter, canAccessBranch } from "@/server/rbac/scope";
import { dateInput } from "@/server/academic";
import { todayIsoKabul } from "@/server/shared/jalali";
import type { AuthContext } from "@/server/auth/context";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

// ── Labels (Dari) ───────────────────────────────────────────────────────────

export const COPY_STATUSES = ["available", "loaned", "lost", "withdrawn"] as const;
export const COPY_STATUS_LABELS: Record<string, string> = {
  available: "موجود",
  loaned: "امانت‌شده",
  lost: "گم‌شده",
  withdrawn: "کنارگذاشته",
};

export const LOAN_STATUSES = ["active", "returned", "lost"] as const;
export const LOAN_STATUS_LABELS: Record<string, string> = {
  active: "جاری",
  returned: "برگشت‌شده",
  lost: "گم‌شده",
};

// ── Branch scope helper ─────────────────────────────────────────────────────

function scopedBranchIds(ctx: AuthContext, permission: string): string[] | null | "deny" {
  const f = directBranchFilter(ctx, permission);
  if (!f) return "deny";
  return f.branchIds;
}

/** Branch the library action should record/be limited to. */
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

// ── DTOs ────────────────────────────────────────────────────────────────────

const diram = z.coerce.number().int("مبلغ باید عدد صحیح باشد.").min(0);

export const bookTitleDto = z.object({
  branchId: z.string().optional().nullable(),
  title: z.string().min(2, "نام کتاب را وارد کنید.").max(120),
  author: z.string().max(80).optional().nullable(),
  publisher: z.string().max(80).optional().nullable(),
  subjectId: z.string().optional().nullable(),
  gradeLevels: z.array(z.coerce.number().int().min(1).max(12)).default([]),
  isTextbook: z.boolean().default(false),
  note: z.string().max(200).optional().nullable(),
});

export const bookTitleUpdateDto = bookTitleDto.partial().extend({
  isActive: z.boolean().optional(),
});

export const bookCopiesDto = z.object({
  titleId: z.string().min(1, "کتاب را انتخاب کنید."),
  count: z.coerce.number().int().min(1, "حداقل یک نسخه.").max(200, "حداکثر ۲۰۰ نسخه در یک بار."),
  condition: z.string().max(60).optional().nullable(),
});

export const copyUpdateDto = z.object({
  status: z.enum(["available", "withdrawn"]),
  condition: z.string().max(60).optional().nullable(),
});

export const loanCheckoutDto = z.object({
  copyId: z.string().min(1, "نسخهٔ کتاب را انتخاب کنید."),
  studentId: z.string().min(1, "شاگرد را انتخاب کنید."),
  dueOn: dateInput,
  note: z.string().max(200).optional().nullable(),
});

export const loanReturnDto = z.object({
  fineDiram: diram.max(10_000_000, "مبلغ جریمه بیش از حد بزرگ است.").default(0),
  note: z.string().max(200).optional().nullable(),
});

export const loanLostDto = z.object({
  fineDiram: diram.max(10_000_000, "مبلغ جریمه بیش از حد بزرگ است."),
  note: z.string().max(200).optional().nullable(),
});

// ── Titles ──────────────────────────────────────────────────────────────────

const TITLE_INCLUDE = {
  subject: { select: { id: true, nameDari: true } },
  _count: { select: { copies: true } },
} as const;

function publicTitle(row: {
  id: string; branchId: string; title: string; author: string | null; publisher: string | null;
  subjectId: string | null; gradeLevels: string; isTextbook: boolean; isActive: boolean;
  note: string | null; createdAt: Date;
  subject: { id: string; nameDari: string } | null;
  _count?: { copies: number };
}) {
  let gradeLevels: number[] = [];
  try { gradeLevels = JSON.parse(row.gradeLevels ?? "[]"); } catch { /* noop */ }
  return {
    id: row.id,
    branchId: row.branchId,
    title: row.title,
    author: row.author,
    publisher: row.publisher,
    subjectId: row.subjectId,
    subjectName: row.subject?.nameDari ?? null,
    gradeLevels,
    isTextbook: row.isTextbook,
    isActive: row.isActive,
    note: row.note,
    copyCount: row._count?.copies ?? 0,
    createdAt: row.createdAt,
  };
}

export async function listTitles(ctx: AuthContext, filters: { q?: string; subjectId?: string; isTextbook?: string }) {
  const ids = scopedBranchIds(ctx, "library.view");
  if (ids === "deny") return [];
  const where: Prisma.BookTitleWhereInput = {
    AND: [
      ids === null ? {} : { branchId: { in: ids } },
      ...(filters.q ? [{ title: { contains: filters.q } }] : []),
      ...(filters.subjectId ? [{ subjectId: filters.subjectId }] : []),
      ...(filters.isTextbook !== undefined ? [{ isTextbook: filters.isTextbook === "true" }] : []),
    ],
  };
  const rows = await db.bookTitle.findMany({
    where,
    include: TITLE_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return rows.map(publicTitle);
}

export async function createTitle(ctx: AuthContext, dto: z.infer<typeof bookTitleDto>) {
  const org = await db.organization.findFirst({ select: { id: true } });
  if (!org) throw errors.notFound("مکتب");
  const branchId = await resolveActionBranch(ctx, "library.manage", dto.branchId);
  if (dto.subjectId) {
    const subject = await db.subject.findUnique({ where: { id: dto.subjectId } });
    if (!subject || subject.orgId !== org.id) throw errors.notFound("مضمون");
  }
  const duplicate = await db.bookTitle.findFirst({ where: { branchId, title: dto.title } });
  if (duplicate) {
    throw errors.conflict("کتابی با همین نام در این شعبه قبلاً ثبت شده است.");
  }
  return db.$transaction(async (tx) => {
    const row = await tx.bookTitle.create({
      data: {
        orgId: org.id,
        branchId,
        title: dto.title,
        author: dto.author ?? null,
        publisher: dto.publisher ?? null,
        subjectId: dto.subjectId ?? null,
        gradeLevels: JSON.stringify(dto.gradeLevels ?? []),
        isTextbook: dto.isTextbook,
        note: dto.note ?? null,
        createdById: ctx.user.id,
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "book.title.create", entity: "BookTitle", entityId: row.id,
      after: { title: row.title, branchId, isTextbook: row.isTextbook },
      ip: ctx.ip,
    });
    return publicTitle({ ...row, subject: null });
  });
}

export async function updateTitle(ctx: AuthContext, id: string, dto: z.infer<typeof bookTitleUpdateDto>) {
  const row = await db.bookTitle.findUnique({ where: { id }, include: TITLE_INCLUDE });
  if (!row) throw errors.notFound("کتاب");
  if (!canAccessBranch(ctx, "library.manage", row.branchId)) {
    throw errors.forbidden("این کتاب به شعبهٔ دیگری تعلق دارد.");
  }
  const updated = await db.$transaction(async (tx) => {
    const next = await tx.bookTitle.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.author !== undefined ? { author: dto.author ?? null } : {}),
        ...(dto.publisher !== undefined ? { publisher: dto.publisher ?? null } : {}),
        ...(dto.subjectId !== undefined ? { subjectId: dto.subjectId ?? null } : {}),
        ...(dto.gradeLevels !== undefined ? { gradeLevels: JSON.stringify(dto.gradeLevels) } : {}),
        ...(dto.isTextbook !== undefined ? { isTextbook: dto.isTextbook } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.note !== undefined ? { note: dto.note ?? null } : {}),
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "book.title.update", entity: "BookTitle", entityId: id,
      before: { title: row.title, isActive: row.isActive },
      after: { title: next.title, isActive: next.isActive },
      ip: ctx.ip,
    });
    return next;
  });
  return publicTitle({ ...updated, subject: row.subject, _count: row._count });
}

// ── Copies ──────────────────────────────────────────────────────────────────

const COPY_INCLUDE = {
  title: { select: { id: true, title: true, isTextbook: true } },
} as const;

function publicCopy(row: {
  id: string; titleId: string; branchId: string; copyCode: string; status: string;
  condition: string | null; createdAt: Date;
  title: { id: string; title: string; isTextbook: boolean };
}) {
  return {
    id: row.id,
    titleId: row.titleId,
    bookTitle: row.title.title,
    branchId: row.branchId,
    copyCode: row.copyCode,
    status: row.status,
    statusLabel: COPY_STATUS_LABELS[row.status] ?? row.status,
    condition: row.condition,
    createdAt: row.createdAt,
  };
}

export async function listCopies(ctx: AuthContext, filters: { titleId?: string; status?: string; q?: string }) {
  const ids = scopedBranchIds(ctx, "library.view");
  if (ids === "deny") return [];
  const where: Prisma.BookCopyWhereInput = {
    AND: [
      ids === null ? {} : { branchId: { in: ids } },
      ...(filters.titleId ? [{ titleId: filters.titleId }] : []),
      ...(filters.status ? [{ status: filters.status }] : []),
      ...(filters.q ? [{ copyCode: { contains: filters.q } }] : []),
    ],
  };
  const rows = await db.bookCopy.findMany({
    where,
    include: COPY_INCLUDE,
    orderBy: { copyCode: "asc" },
    take: 500,
  });
  return rows.map(publicCopy);
}

export async function addCopies(ctx: AuthContext, dto: z.infer<typeof bookCopiesDto>) {
  const title = await db.bookTitle.findUnique({ where: { id: dto.titleId } });
  if (!title) throw errors.notFound("کتاب");
  if (!title.isActive) throw errors.badRequest("این کتاب غیرفعال است.");
  if (!canAccessBranch(ctx, "library.manage", title.branchId)) {
    throw errors.forbidden("این کتاب به شعبهٔ دیگری تعلق دارد.");
  }
  const year = await db.academicYear.findFirst({ where: { orgId: title.orgId, isCurrent: true } });
  const yearName = year?.name ?? "0000";

  return db.$transaction(async (tx) => {
    const codes: string[] = [];
    for (let i = 0; i < dto.count; i++) {
      const seq = await nextDocNumber(tx, "book", yearName);
      const copy = await tx.bookCopy.create({
        data: {
          orgId: title.orgId,
          titleId: title.id,
          branchId: title.branchId,
          copyCode: `B-${yearName}-${String(seq).padStart(4, "0")}`,
          status: "available",
          condition: dto.condition ?? null,
        },
      });
      codes.push(copy.copyCode);
    }
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "book.copies.add", entity: "BookTitle", entityId: title.id,
      after: { count: dto.count, from: codes[0], to: codes[codes.length - 1] },
      ip: ctx.ip,
    });
    return { createdCount: codes.length, codes };
  });
}

export async function updateCopy(ctx: AuthContext, id: string, dto: z.infer<typeof copyUpdateDto>) {
  const row = await db.bookCopy.findUnique({ where: { id }, include: COPY_INCLUDE });
  if (!row) throw errors.notFound("نسخهٔ کتاب");
  if (!canAccessBranch(ctx, "library.manage", row.branchId)) {
    throw errors.forbidden("این نسخه به شعبهٔ دیگری تعلق دارد.");
  }
  if (row.status === "loaned") {
    throw errors.badRequest("نسخهٔ امانت‌شده را نمی‌توان تغییر داد؛ ابتدا امانت را ببندید.");
  }
  if (row.status === "lost") {
    throw errors.badRequest("نسخهٔ گم‌شده قابل تغییر نیست.");
  }
  if (dto.status === "withdrawn" && row.status !== "available") {
    throw errors.badRequest("فقط نسخهٔ موجود را می‌توان کنار گذاشت.");
  }
  const updated = await db.$transaction(async (tx) => {
    const next = await tx.bookCopy.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.condition !== undefined ? { condition: dto.condition ?? null } : {}),
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "book.copy.update", entity: "BookCopy", entityId: id,
      before: { status: row.status }, after: { status: next.status },
      ip: ctx.ip,
    });
    return next;
  });
  return publicCopy({ ...updated, title: row.title });
}

// ── Loans ───────────────────────────────────────────────────────────────────

const LOAN_INCLUDE = {
  copy: { select: { id: true, copyCode: true, status: true, title: { select: { id: true, title: true } } } },
  student: { select: { id: true, studentNumber: true, personal: true } },
} as const;

function publicLoan(row: {
  id: string; copyId: string; studentId: string; branchId: string; loanedOn: string; dueOn: string;
  returnedOn: string | null; status: string; fineDiram: number; note: string | null;
  createdAt: Date; updatedAt: Date;
  copy: { id: string; copyCode: string; status: string; title: { id: string; title: string } };
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
    copyId: row.copyId,
    copyCode: row.copy.copyCode,
    bookTitle: row.copy.title.title,
    studentId: row.studentId,
    studentNumber: row.student?.studentNumber ?? "",
    studentName: firstName,
    fatherName,
    branchId: row.branchId,
    loanedOn: row.loanedOn,
    dueOn: row.dueOn,
    returnedOn: row.returnedOn,
    status: row.status,
    statusLabel: LOAN_STATUS_LABELS[row.status] ?? row.status,
    fineDiram: row.fineDiram,
    note: row.note,
    isOverdue: row.status === "active" && row.dueOn < todayIsoKabul(),
    createdAt: row.createdAt,
  };
}

export async function listLoans(ctx: AuthContext, filters: { status?: string; studentId?: string; q?: string }) {
  const ids = scopedBranchIds(ctx, "library.view");
  if (ids === "deny") return [];
  const where: Prisma.BookLoanWhereInput = {
    AND: [
      ids === null ? {} : { branchId: { in: ids } },
      ...(filters.status ? [{ status: filters.status }] : []),
      ...(filters.studentId ? [{ studentId: filters.studentId }] : []),
      ...(filters.q
        ? [{
            OR: [
              { copy: { copyCode: { contains: filters.q } } },
              { copy: { title: { title: { contains: filters.q } } } },
              { student: { studentNumber: { contains: filters.q } } },
            ],
          }]
        : []),
    ],
  };
  const rows = await db.bookLoan.findMany({
    where,
    include: LOAN_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return rows.map(publicLoan);
}

export async function checkoutLoan(ctx: AuthContext, dto: z.infer<typeof loanCheckoutDto>) {
  const copy = await db.bookCopy.findUnique({ where: { id: dto.copyId }, include: COPY_INCLUDE });
  if (!copy) throw errors.notFound("نسخهٔ کتاب");
  if (!canAccessBranch(ctx, "library.manage", copy.branchId)) {
    throw errors.forbidden("این نسخه به شعبهٔ دیگری تعلق دارد.");
  }
  const student = await db.student.findUnique({ where: { id: dto.studentId } });
  if (!student) throw errors.notFound("شاگرد");
  if (student.status !== "active") {
    throw errors.badRequest("فقط شاگردان فعال می‌توانند کتاب امانت بگیرند.");
  }
  // The student must belong to the same branch (active enrollment in one of
  // the branch's sections of the current year) — branch isolation.
  const year = await db.academicYear.findFirst({ where: { orgId: student.orgId, isCurrent: true } });
  if (!year) throw errors.badRequest("سال تعلیمی جاری پیدا نشد.");
  const enrollment = await db.enrollment.findFirst({
    where: {
      studentId: student.id,
      academicYearId: year.id,
      status: "active",
      classSection: { branchId: copy.branchId },
    },
    select: { id: true },
  });
  if (!enrollment) {
    throw errors.badRequest("این شاگرد در شعبهٔ این کتاب ثبت نشده است.");
  }
  if (dto.dueOn <= todayIsoKabul()) {
    throw errors.badRequest("تاریخ بازگشت باید بعد از امروز باشد.");
  }

  return db.$transaction(async (tx) => {
    // THE constraint: conditional flip available → loaned. Concurrent or
    // duplicate checkouts update 0 rows → 409. This is what makes "no two
    // active loans of one copy" true on SQLite (no partial unique index).
    const flipped = await tx.bookCopy.updateMany({
      where: { id: copy.id, status: "available" },
      data: { status: "loaned" },
    });
    if (flipped.count === 0) {
      throw errors.conflict("این نسخهٔ کتاب در حال حاضر امانت است یا قابل امانت نیست.");
    }
    const loan = await tx.bookLoan.create({
      data: {
        orgId: copy.orgId,
        copyId: copy.id,
        studentId: student.id,
        branchId: copy.branchId,
        loanedOn: todayIsoKabul(),
        dueOn: dto.dueOn,
        status: "active",
        note: dto.note ?? null,
        loanedById: ctx.user.id,
      },
      include: LOAN_INCLUDE,
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "book.loan.checkout", entity: "BookLoan", entityId: loan.id,
      after: { copyCode: copy.copyCode, studentId: student.id, dueOn: dto.dueOn },
      ip: ctx.ip,
    });
    return publicLoan(loan);
  });
}

/** Issues the fine as a REAL finance invoice (periodKey "fine:<loanId>"). */
async function issueFineInvoice(
  tx: Tx,
  ctx: AuthContext,
  loanId: string,
  studentId: string,
  branchId: string,
  orgId: string,
  amountDiram: number,
  bookTitle: string,
): Promise<string> {
  const year = await tx.academicYear.findFirst({ where: { orgId, isCurrent: true } });
  if (!year) throw errors.badRequest("سال تعلیمی جاری پیدا نشد.");
  const seq = await nextDocNumber(tx, "invoice", year.name);
  const invoice = await tx.invoice.create({
    data: {
      orgId,
      invoiceNumber: `F-${year.name}-${String(seq).padStart(4, "0")}`,
      academicYearId: year.id,
      branchId,
      studentId,
      feeStructureId: null,
      periodKey: `fine:${loanId}`,
      periodLabel: `جریمهٔ کتاب «${bookTitle}»`,
      amountDiram,
      discountDiram: 0,
      netDiram: amountDiram,
      paidDiram: 0,
      status: "issued",
      note: "جریمهٔ کتابخانه",
      issuedById: ctx.user.id,
    },
  });
  return invoice.id;
}

export async function returnLoan(ctx: AuthContext, id: string, dto: z.infer<typeof loanReturnDto>) {
  const loan = await db.bookLoan.findUnique({ where: { id }, include: LOAN_INCLUDE });
  if (!loan) throw errors.notFound("امانت");
  if (!canAccessBranch(ctx, "library.manage", loan.branchId)) {
    throw errors.forbidden("این امانت به شعبهٔ دیگری تعلق دارد.");
  }
  if (loan.status !== "active") {
    throw errors.badRequest("این امانت قبلاً بسته شده است.");
  }
  const today = todayIsoKabul();

  return db.$transaction(async (tx) => {
    // Late return with a fine → linked invoice first (same transaction).
    let fineInvoiceId: string | null = null;
    if (dto.fineDiram > 0) {
      if (today <= loan.dueOn) {
        throw errors.badRequest("امانت به‌وقت است؛ جریمه فقط برای بازگشت دیرتر مجاز است.");
      }
      fineInvoiceId = await issueFineInvoice(
        tx, ctx, loan.id, loan.studentId, loan.branchId, loan.orgId,
        dto.fineDiram, loan.copy.title.title,
      );
    }
    const updated = await tx.bookLoan.update({
      where: { id },
      data: {
        status: "returned",
        returnedOn: today,
        fineDiram: dto.fineDiram,
        fineInvoiceId,
        note: dto.note ?? loan.note,
        returnedById: ctx.user.id,
      },
      include: LOAN_INCLUDE,
    });
    await tx.bookCopy.update({
      where: { id: loan.copyId },
      data: { status: "available" },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "book.loan.return", entity: "BookLoan", entityId: id,
      before: { status: "active" },
      after: { status: "returned", fineDiram: dto.fineDiram, fineInvoiceId },
      ip: ctx.ip,
    });
    return publicLoan(updated);
  });
}

export async function markLoanLost(ctx: AuthContext, id: string, dto: z.infer<typeof loanLostDto>) {
  const loan = await db.bookLoan.findUnique({ where: { id }, include: LOAN_INCLUDE });
  if (!loan) throw errors.notFound("امانت");
  if (!canAccessBranch(ctx, "library.manage", loan.branchId)) {
    throw errors.forbidden("این امانت به شعبهٔ دیگری تعلق دارد.");
  }
  if (loan.status !== "active") {
    throw errors.badRequest("این امانت قبلاً بسته شده است.");
  }

  return db.$transaction(async (tx) => {
    const fineInvoiceId = dto.fineDiram > 0
      ? await issueFineInvoice(
          tx, ctx, loan.id, loan.studentId, loan.branchId, loan.orgId,
          dto.fineDiram, loan.copy.title.title,
        )
      : null;
    const updated = await tx.bookLoan.update({
      where: { id },
      data: {
        status: "lost",
        fineDiram: dto.fineDiram,
        fineInvoiceId,
        note: dto.note ?? loan.note,
        returnedById: ctx.user.id,
      },
      include: LOAN_INCLUDE,
    });
    await tx.bookCopy.update({
      where: { id: loan.copyId },
      data: { status: "lost" },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "book.loan.lost", entity: "BookLoan", entityId: id,
      before: { status: "active" },
      after: { status: "lost", fineDiram: dto.fineDiram, fineInvoiceId },
      ip: ctx.ip,
    });
    return publicLoan(updated);
  });
}

// ── Library dashboard stats ─────────────────────────────────────────────────

export async function libraryStats(ctx: AuthContext) {
  const ids = scopedBranchIds(ctx, "library.view");
  if (ids === "deny") {
    return { titleCount: 0, copyCount: 0, availableCount: 0, activeLoans: 0, overdueLoans: 0 };
  }
  const branchWhere = ids === null ? {} : { branchId: { in: ids } };
  const today = todayIsoKabul();
  const [titleCount, copyCount, availableCount, activeLoans, overdueLoans] = await Promise.all([
    db.bookTitle.count({ where: { ...branchWhere, isActive: true } }),
    db.bookCopy.count({ where: branchWhere }),
    db.bookCopy.count({ where: { ...branchWhere, status: "available" } }),
    db.bookLoan.count({ where: { ...branchWhere, status: "active" } }),
    db.bookLoan.count({ where: { ...branchWhere, status: "active", dueOn: { lt: today } } }),
  ]);
  return { titleCount, copyCount, availableCount, activeLoans, overdueLoans };
}


