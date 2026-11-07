// TanStack Query hooks over the /api/v1 contract — the single data-access
// layer of the SPA. Permission-aware: 403s surface as Dari errors.

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiClientError } from "./client";
import type {
  MeResponse, OrgContext, StudentListItem, StudentProfile, ApplicationDto,
  ListMeta, DashboardSummary, SearchHit, NotificationDto, AuditEventDto,
  UserDto, GradeLevelDto, SectionDto, AcademicYearDto, SubjectDto,
  AppSettingsDto, GuardianDto, StaffDto, StaffDetailDto, TeachingAssignmentDto,
  TimetableSlotDto, AttendanceSessionDto, AttendanceSessionDetailDto,
  AttendanceSummaryDto, AssessmentDto, AssessmentDetailDto, ReportCardDto,
  FeeStructureDto, DiscountDto, InvoiceDto, PaymentDto, ExpenseDto,
  PayrollRunDto, FinanceReportsDto,
  BookTitleDto, BookCopyDto, BookLoanDto, LibraryStatsDto,
  AnnouncementDto, MessageLogDto, PortalOverviewDto,
  TransportRouteDto, TransportPassengerDto, InventoryItemDto, InventoryMovementDto,
  GuestVisitDto, SchoolEventDto, ReportTableDto,
  RolloverPreviewDto, RolloverApplyResultDto,
} from "./client";

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// ── Auth ────────────────────────────────────────────────────────────────────

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => (await api.get<MeResponse>("/auth/me")).data,
    retry: false,
    staleTime: 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { username: string; password: string }) =>
      (await api.post<MeResponse>("/auth/login", vars)).data,
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post<{ ok: boolean }>("/auth/logout")).data,
    onSuccess: () => qc.clear(),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (vars: { currentPassword: string; newPassword: string }) =>
      (await api.post<{ ok: boolean }>("/auth/change-password", vars)).data,
  });
}

// ── Org context ─────────────────────────────────────────────────────────────

export function useOrgContext() {
  return useQuery({
    queryKey: ["org-context"],
    queryFn: async () => (await api.get<OrgContext>("/org")).data,
    staleTime: 5 * 60_000,
  });
}

export function useSetupSchool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Record<string, unknown>) =>
      (await api.post<{ orgId: string }>("/org/setup", vars)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-context"] }),
  });
}

export function useUpdateOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Record<string, unknown>) =>
      (await api.put<unknown>("/org", vars)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-context"] });
    },
  });
}

// ── Academic config ─────────────────────────────────────────────────────────

export function useGrades() {
  return useQuery({
    queryKey: ["grades"],
    queryFn: async () => (await api.get<GradeLevelDto[]>("/grades")).data,
    staleTime: 10 * 60_000,
  });
}

export function useSections(filters: { academicYearId?: string; gradeLevelId?: string } = {}) {
  return useQuery({
    queryKey: ["sections", filters.academicYearId ?? "", filters.gradeLevelId ?? ""],
    queryFn: async () => (await api.get<SectionDto[]>(`/sections${qs(filters)}`)).data,
  });
}

export function useAcademicYears() {
  return useQuery({
    queryKey: ["academic-years"],
    queryFn: async () => (await api.get<AcademicYearDto[]>("/academic-years")).data,
  });
}

export function useSubjects() {
  return useQuery({
    queryKey: ["subjects"],
    queryFn: async () => (await api.get<SubjectDto[]>("/subjects")).data,
  });
}

export function useCreateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Record<string, unknown>) =>
      (await api.post<unknown>("/sections", vars)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sections"] }),
  });
}

export function useCreateYear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Record<string, unknown>) =>
      (await api.post<unknown>("/academic-years", vars)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["academic-years"] }),
  });
}

export function useSetCurrentYear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.patch<unknown>(`/academic-years/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academic-years"] });
      qc.invalidateQueries({ queryKey: ["org-context"] });
    },
  });
}

export function useCreateSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Record<string, unknown>) =>
      (await api.post<unknown>("/subjects", vars)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subjects"] }),
  });
}

// ── Students ────────────────────────────────────────────────────────────────

export function useStudents(filters: {
  q?: string; status?: string; gradeLevelId?: string; classSectionId?: string; academicYearId?: string; page?: number; pageSize?: number;
}) {
  return useQuery({
    queryKey: ["students", filters],
    queryFn: async () => {
      const res = await api.get<StudentListItem[]>(`/students${qs(filters)}`);
      return { items: res.data, meta: res.meta as unknown as ListMeta };
    },
    placeholderData: (prev) => prev,
  });
}

export function useStudent(id: string | null) {
  return useQuery({
    queryKey: ["student", id],
    queryFn: async () => (await api.get<StudentProfile>(`/students/${id}`)).data,
    enabled: Boolean(id),
  });
}

export function useUpdateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; body: Record<string, unknown> }) =>
      (await api.patch<unknown>(`/students/${vars.id}`, vars.body)).data,
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["student", vars.id] });
      qc.invalidateQueries({ queryKey: ["students"] });
    },
  });
}

export function useStudentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; status: string; note?: string }) =>
      (await api.post<unknown>(`/students/${vars.id}/status`, {
        status: vars.status,
        note: vars.note,
      })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student"] });
      qc.invalidateQueries({ queryKey: ["students"] });
    },
  });
}

// ── Applications ────────────────────────────────────────────────────────────

export function useApplications(filters: {
  q?: string; status?: string; page?: number; pageSize?: number;
}) {
  return useQuery({
    queryKey: ["applications", filters],
    queryFn: async () => {
      const res = await api.get<ApplicationDto[]>(`/applications${qs(filters)}`);
      return { items: res.data, meta: res.meta as unknown as ListMeta };
    },
    placeholderData: (prev) => prev,
  });
}

export function useApplication(id: string | null) {
  return useQuery({
    queryKey: ["application", id],
    queryFn: async () => (await api.get<ApplicationDto>(`/applications/${id}`)).data,
    enabled: Boolean(id),
  });
}

export function useSimilarApplications(id: string | null) {
  return useQuery({
    queryKey: ["similar", id],
    queryFn: async () =>
      (await api.get<Array<{ kind: string; id: string; displayName: string; reasons: string[]; statusLabel?: string }>>(
        `/applications/${id}/similar`,
      )).data,
    enabled: Boolean(id),
  });
}

export function useCreateApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Record<string, unknown>) =>
      (await api.post<ApplicationDto>("/applications", vars)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["applications"] }),
  });
}

export function useUpdateApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; body: Record<string, unknown> }) =>
      (await api.put<ApplicationDto>(`/applications/${vars.id}`, vars.body)).data,
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["application", vars.id] });
      qc.invalidateQueries({ queryKey: ["applications"] });
    },
  });
}

export function useApplicationTransition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      id: string; action: "submit" | "start" | "approve" | "reject" | "cancel"; note?: string;
    }) => {
      if (vars.action === "submit" || vars.action === "cancel") {
        return (await api.post<ApplicationDto>(`/applications/${vars.id}/${vars.action}`)).data;
      }
      return (await api.post<ApplicationDto>(`/applications/${vars.id}/review`, {
        action: vars.action,
        note: vars.note,
      })).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["application"] });
      qc.invalidateQueries({ queryKey: ["applications"] });
    },
  });
}

export function useEnrollApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      id: string; classSectionId: string; enrolledOn?: string; rollNumber?: number;
    }) =>
      (await api.post<{ studentId: string; studentNumber: string; gradeName: string; sectionLabel: string }>(
        `/applications/${vars.id}/enroll`,
        { classSectionId: vars.classSectionId, enrolledOn: vars.enrolledOn, rollNumber: vars.rollNumber },
      )).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["applications"] });
      qc.invalidateQueries({ queryKey: ["application"] });
      qc.invalidateQueries({ queryKey: ["students"] });
    },
  });
}

// ── Guardians ───────────────────────────────────────────────────────────────

export function useGuardians(q?: string) {
  return useQuery({
    queryKey: ["guardians", q ?? ""],
    queryFn: async () => (await api.get<GuardianDto[]>(`/guardians${qs({ q })}`)).data,
  });
}

// ── Dashboard / search / notifications / audit ──────────────────────────────

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => (await api.get<DashboardSummary>("/dashboard/summary")).data,
  });
}

export function useGlobalSearch(q: string) {
  return useQuery({
    queryKey: ["search", q],
    queryFn: async () => (await api.get<SearchHit[]>(`/search${qs({ q })}`)).data,
    enabled: q.trim().length >= 2,
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get<NotificationDto[]>("/notifications")).data,
    refetchInterval: 60_000,
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids?: string[]) =>
      (await api.patch<unknown>("/notifications", { ids })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useAuditEvents(filters: { entity?: string; page?: number }) {
  return useQuery({
    queryKey: ["audit", filters],
    queryFn: async () => {
      const res = await api.get<AuditEventDto[]>(`/audit-events${qs(filters)}`);
      return { items: res.data, meta: res.meta as unknown as ListMeta };
    },
    placeholderData: (prev) => prev,
  });
}

// ── Users / settings ────────────────────────────────────────────────────────

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<UserDto[]>("/users")).data,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Record<string, unknown>) =>
      (await api.post<unknown>("/users", vars)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; body: Record<string, unknown> }) =>
      (await api.patch<unknown>(`/users/${vars.id}`, vars.body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await api.get<AppSettingsDto>("/settings")).data,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Record<string, unknown>) =>
      (await api.patch<AppSettingsDto>("/settings", vars)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });
}

// ── Phase 2: staff, timetable, attendance, assessments & grades ─────────────

export function useStaff(filters: { q?: string; position?: string; status?: string } = {}) {
  return useQuery({
    queryKey: ["staff", filters.q ?? "", filters.position ?? "", filters.status ?? ""],
    queryFn: async () => (await api.get<StaffDto[]>(`/staff${qs(filters)}`)).data,
  });
}

export function useStaffMember(id: string | null) {
  return useQuery({
    queryKey: ["staff-member", id],
    queryFn: async () => (await api.get<StaffDetailDto>(`/staff/${id}`)).data,
    enabled: Boolean(id),
  });
}

export function useCreateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Record<string, unknown>) =>
      (await api.post<unknown>("/staff", vars)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff"] }),
  });
}

export function useUpdateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; body: Record<string, unknown> }) =>
      (await api.patch<unknown>(`/staff/${vars.id}`, vars.body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["staff-member"] });
    },
  });
}

export function useTimetable(filters: { classSectionId?: string; mine?: boolean } = {}) {
  return useQuery({
    queryKey: ["timetable", filters.classSectionId ?? "", filters.mine ? "mine" : ""],
    queryFn: async () => {
      if (filters.mine) {
        const res = await api.get<{ staff: { id: string; fullName: string } | null; slots: TimetableSlotDto[] }>("/timetable?mine=1");
        return res.data;
      }
      const res = await api.get<TimetableSlotDto[]>(`/timetable${qs({ classSectionId: filters.classSectionId })}`);
      return { staff: null as { id: string; fullName: string } | null, slots: res.data };
    },
  });
}

export function useUpsertTimetableSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Record<string, unknown>) =>
      (await api.post<unknown>("/timetable", vars)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["timetable"] }),
  });
}

export function useDeleteTimetableSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.del<unknown>(`/timetable?id=${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["timetable"] }),
  });
}

export function useTeachingAssignments(filters: { academicYearId?: string; classSectionId?: string } = {}) {
  return useQuery({
    queryKey: ["teaching-assignments", filters.academicYearId ?? "", filters.classSectionId ?? ""],
    queryFn: async () => (await api.get<TeachingAssignmentDto[]>(`/teaching-assignments${qs(filters)}`)).data,
  });
}

export function useSetAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Record<string, unknown>) =>
      (await api.post<unknown>("/teaching-assignments", vars)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teaching-assignments"] });
      qc.invalidateQueries({ queryKey: ["staff-member"] });
    },
  });
}

export function useAttendanceSessions(filters: { classSectionId?: string; from?: string; to?: string; status?: string } = {}) {
  return useQuery({
    queryKey: ["attendance-sessions", filters.classSectionId ?? "", filters.from ?? "", filters.to ?? "", filters.status ?? ""],
    queryFn: async () => (await api.get<AttendanceSessionDto[]>(`/attendance/sessions${qs(filters)}`)).data,
  });
}

export function useAttendanceSession(id: string | null) {
  return useQuery({
    queryKey: ["attendance-session", id],
    queryFn: async () => (await api.get<AttendanceSessionDetailDto>(`/attendance/sessions/${id}`)).data,
    enabled: Boolean(id),
  });
}

export function useUpsertAttendanceSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { classSectionId: string; date: string; period?: number; note?: string }) =>
      (await api.post<unknown>("/attendance/sessions", {
        classSectionId: vars.classSectionId, date: vars.date,
        period: vars.period ?? 0, note: vars.note,
      })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance-sessions"] }),
  });
}

export function useSaveAttendanceRecords() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      sessionId: string; version: number;
      records: Array<{ studentId: string; status: string; note?: string | null }>;
    }) => (await api.put<unknown>(`/attendance/sessions/${vars.sessionId}`, {
      version: vars.version, records: vars.records,
    })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-session"] });
      qc.invalidateQueries({ queryKey: ["attendance-sessions"] });
    },
  });
}

export function useSubmitAttendanceSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { sessionId: string; version: number }) =>
      (await api.post<unknown>(`/attendance/sessions/${vars.sessionId}/submit`, { version: vars.version })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-session"] });
      qc.invalidateQueries({ queryKey: ["attendance-sessions"] });
    },
  });
}

export function useReopenAttendanceSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { sessionId: string; reason: string }) =>
      (await api.post<unknown>(`/attendance/sessions/${vars.sessionId}/reopen`, { reason: vars.reason })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-session"] });
      qc.invalidateQueries({ queryKey: ["attendance-sessions"] });
    },
  });
}

export function useAttendanceSummary(filters: { classSectionId?: string; studentId?: string } = {}) {
  return useQuery({
    queryKey: ["attendance-summary", filters.classSectionId ?? "", filters.studentId ?? ""],
    queryFn: async () => (await api.get<AttendanceSummaryDto>(`/attendance/summary${qs(filters)}`)).data,
  });
}

export function useAssessments(filters: { academicYearId?: string; classSectionId?: string; status?: string } = {}) {
  return useQuery({
    queryKey: ["assessments", filters.academicYearId ?? "", filters.classSectionId ?? "", filters.status ?? ""],
    queryFn: async () => (await api.get<AssessmentDto[]>(`/assessments${qs(filters)}`)).data,
  });
}

export function useAssessment(id: string | null) {
  return useQuery({
    queryKey: ["assessment", id],
    queryFn: async () => (await api.get<AssessmentDetailDto>(`/assessments/${id}`)).data,
    enabled: Boolean(id),
  });
}

export function useCreateAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Record<string, unknown>) =>
      (await api.post<unknown>("/assessments", vars)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assessments"] }),
  });
}

export function useEnterGrades() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      assessmentId: string; version: number;
      grades: Array<{ studentId: string; score?: number | null; isAbsent?: boolean; note?: string | null }>;
    }) => (await api.put<unknown>(`/assessments/${vars.assessmentId}/grades`, {
      version: vars.version, grades: vars.grades,
    })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assessment"] });
      qc.invalidateQueries({ queryKey: ["assessments"] });
    },
  });
}

export function usePublishAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { assessmentId: string; version: number }) =>
      (await api.post<unknown>(`/assessments/${vars.assessmentId}/publish`, { version: vars.version })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assessment"] });
      qc.invalidateQueries({ queryKey: ["assessments"] });
    },
  });
}

export function useReportCard(studentId: string | null) {
  return useQuery({
    queryKey: ["report-card", studentId],
    queryFn: async () => (await api.get<ReportCardDto>(`/students/${studentId}/report-card`)).data,
    enabled: Boolean(studentId),
  });
}

// ── Phase 3: finance ────────────────────────────────────────────────────────

export function useFeeStructures(filters: { academicYearId?: string } = {}) {
  return useQuery({
    queryKey: ["fees", filters.academicYearId ?? ""],
    queryFn: async () => (await api.get<FeeStructureDto[]>(`/fees${qs(filters)}`)).data,
  });
}

export function useCreateFeeStructure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Record<string, unknown>) =>
      (await api.post<FeeStructureDto>("/fees", vars)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fees"] }),
  });
}

export function useUpdateFeeStructure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string } & Record<string, unknown>) =>
      (await api.patch<FeeStructureDto>(`/fees/${vars.id}`, vars)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fees"] }),
  });
}

export function useDiscounts(filters: { academicYearId?: string; studentId?: string } = {}) {
  return useQuery({
    queryKey: ["discounts", filters.academicYearId ?? "", filters.studentId ?? ""],
    queryFn: async () => (await api.get<DiscountDto[]>(`/discounts${qs(filters)}`)).data,
  });
}

export function useCreateDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Record<string, unknown>) =>
      (await api.post<DiscountDto>("/discounts", vars)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["discounts"] }),
  });
}

export function useRevokeDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.patch<{ ok: boolean }>(`/discounts/${id}`, {})).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["discounts"] }),
  });
}

export function useInvoices(filters: {
  status?: string; periodKey?: string; studentId?: string; q?: string; outstanding?: string;
} = {}) {
  return useQuery({
    queryKey: ["invoices", JSON.stringify(filters)],
    queryFn: async () => (await api.get<InvoiceDto[]>(`/invoices${qs(filters)}`)).data,
  });
}

export function useInvoice(id: string | null) {
  return useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => (await api.get<InvoiceDto>(`/invoices/${id}`)).data,
    enabled: Boolean(id),
  });
}

export function useIssueInvoices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Record<string, unknown>) =>
      (await api.post<{ createdCount: number; skippedCount: number; numbers: string[] }>("/invoices", vars)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["finance-reports"] });
    },
  });
}

export function useVoidInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; reason: string }) =>
      (await api.patch<{ ok: boolean }>(`/invoices/${vars.id}`, { reason: vars.reason })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice"] });
    },
  });
}

export function usePayments(filters: {
  from?: string; to?: string; method?: string; q?: string; invoiceId?: string; studentId?: string;
} = {}) {
  return useQuery({
    queryKey: ["payments", JSON.stringify(filters)],
    queryFn: async () => (await api.get<PaymentDto[]>(`/payments${qs(filters)}`)).data,
  });
}

export function useCollectPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Record<string, unknown>) =>
      (await api.post<PaymentDto>("/payments", vars)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["finance-reports"] });
    },
  });
}

export function useVoidPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; reason: string }) =>
      (await api.patch<{ ok: boolean }>(`/payments/${vars.id}`, { reason: vars.reason })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice"] });
      qc.invalidateQueries({ queryKey: ["finance-reports"] });
    },
  });
}

export function useExpenses(filters: { from?: string; to?: string; category?: string } = {}) {
  return useQuery({
    queryKey: ["expenses", JSON.stringify(filters)],
    queryFn: async () => (await api.get<ExpenseDto[]>(`/expenses${qs(filters)}`)).data,
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Record<string, unknown>) =>
      (await api.post<ExpenseDto>("/expenses", vars)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["finance-reports"] });
    },
  });
}

export function useVoidExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; reason: string }) =>
      (await api.patch<{ ok: boolean }>(`/expenses/${vars.id}`, { reason: vars.reason })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["finance-reports"] });
    },
  });
}

export function usePayrollRuns(filters: { periodKey?: string; status?: string } = {}) {
  return useQuery({
    queryKey: ["payroll", JSON.stringify(filters)],
    queryFn: async () => (await api.get<PayrollRunDto[]>(`/payroll${qs(filters)}`)).data,
  });
}

export function usePayrollRun(id: string | null) {
  return useQuery({
    queryKey: ["payroll-run", id],
    queryFn: async () => (await api.get<PayrollRunDto>(`/payroll/${id}`)).data,
    enabled: Boolean(id),
  });
}

export function useCreatePayrollRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Record<string, unknown>) =>
      (await api.post<PayrollRunDto>("/payroll", vars)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll"] }),
  });
}

export function useUpdatePayrollItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; items: Array<Record<string, unknown>> }) =>
      (await api.patch<PayrollRunDto>(`/payroll/${vars.id}`, { items: vars.items })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll"] });
      qc.invalidateQueries({ queryKey: ["payroll-run"] });
    },
  });
}

export function usePayrollAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; action: "approve" | "pay" }) =>
      (await api.patch<{ ok: boolean; status: string; expenseNumber?: string }>(`/payroll/${vars.id}`, { action: vars.action })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll"] });
      qc.invalidateQueries({ queryKey: ["payroll-run"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["finance-reports"] });
    },
  });
}

export function useFinanceReports(month?: string) {
  return useQuery({
    queryKey: ["finance-reports", month ?? ""],
    queryFn: async () => (await api.get<FinanceReportsDto>(`/finance/reports${qs({ month })}`)).data,
  });
}

// ── Phase 4: library ────────────────────────────────────────────────────────

export function useLibraryStats() {
  return useQuery({
    queryKey: ["library-stats"],
    queryFn: async () => (await api.get<LibraryStatsDto>("/library/stats")).data,
  });
}

export function useBookTitles(filters: { q?: string; subjectId?: string; isTextbook?: string } = {}) {
  return useQuery({
    queryKey: ["library-titles", filters.q ?? "", filters.subjectId ?? "", filters.isTextbook ?? ""],
    queryFn: async () => (await api.get<BookTitleDto[]>(`/library/titles${qs(filters)}`)).data,
  });
}

export function useCreateBookTitle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Record<string, unknown>) =>
      (await api.post<BookTitleDto>("/library/titles", vars)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["library-titles"] });
      qc.invalidateQueries({ queryKey: ["library-stats"] });
    },
  });
}

export function useUpdateBookTitle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string } & Record<string, unknown>) =>
      (await api.patch<BookTitleDto>(`/library/titles/${vars.id}`, vars)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["library-titles"] }),
  });
}

export function useBookCopies(filters: { titleId?: string; status?: string; q?: string } = {}) {
  return useQuery({
    queryKey: ["library-copies", filters.titleId ?? "", filters.status ?? "", filters.q ?? ""],
    queryFn: async () => (await api.get<BookCopyDto[]>(`/library/copies${qs(filters)}`)).data,
  });
}

export function useAddBookCopies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { titleId: string; count: number; condition?: string | null }) =>
      (await api.post<{ createdCount: number; codes: string[] }>("/library/copies", vars)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["library-copies"] });
      qc.invalidateQueries({ queryKey: ["library-titles"] });
      qc.invalidateQueries({ queryKey: ["library-stats"] });
    },
  });
}

export function useBookLoans(filters: { status?: string; studentId?: string; q?: string } = {}) {
  return useQuery({
    queryKey: ["library-loans", filters.status ?? "", filters.studentId ?? "", filters.q ?? ""],
    queryFn: async () => (await api.get<BookLoanDto[]>(`/library/loans${qs(filters)}`)).data,
  });
}

export function useCheckoutLoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { copyId: string; studentId: string; dueOn: string; note?: string | null }) =>
      (await api.post<BookLoanDto>("/library/loans", vars)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["library-loans"] });
      qc.invalidateQueries({ queryKey: ["library-copies"] });
      qc.invalidateQueries({ queryKey: ["library-stats"] });
    },
  });
}

export function useReturnLoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; fineDiram?: number; note?: string | null }) =>
      (await api.post<BookLoanDto>(`/library/loans/${vars.id}/return`, { fineDiram: vars.fineDiram ?? 0, note: vars.note ?? null })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["library-loans"] });
      qc.invalidateQueries({ queryKey: ["library-copies"] });
      qc.invalidateQueries({ queryKey: ["library-stats"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useMarkLoanLost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; fineDiram: number; note?: string | null }) =>
      (await api.post<BookLoanDto>(`/library/loans/${vars.id}/lost`, { fineDiram: vars.fineDiram, note: vars.note ?? null })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["library-loans"] });
      qc.invalidateQueries({ queryKey: ["library-copies"] });
      qc.invalidateQueries({ queryKey: ["library-stats"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

// ── Phase 4: announcements & messages ───────────────────────────────────────

export function useAnnouncements(filters: { status?: string; audience?: string } = {}) {
  return useQuery({
    queryKey: ["announcements", filters.status ?? "", filters.audience ?? ""],
    queryFn: async () => (await api.get<AnnouncementDto[]>(`/announcements${qs(filters)}`)).data,
  });
}

export function useCreateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Record<string, unknown>) =>
      (await api.post<{ id: string; status: string }>("/announcements", vars)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements"] }),
  });
}

export function useAnnouncementAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; action: "publish" | "unpublish" } | { id: string } & Record<string, unknown>) =>
      (await api.patch<{ ok?: boolean; id?: string; status?: string }>(`/announcements/${vars.id}`, vars)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements"] }),
  });
}

export function useMarkAnnouncementRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post<{ ok: boolean }>(`/announcements/${id}/read`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements"] }),
  });
}

export function useMessageLog(filters: { channel?: string; status?: string } = {}) {
  return useQuery({
    queryKey: ["messages", filters.channel ?? "", filters.status ?? ""],
    queryFn: async () => (await api.get<MessageLogDto[]>(`/messages${qs(filters)}`)).data,
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Record<string, unknown>) =>
      (await api.post<{ queuedCount: number; channel: string }>("/messages", vars)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["messages"] }),
  });
}

// ── Phase 4: guardian/student portal ────────────────────────────────────────

export function usePortalOverview() {
  return useQuery({
    queryKey: ["portal-overview"],
    queryFn: async () => (await api.get<PortalOverviewDto>("/portal/overview")).data,
  });
}

// ── Phase 5: services ───────────────────────────────────────────────────────

export function useTransportRoutes() {
  return useQuery({
    queryKey: ["transport-routes"],
    queryFn: async () => (await api.get<TransportRouteDto[]>("/services/transport")).data,
  });
}

export function useCreateTransportRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Record<string, unknown>) =>
      (await api.post<TransportRouteDto>("/services/transport", vars)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transport-routes"] }),
  });
}

export function useUpdateTransportRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string } & Record<string, unknown>) =>
      (await api.patch<TransportRouteDto>(`/services/transport/${vars.id}`, vars)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transport-routes"] }),
  });
}

export function useTransportPassengers(filters: { routeId?: string; status?: string } = {}) {
  return useQuery({
    queryKey: ["transport-passengers", filters.routeId ?? "", filters.status ?? ""],
    queryFn: async () => (await api.get<TransportPassengerDto[]>(`/services/transport/passengers${qs(filters)}`)).data,
  });
}

export function useAddTransportPassenger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { routeId: string; studentId: string; stopName?: string | null; note?: string | null }) =>
      (await api.post<TransportPassengerDto>(`/services/transport/${vars.routeId}/passengers`, vars)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transport-passengers"] });
      qc.invalidateQueries({ queryKey: ["transport-routes"] });
    },
  });
}

export function useUpdateTransportPassenger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; status: "active" | "stopped"; stopName?: string | null }) =>
      (await api.patch<TransportPassengerDto>(`/services/transport/passengers/${vars.id}`, vars)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transport-passengers"] });
      qc.invalidateQueries({ queryKey: ["transport-routes"] });
    },
  });
}

export function useInventoryItems() {
  return useQuery({
    queryKey: ["inventory-items"],
    queryFn: async () => (await api.get<InventoryItemDto[]>("/services/inventory")).data,
  });
}

export function useCreateInventoryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Record<string, unknown>) =>
      (await api.post<InventoryItemDto>("/services/inventory", vars)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory-items"] }),
  });
}

export function useInventoryMovements(itemId: string | null) {
  return useQuery({
    queryKey: ["inventory-movements", itemId ?? ""],
    queryFn: async () => (await api.get<InventoryMovementDto[]>(`/services/inventory/${itemId}/movements`)).data,
    enabled: Boolean(itemId),
  });
}

export function useRecordInventoryMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { itemId: string; delta: number; reason: string }) =>
      (await api.post<{ item: InventoryItemDto }>(`/services/inventory/${vars.itemId}/movements`, {
        delta: vars.delta,
        reason: vars.reason,
      })).data,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["inventory-items"] });
      qc.invalidateQueries({ queryKey: ["inventory-movements", vars.itemId] });
    },
  });
}

export function useGuestVisits(filters: { inside?: string } = {}) {
  return useQuery({
    queryKey: ["guests", filters.inside ?? ""],
    queryFn: async () => (await api.get<GuestVisitDto[]>(`/services/guests${qs(filters)}`)).data,
  });
}

export function useCreateGuestVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Record<string, unknown>) =>
      (await api.post<GuestVisitDto>("/services/guests", vars)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["guests"] }),
  });
}

export function useCheckoutGuest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; note?: string | null }) =>
      (await api.patch<GuestVisitDto>(`/services/guests/${vars.id}`, { note: vars.note ?? null })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["guests"] }),
  });
}

export function useSchoolEvents() {
  return useQuery({
    queryKey: ["school-events"],
    queryFn: async () => (await api.get<SchoolEventDto[]>("/services/events")).data,
  });
}

export function useCreateSchoolEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Record<string, unknown>) =>
      (await api.post<SchoolEventDto>("/services/events", vars)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["school-events"] }),
  });
}

// ── Phase 5: reports ────────────────────────────────────────────────────────

export function useReport(kind: string | null, filters: {
  gradeLevelId?: string; classSectionId?: string; status?: string;
  from?: string; to?: string; subjectId?: string;
} = {}) {
  return useQuery({
    queryKey: ["report", kind ?? "", JSON.stringify(filters)],
    queryFn: async () =>
      (await api.get<ReportTableDto>(`/reports/${kind}${qs(filters)}`)).data,
    enabled: Boolean(kind),
  });
}

// ── Phase 5: year-end rollover ──────────────────────────────────────────────

export function useRolloverPreview(yearId: string | null) {
  return useQuery({
    queryKey: ["rollover-preview", yearId ?? ""],
    queryFn: async () => (await api.get<RolloverPreviewDto>(`/academic-years/${yearId}/rollover`)).data,
    enabled: Boolean(yearId),
  });
}

export function useRolloverDecide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { yearId: string; decisions: Array<{ studentId: string; decision: string; note?: string | null }> }) =>
      (await api.post<{ ok: boolean; count: number }>(`/academic-years/${vars.yearId}/rollover/decide`, {
        decisions: vars.decisions,
      })).data,
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["rollover-preview", vars.yearId] }),
  });
}

export function useRolloverApply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { yearId: string; toAcademicYearId: string; setAsCurrent?: boolean }) =>
      (await api.post<RolloverApplyResultDto>(`/academic-years/${vars.yearId}/rollover`, {
        toAcademicYearId: vars.toAcademicYearId,
        setAsCurrent: vars.setAsCurrent ?? true,
      })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rollover-preview"] });
      qc.invalidateQueries({ queryKey: ["academic-years"] });
      qc.invalidateQueries({ queryKey: ["org-context"] });
      qc.invalidateQueries({ queryKey: ["students"] });
    },
  });
}

// ── Error → Dari message helper ─────────────────────────────────────────────

export function apiErrorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    // The API always returns a specific Dari message (permissions, CSRF/origin,
    // rate limit, validation…) — surface it verbatim so the user sees the real
    // cause instead of a generic "permission denied" that hides it.
    return err.message || "شما اجازهٔ انجام این عمل را ندارید.";
  }
  return "خطای غیرمنتظره رخ داد. لطفاً دوباره تلاش کنید.";
}
