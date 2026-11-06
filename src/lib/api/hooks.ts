// TanStack Query hooks over the /api/v1 contract — the single data-access
// layer of the SPA. Permission-aware: 403s surface as Dari errors.

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiClientError } from "./client";
import type {
  MeResponse, OrgContext, StudentListItem, StudentProfile, ApplicationDto,
  ListMeta, DashboardSummary, SearchHit, NotificationDto, AuditEventDto,
  UserDto, GradeLevelDto, SectionDto, AcademicYearDto, SubjectDto,
  AppSettingsDto, GuardianDto,
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
  q?: string; status?: string; gradeLevelId?: string; page?: number; pageSize?: number;
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

// ── Error → Dari message helper ─────────────────────────────────────────────

export function apiErrorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.status === 403) return "شما اجازهٔ انجام این عمل را ندارید.";
    return err.message;
  }
  return "خطای غیرمنتظره رخ داد. لطفاً دوباره تلاش کنید.";
}
