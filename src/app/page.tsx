// مکتب‌یار — single-route SPA root.
// Auth gate → first-run setup gate → shell + hash-routed views.

"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useSyncExternalStore } from "react";
import { useMe, useOrgContext } from "@/lib/api/hooks";
import { useRoute } from "@/app-shell/router";
import { Shell } from "@/app-shell/shell";
import { LoginView } from "@/features/auth/login-view";
import { SetupWizardView } from "@/features/setup/setup-wizard";
import { DashboardView } from "@/features/dashboard/dashboard-view";
import { StudentsListView } from "@/features/students/students-list-view";
import { StudentProfileView } from "@/features/students/student-profile-view";
import { ApplicationsListView } from "@/features/admissions/applications-list-view";
import { ApplicationDetailView } from "@/features/admissions/application-detail-view";
import { AdmissionStepper } from "@/features/admissions/admission-stepper";
import { StaffView } from "@/features/staff/staff-view";
import { TimetableView } from "@/features/timetable/timetable-view";
import { AttendanceView } from "@/features/attendance/attendance-view";
import { ExamsView } from "@/features/exams/exams-view";
import { SettingsView } from "@/features/settings/settings-view";
import { FeesView } from "@/features/finance/fees-view";
import { InvoicesView } from "@/features/finance/invoices-view";
import { PaymentsView } from "@/features/finance/payments-view";
import { ExpensesView } from "@/features/finance/expenses-view";
import { PayrollView } from "@/features/finance/payroll-view";
import { FinanceReportsView } from "@/features/finance/finance-reports-view";
import { RoadmapView } from "@/features/shared/roadmap-view";
import { hasGrant } from "@/app-shell/shell";
import { EmptyState, PageSkeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";
import { navigate } from "@/app-shell/router";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (count, err) => {
          const status = (err as { status?: number }).status;
          if (status === 401 || status === 403 || status === 404) return false;
          return count < 2;
        },
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  });
}

// Canonical SSR-safe client detection: server snapshot = false, client
// snapshot = true. No setState-in-effect.
function useIsHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function AppRoutes() {
  const route = useRoute();
  const { data: me, isLoading, isError } = useMe();
  const { data: orgCtx, isLoading: orgLoading } = useOrgContext();

  // Client-only mount gate: the hash router is meaningless during SSR and
  // all data is query-driven, so we render a shell until hydration lands.
  const mounted = useIsHydrated();

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <PageSkeleton />
      </div>
    );
  }

  // ── Auth gate ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <PageSkeleton />
      </div>
    );
  }
  if (isError || !me) return <LoginView />;

  // No roles assigned → cannot see anything.
  if (me.roles.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <EmptyState
          icon={ShieldAlert}
          title="حساب شما هنوز نقشی ندارد"
          body="با مدیر سیستم تماس بگیرید تا نقش مناسب به حساب شما تخصیص داده شود."
        />
      </div>
    );
  }

  // ── First-run setup gate (settings.manage holders only) ──────────────────
  if (!orgLoading && orgCtx && !orgCtx.org?.isConfigured) {
    if (hasGrant(me, "settings.manage")) {
      return (
        <div className="min-h-screen bg-background p-4 md:p-8">
          <SetupWizardView />
        </div>
      );
    }
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <EmptyState
          title="تنظیمات اولیهٔ مکتب هنوز تکمیل نشده است"
          body="مدیر سیستم باید ابتدا پروفایل مکتب را تکمیل کند. پس از آن می‌توانید وارد شوید."
        />
      </div>
    );
  }

  // ── Routed views inside the shell ────────────────────────────────────────
  const [a, b, c] = route.segments;

  let content: React.ReactNode;
  if (!a) {
    content = <DashboardView />;
  } else if (a === "dashboard") {
    content = <DashboardView />;
  } else if (a === "students") {
    if (!b) {
      content = hasGrant(me, "students.view")
        ? <StudentsListView />
        : <NoPermissionView />;
    } else {
      content = <StudentProfileView id={b} />;
    }
  } else if (a === "admissions") {
    if (!b) {
      content = hasGrant(me, "applications.view")
        ? <ApplicationsListView />
        : <NoPermissionView />;
    } else if (b === "new") {
      content = hasGrant(me, "applications.create")
        ? <AdmissionStepper />
        : <NoPermissionView />;
    } else {
      content = <ApplicationDetailView id={b} />;
    }
  } else if (a === "staff") {
    content = hasGrant(me, "staff.view") ? <StaffView /> : <NoPermissionView />;
  } else if (a === "timetable") {
    content = hasGrant(me, "timetable.view") ? <TimetableView /> : <NoPermissionView />;
  } else if (a === "attendance") {
    content = hasGrant(me, "attendance.view") ? <AttendanceView /> : <NoPermissionView />;
  } else if (a === "exams") {
    content = hasGrant(me, "assessments.view") ? <ExamsView /> : <NoPermissionView />;
  } else if (a === "finance") {
    if (b === "fees" || !b) {
      content = hasGrant(me, "fees.view") ? <FeesView /> : <NoPermissionView />;
    } else if (b === "invoices") {
      content = hasGrant(me, "invoices.view") ? <InvoicesView /> : <NoPermissionView />;
    } else if (b === "payments") {
      content = hasGrant(me, "payments.view") ? <PaymentsView /> : <NoPermissionView />;
    } else if (b === "expenses") {
      content = hasGrant(me, "expenses.view") ? <ExpensesView /> : <NoPermissionView />;
    } else if (b === "payroll") {
      content = hasGrant(me, "payroll.view") ? <PayrollView /> : <NoPermissionView />;
    } else if (b === "reports") {
      content = hasGrant(me, "invoices.view") ? <FinanceReportsView /> : <NoPermissionView />;
    } else {
      content = <NoPermissionView />;
    }
  } else if (a === "settings") {
    content = <SettingsView tab={b ?? "org"} />;
  } else if (a === "roadmap") {
    content = <RoadmapView moduleKey={b ?? "reports"} />;
  } else {
    content = (
      <EmptyState
        title="صفحه پیدا نشد"
        body="آدرس درخواستی موجود نیست."
        action={<Button variant="outline" onClick={() => navigate("/dashboard")}>بازگشت به صفحهٔ اصلی</Button>}
      />
    );
  }

  return <Shell>{content}</Shell>;
}

function NoPermissionView() {
  return (
    <EmptyState
      icon={ShieldAlert}
      title="شما اجازهٔ مشاهدهٔ این بخش را ندارید"
      body="اگر فکر می‌کنید این اشتباه است، با مدیر سیستم مکتب تماس بگیرید."
    />
  );
}

export default function Home() {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <AppRoutes />
    </QueryClientProvider>
  );
}
