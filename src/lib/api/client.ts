// Typed client for the /api/v1 REST contract.
// The web SPA and any future mobile client consume the SAME endpoints.
// Business operations never go through Next.js Server Actions.

export class ApiClientError extends Error {
  status: number;
  code: string;
  details?: { field: string; message: string }[];

  constructor(
    status: number,
    code: string,
    message: string,
    details?: { field: string; message: string }[],
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface Envelope<T> {
  data?: T;
  meta?: Record<string, unknown>;
  error?: { code: string; message: string; details?: { field: string; message: string }[] };
}

async function request<T>(
  path: string,
  init?: RequestInit & { meta?: "list" },
): Promise<{ data: T; meta?: Record<string, unknown> }> {
  // Active branch context for admin / general_manager (and multi-branch
  // users). Empty string / "all" = org-wide. The SERVER re-validates this
  // hint against the user's own branches — it is never trusted blindly.
  let branchHeader: Record<string, string> = {};
  if (typeof window !== "undefined") {
    const b = window.localStorage.getItem("maktabyar:branch");
    if (b && b !== "all") branchHeader = { "x-maktabyar-branch": b };
  }
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "x-maktabyar-client": "1",
        ...branchHeader,
        ...(init?.headers ?? {}),
      },
      credentials: "same-origin",
    });
  } catch {
    throw new ApiClientError(0, "NETWORK", "ارتباط با سرور برقرار نشد. اتصال انترنت را بررسی کنید.");
  }
  let body: Envelope<T> | null = null;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    body = null;
  }
  if (!res.ok) {
    throw new ApiClientError(
      res.status,
      body?.error?.code ?? "UNKNOWN",
      body?.error?.message ?? "خطای غیرمنتظره رخ داد.",
      body?.error?.details,
    );
  }
  return { data: body?.data as T, meta: body?.meta };
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  list: <T>(path: string) => request<T[]>(path, { method: "GET", meta: "list" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  /** Raw text (CSV export) with the same auth/CSRF headers as JSON calls. */
  getRaw: async (path: string): Promise<string> => {
    let branchHeader: Record<string, string> = {};
    if (typeof window !== "undefined") {
      const b = window.localStorage.getItem("maktabyar:branch");
      if (b && b !== "all") branchHeader = { "x-maktabyar-branch": b };
    }
    let res: Response;
    try {
      res = await fetch(`/api/v1${path}`, {
        headers: { "x-maktabyar-client": "1", ...branchHeader },
        credentials: "same-origin",
      });
    } catch {
      throw new ApiClientError(0, "NETWORK", "ارتباط با سرور برقرار نشد. اتصال انترنت را بررسی کنید.");
    }
    if (!res.ok) {
      let message = "خطای غیرمنتظره رخ داد.";
      try {
        const j = (await res.json()) as Envelope<unknown>;
        message = j.error?.message ?? message;
      } catch { /* not JSON */ }
      throw new ApiClientError(res.status, "UNKNOWN", message);
    }
    return res.text();
  },
};

// ── Shared DTO types (mirror of server DTOs) ────────────────────────────────

export interface MeResponse {
  user: {
    id: string;
    username: string;
    fullName: string;
    phone: string | null;
    email: string | null;
    mustChangePassword: boolean;
    guardianId: string | null;
    linkedStudentId: string | null;
  };
  roles: string[];
  grants: Array<{
    permission: string;
    scope: string;
    branchId: string | null;
    academicYearId: string | null;
    sectionIds: string[];
  }>;
  branchId: string | null;
  /** Branches this user is bound to (UserRole.branchId values). */
  ownBranchIds: string[];
  /** Only admin / general_manager may cross branch boundaries. */
  isCrossBranch: boolean;
}

export interface OrgContext {
  org: {
    id: string;
    productName: string;
    name: string;
    schoolType: string;
    province: string | null;
    district: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    emisCode: string | null;
    registrationNumber: string | null;
    reportHeading: string | null;
    reportFooter: string | null;
    isConfigured: boolean;
    version: number;
  } | null;
  branches: Array<{ id: string; name: string; code: string; isActive: boolean }>;
  currentYear: { id: string; name: string; startDate: string; endDate: string; isCurrent: boolean; status: string } | null;
  shifts: Array<{ id: string; name: string; startTime: string; endTime: string }>;
}

export interface StudentListItem {
  id: string;
  studentNumber: string;
  status: string;
  statusLabel: string;
  personal: Record<string, string | null>;
  currentEnrollment: {
    gradeName: string;
    gradeLevelId: string;
    sectionLabel: string | null;
    classSectionId: string | null;
    branchName: string | null;
    shiftName: string | null;
    rollNumber: number | null;
    enrolledOn: string;
    status: string;
  } | null;
  guardianSummary: Array<{ id: string; fullName: string; relationship: string; isPrimary: boolean }>;
  version: number;
  createdAt: string;
}

export interface StudentProfile {
  id: string;
  studentNumber: string;
  status: string;
  statusLabel: string;
  statusNote: string | null;
  application: { id: string; applicantNumber: string; status: string } | null;
  personal: Record<string, string | null>;
  canSeeSensitive: boolean;
  enrollments: Array<{
    id: string;
    academicYearName: string;
    academicYearId: string;
    gradeName: string;
    gradeLevelId: string;
    classSectionId: string | null;
    sectionLabel: string | null;
    branchName: string | null;
    shiftName: string | null;
    rollNumber: number | null;
    enrolledOn: string;
    status: string;
    statusLabel: string;
  }>;
  guardians: Array<{
    id: string;
    linkId: string;
    fullName: string;
    relationship: string;
    isPrimary: boolean;
    contactRights: boolean;
    phone: string | null;
    phone2: string | null;
    occupation: string | null;
    address: string | null;
    portalAccess: boolean;
  }>;
  documents: Array<{ id: string; type: string; title: string; isVerified: boolean; uploadedAt: string }>;
  recentAudit: Array<{ id: string; action: string; actorName: string; at: string; reason: string | null }>;
  version: number;
  createdAt: string;
}

export interface ApplicationDto {
  id: string;
  applicantNumber: string;
  academicYearId: string;
  academicYearName: string | null;
  requestedGradeId: string | null;
  requestedGradeName: string | null;
  requestedSectionId: string | null;
  requestedShiftId: string | null;
  personal: Record<string, string | null>;
  guardians: Array<{
    fullName: string;
    relationship: string;
    phone: string;
    phone2?: string | null;
    occupation?: string | null;
    isPrimary: boolean;
    contactRights: boolean;
    portalAccess: boolean;
  }>;
  documents: Array<{ type: string; title: string; provided: boolean }>;
  status: string;
  statusLabel: string;
  decisionNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  decidedAt: string | null;
  enrolledAt: string | null;
  version: number;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListMeta {
  total: number;
  page: number;
  pageSize: number;
}

export interface DashboardSummary {
  orgName: string;
  productName: string;
  academicYearName: string | null;
  today: string;
  todayJalali: string;
  weekday: string;
  roleKeys: string[];
  students: { total: number; active: number; male: number; female: number } | null;
  applications: Array<{ status: string; count: number }> | null;
  sections: {
    count: number;
    totalCapacity: number;
    totalEnrolled: number;
    byGrade: Array<{ gradeName: string; label: string; enrolled: number; capacity: number }>;
  } | null;
  assignedSections?: Array<{ id: string; gradeName: string; label: string; students: number }>;
  attendanceToday?: Array<{ id: string; sectionId: string; gradeName: string; sectionLabel: string }>;
  todayClasses?: Array<{ period: number; subjectName: string; gradeName: string; sectionLabel: string; roomName: string | null }>;
  attendanceOverviewToday?: { submitted: number; open: number };
  recentGrades?: Array<{
    studentId: string; firstName: string; title: string; subjectName: string;
    score: number | null; maxScore: number; isAbsent: boolean; at: string;
  }>;
  children?: Array<{
    studentId: string;
    studentNumber: string;
    firstName: string;
    gradeName: string | null;
    sectionLabel: string | null;
    status: string;
  }>;
  recentAudit?: Array<{ id: string; action: string; actorName: string; entity: string; at: string }>;
  unreadNotifications: number;
}

export interface SearchHit {
  kind: "student" | "application" | "user";
  id: string;
  title: string;
  subtitle: string;
  route: string;
}

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface AuditEventDto {
  id: string;
  actorName: string;
  action: string;
  entity: string;
  entityId: string;
  reason: string | null;
  ip: string | null;
  at: string;
}

export interface UserDto {
  id: string;
  username: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  roles: Array<{
    roleKey: string;
    branchName: string | null;
    academicYearId: string | null;
    sectionIds: string[];
  }>;
  guardian: { id: string; fullName: string } | null;
}

export interface GradeLevelDto { id: string; level: number; nameDari: string }
export interface SectionDto {
  id: string;
  label: string;
  capacity: number;
  roomName: string | null;
  gradeLevel: { id: string; level: number; nameDari: string };
  branch: { id: string; name: string };
  shift: { id: string; name: string } | null;
  _count: { enrollments: number };
}
export interface AcademicYearDto {
  id: string; name: string; startDate: string; endDate: string;
  isCurrent: boolean; status: string;
}
export interface SubjectDto { id: string; nameDari: string; code: string; isActive: boolean }
export interface AppSettingsDto {
  modules: Record<string, boolean>;
  locale: { defaultCurrency: string; timezone: string; calendar: string };
}
export interface GuardianDto {
  id: string;
  fullName: string;
  relationship: string;
  phone: string | null;
  phone2: string | null;
  occupation: string | null;
  address: string | null;
  canPickUp: boolean;
  portalAccess: boolean;
  children: Array<{ studentId: string; studentNumber: string; firstName: string; relationship: string; isPrimary: boolean }>;
}

// ── Phase 2 DTOs ────────────────────────────────────────────────────────────

export interface StaffDto {
  id: string;
  fullName: string;
  fatherName: string;
  gender: string;
  birthDate: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  branchId: string | null;
  branchName: string | null;
  position: string;
  qualification: string | null;
  hireDate: string | null;
  employmentType: string;
  specialtySubjectIds: string[];
  status: string;
  statusNote: string | null;
  portal: { id: string; username: string; isActive: boolean } | null;
  teachingAssignmentCount: number;
  version: number;
  createdAt: string;
}

export interface StaffDetailDto extends StaffDto {
  assignments: Array<{
    id: string; academicYearId: string; academicYearName: string;
    sectionId: string; gradeName: string; sectionLabel: string;
    subjectId: string; subjectName: string;
  }>;
}

export interface TeachingAssignmentDto {
  id: string;
  academicYearId: string;
  classSectionId: string;
  staffId: string;
  subjectId: string;
  staff: { id: string; fullName: string; status: string };
  subject: { id: string; nameDari: string };
  classSection: {
    id: string; label: string;
    gradeLevel: { level: number; nameDari: string };
    branch: { id: string; name: string };
  };
}

export interface TimetableSlotDto {
  id: string;
  classSectionId: string;
  gradeName: string;
  sectionLabel: string;
  branchName: string;
  weekday: number;
  weekdayLabel: string;
  period: number;
  subjectId: string | null;
  subjectName: string | null;
  staffId: string | null;
  staffName: string | null;
  roomName: string | null;
}

export interface AttendanceSessionDto {
  id: string;
  classSectionId: string;
  gradeName: string;
  sectionLabel: string;
  branchName: string;
  date: string;
  period: number;
  status: string;
  note: string | null;
  recorderName: string | null;
  submitterName: string | null;
  submittedAt: string | null;
  recordCount: number | null;
  version: number;
  createdAt: string;
}

export interface AttendanceRosterEntry {
  studentId: string;
  studentNumber: string;
  firstName: string;
  fatherName: string;
  rollNumber: number | null;
  record: { status: string; note: string | null; updatedAt: string } | null;
}

export interface AttendanceSessionDetailDto extends AttendanceSessionDto {
  roster: AttendanceRosterEntry[];
}

export interface AttendanceSummaryDto {
  sessions: number;
  byStatus: { present: number; absent: number; late: number; excused: number; notRecorded: number };
  students: Array<{
    studentId: string; studentNumber: string; firstName: string;
    sessions: number; present: number; absent: number; late: number; excused: number; notRecorded: number;
  }>;
}

export interface AssessmentDto {
  id: string;
  academicYearId: string;
  termId: string | null;
  classSectionId: string;
  gradeName: string;
  sectionLabel: string;
  branchName: string;
  subjectId: string;
  subjectName: string;
  staffId: string | null;
  staffName: string | null;
  title: string;
  type: string;
  date: string | null;
  maxScore: number;
  weight: number;
  status: string;
  publishedAt: string | null;
  gradeCount: number;
  version: number;
  createdAt: string;
}

export interface AssessmentDetailDto extends AssessmentDto {
  roster: Array<{
    studentId: string; studentNumber: string; firstName: string; fatherName: string;
    rollNumber: number | null; score: number | null; isAbsent: boolean;
    note: string | null; hasGrade: boolean;
  }>;
  canEnterGrades: boolean;
  canPublish: boolean;
}

export interface ReportCardDto {
  studentId: string;
  studentNumber: string;
  firstName: string;
  gradeName: string | null;
  sectionLabel: string | null;
  academicYearName: string | null;
  subjects: Array<{
    subjectId: string; subjectName: string; average: number | null;
    items: Array<{
      assessmentId: string; title: string; type: string; score: number | null;
      maxScore: number; weight: number; isAbsent: boolean; publishedAt: string | null;
    }>;
  }>;
  attendance: { sessions: number; present: number; absent: number; late: number; excused: number; notRecorded: number } | null;
}

export interface RecentGradeDto {
  studentId: string;
  firstName: string;
  assessmentId: string;
  title: string;
  type: string;
  subjectName: string;
  score: number | null;
  maxScore: number;
  isAbsent: boolean;
  at: string;
}

// ── Phase 3 DTOs (finance) ──────────────────────────────────────────────────

export interface FeeStructureDto {
  id: string;
  academicYearId: string;
  branchId: string | null;
  branchName: string | null;
  name: string;
  gradeLevels: number[];
  periodKind: string;
  periodKindLabel: string;
  amountDiram: number;
  isActive: boolean;
  note: string | null;
  invoiceCount: number;
  createdAt: string;
}

export interface DiscountDto {
  id: string;
  academicYearId: string;
  studentId: string;
  studentNumber: string;
  studentName: string;
  kind: string;
  value: number;
  reason: string;
  status: string;
  createdAt: string;
}

export interface InvoicePaymentDto {
  id: string;
  receiptNumber: string;
  amountDiram: number;
  method: string;
  methodLabel: string;
  date: string;
  note: string | null;
  voidedAt: string | null;
  createdAt: string;
}

export interface InvoiceDto {
  id: string;
  invoiceNumber: string;
  academicYearId: string;
  branchId: string;
  branchName: string | null;
  studentId: string;
  studentNumber: string;
  studentName: string;
  fatherName: string;
  feeStructureId: string | null;
  feeStructureName: string | null;
  periodKey: string;
  periodLabel: string;
  amountDiram: number;
  discountDiram: number;
  netDiram: number;
  paidDiram: number;
  balanceDiram: number;
  status: string;
  statusLabel: string;
  dueDate: string | null;
  note: string | null;
  voidReason: string | null;
  createdAt: string;
  payments: InvoicePaymentDto[];
}

export interface PaymentDto {
  id: string;
  receiptNumber: string;
  invoiceId: string;
  invoiceNumber: string;
  periodLabel: string;
  studentId: string;
  studentNumber: string;
  studentName: string;
  branchId: string;
  branchName: string | null;
  amountDiram: number;
  method: string;
  methodLabel: string;
  date: string;
  note: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
}

export interface ExpenseDto {
  id: string;
  expenseNumber: string;
  branchId: string;
  branchName: string | null;
  date: string;
  category: string;
  categoryLabel: string;
  payee: string | null;
  amountDiram: number;
  note: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
}

export interface PayrollItemDto {
  id: string;
  staffId: string;
  staffName: string;
  position: string;
  payslipNumber: string;
  baseDiram: number;
  allowanceDiram: number;
  bonusDiram: number;
  deductionDiram: number;
  netDiram: number;
  note: string | null;
}

export interface PayrollRunDto {
  id: string;
  branchId: string;
  branchName: string | null;
  academicYearId: string;
  periodKey: string;
  periodLabel: string;
  status: string;
  statusLabel: string;
  totalsDiram: number;
  staffCount: number;
  note: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  items: PayrollItemDto[];
}

export interface FinanceReportsDto {
  month: { key: string; label: string };
  collection: { totalDiram: number; count: number };
  invoiced: { totalNetDiram: number; count: number };
  outstanding: { totalDiram: number; count: number };
  expenses: { totalDiram: number; count: number };
  payroll: { totalDiram: number; runsCount: number };
  series: Array<{ key: string; label: string; incomeDiram: number; expenseDiram: number }>;
  topDebtors: Array<{ studentId: string; studentNumber: string; name: string; balance: number; branchName: string }>;
}

// ── Phase 4: library, announcements, messages, portal ──────────────────────

export interface BookTitleDto {
  id: string;
  branchId: string;
  title: string;
  author: string | null;
  publisher: string | null;
  subjectId: string | null;
  subjectName: string | null;
  gradeLevels: number[];
  isTextbook: boolean;
  isActive: boolean;
  note: string | null;
  copyCount: number;
  createdAt: string;
}

export interface BookCopyDto {
  id: string;
  titleId: string;
  bookTitle: string;
  branchId: string;
  copyCode: string;
  status: string;
  statusLabel: string;
  condition: string | null;
  createdAt: string;
}

export interface BookLoanDto {
  id: string;
  copyId: string;
  copyCode: string;
  bookTitle: string;
  studentId: string;
  studentNumber: string;
  studentName: string;
  fatherName: string;
  branchId: string;
  loanedOn: string;
  dueOn: string;
  returnedOn: string | null;
  status: string;
  statusLabel: string;
  fineDiram: number;
  note: string | null;
  isOverdue: boolean;
  createdAt: string;
}

export interface LibraryStatsDto {
  titleCount: number;
  copyCount: number;
  availableCount: number;
  activeLoans: number;
  overdueLoans: number;
}

export interface AnnouncementDto {
  id: string;
  branchId: string;
  branchName: string | null;
  classSectionId: string | null;
  sectionLabel: string | null;
  audience: string;
  audienceLabel: string;
  title: string;
  body: string;
  status: string;
  statusLabel: string;
  publishedAt: string | null;
  readCount: number;
  readByMe: boolean;
  createdAt: string;
}

export interface MessageLogDto {
  id: string;
  branchId: string | null;
  channel: string;
  channelLabel: string;
  recipient: string;
  subject: string | null;
  body: string;
  status: string;
  statusLabel: string;
  error: string | null;
  relatedType: string | null;
  relatedId: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface PortalChildDto {
  id: string;
  studentNumber: string;
  name: string;
  fatherName: string;
  status: string;
  yearName: string | null;
  gradeName: string | null;
  sectionLabel: string | null;
  branchId: string | null;
  branchName: string | null;
  attendance: {
    sessions: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    notRecorded: number;
  };
  grades: Array<{ subjectId: string; subjectName: string; averagePercent: number }>;
  outstandingBalanceDiram: number;
}

export interface PortalOverviewDto {
  isGuardian: boolean;
  isStudent: boolean;
  orgName: string;
  yearName: string | null;
  children: PortalChildDto[];
  announcements: Array<{
    id: string;
    title: string;
    body: string;
    publishedAt: string | null;
    readByMe: boolean;
  }>;
}

// ── Phase 5: services, reports, year-end ───────────────────────────────────

export interface TransportRouteDto {
  id: string;
  branchId: string;
  name: string;
  driverName: string | null;
  vehicle: string | null;
  capacity: number;
  monthlyFeeDiram: number;
  stops: string[];
  isActive: boolean;
  note: string | null;
  activePassengers: number;
}

export interface TransportPassengerDto {
  id: string;
  routeId: string;
  routeName: string;
  studentId: string;
  studentNumber: string;
  studentName: string;
  fatherName: string;
  stopName: string | null;
  status: string;
  statusLabel: string;
  note: string | null;
  createdAt: string;
}

export interface InventoryItemDto {
  id: string;
  branchId: string;
  name: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  isLow: boolean;
  isActive: boolean;
  note: string | null;
}

export interface InventoryMovementDto {
  id: string;
  itemId: string;
  delta: number;
  reason: string;
  at: string;
}

export interface GuestVisitDto {
  id: string;
  branchId: string;
  fullName: string;
  purpose: string;
  hostName: string | null;
  idNumber: string | null;
  visitorCount: number;
  arrivedAt: string;
  leftAt: string | null;
  isInside: boolean;
  note: string | null;
}

export interface SchoolEventDto {
  id: string;
  branchId: string | null;
  title: string;
  kind: string;
  kindLabel: string;
  startsOn: string;
  endsOn: string | null;
  note: string | null;
}

export interface ReportTableDto {
  kind: string;
  title: string;
  columns: Array<{ key: string; label: string }>;
  rows: string[][];
  meta: Record<string, string>;
}

export interface RolloverPreviewRowDto {
  studentId: string;
  studentNumber: string;
  studentName: string;
  fatherName: string;
  gradeLevelId: string;
  gradeLevel: number;
  gradeName: string;
  sectionLabel: string | null;
  branchId: string | null;
  defaultDecision: string;
  savedDecision: string | null;
  savedNote: string | null;
  appliedAt: string | null;
}

export interface RolloverPreviewDto {
  year: { id: string; name: string; status: string; isCurrent: boolean; activeEnrollments: number };
  suggestedNextYearName: string;
  nextYears: Array<{ id: string; name: string; status: string; isCurrent: boolean; startDate: string; endDate: string }>;
  counts: { promote: number; repeat: number; graduate: number; leave: number; pending: number; applied: number };
  rows: RolloverPreviewRowDto[];
  statusInfo: { yearId: string; yearName: string; status: string; total: number; applied: number; pending: number };
}

export interface RolloverApplyResultDto {
  fromYear: string;
  toYear: string;
  promoted: number;
  repeated: number;
  graduated: number;
  left: number;
  skipped: number;
  closed: boolean;
}
