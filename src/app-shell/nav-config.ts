// Navigation model: the 12 module groups with icons, permissions, and
// implementation status. Unauthorized groups are hidden from the sidebar —
// but remember: hiding is NOT authorization; the API enforces the matrix.

import {
  LayoutDashboard, GraduationCap, Users, BookOpen, ClipboardCheck,
  FileSpreadsheet, Wallet, Library, IdCard, Megaphone, BarChart3, Settings,
  ReceiptText, Coins, Landmark, BadgeDollarSign, Home, Printer,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  route: string;
  /** Minimum permission to SEE this item (backend re-checks every call). */
  permission?: string;
  /** Implemented in the current phase. */
  implemented: boolean;
  phaseNote?: string;
}

export interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "home",
    label: "صفحهٔ اصلی",
    items: [
      { key: "dashboard", label: "داشبورد", icon: LayoutDashboard, route: "/dashboard", permission: "dashboard.view", implemented: true },
    ],
  },
  {
    key: "students",
    label: "شاگردان و شمولیت",
    items: [
      { key: "students", label: "شاگردان", icon: Users, route: "/students", permission: "students.view", implemented: true },
      { key: "admissions", label: "شمولیت‌ها", icon: GraduationCap, route: "/admissions", permission: "applications.view", implemented: true },
    ],
  },
  {
    key: "academic",
    label: "امور تعلیمی",
    items: [
      { key: "sections", label: "شعبه‌های صنف", icon: IdCard, route: "/settings/sections", permission: "academic.view", implemented: true },
      { key: "subjects", label: "مضامین", icon: BookOpen, route: "/settings/subjects", permission: "academic.view", implemented: true },
      { key: "timetable", label: "برنامهٔ صنفی", icon: ClipboardCheck, route: "/timetable", permission: "timetable.view", implemented: true },
    ],
  },
  {
    key: "attendance",
    label: "حاضری",
    items: [
      { key: "attendance", label: "ثبت حاضری", icon: ClipboardCheck, route: "/attendance", permission: "attendance.view", implemented: true },
    ],
  },
  {
    key: "exams",
    label: "امتحانات و نتایج",
    items: [
      { key: "exams", label: "امتحانات", icon: FileSpreadsheet, route: "/exams", permission: "assessments.view", implemented: true },
    ],
  },
  {
    key: "finance",
    label: "امور مالی",
    items: [
      { key: "fees", label: "فیس‌ها و تخفیف‌ها", icon: Wallet, route: "/finance/fees", permission: "fees.view", implemented: true },
      { key: "invoices", label: "فاکتورها", icon: ReceiptText, route: "/finance/invoices", permission: "invoices.view", implemented: true },
      { key: "payments", label: "رسیدهای پرداخت", icon: Coins, route: "/finance/payments", permission: "payments.view", implemented: true },
      { key: "expenses", label: "مصارف", icon: Landmark, route: "/finance/expenses", permission: "expenses.view", implemented: true },
      { key: "payroll", label: "معاشات", icon: BadgeDollarSign, route: "/finance/payroll", permission: "payroll.view", implemented: true },
      { key: "finance-reports", label: "گزارش مالی", icon: BarChart3, route: "/finance/reports", permission: "invoices.view", implemented: true },
    ],
  },
  {
    key: "library",
    label: "کتاب‌ها و کتابخانه",
    items: [
      { key: "library", label: "کتابخانه", icon: Library, route: "/library", permission: "library.view", implemented: true },
    ],
  },
  {
    key: "hr",
    label: "منابع بشری",
    items: [
      { key: "staff", label: "کادر مکتب", icon: IdCard, route: "/staff", permission: "staff.view", implemented: true },
      { key: "hr", label: "حساب‌های کاربری", icon: Users, route: "/settings/users", permission: "users.view", implemented: true },
    ],
  },
  {
    key: "services",
    label: "خدمات مکتب",
    items: [
      { key: "services", label: "خدمات", icon: Megaphone, route: "/services", permission: "services.view", implemented: true },
    ],
  },
  {
    key: "communications",
    label: "ارتباطات",
    items: [
      { key: "announcements", label: "اعلانات", icon: Megaphone, route: "/announcements", permission: "announcements.view", implemented: true },
    ],
  },
  {
    key: "portal",
    label: "پورتال‌ها",
    items: [
      { key: "portal", label: "پورتال اولیا/شاگرد", icon: Home, route: "/portal", permission: "dashboard.view", implemented: true },
    ],
  },
  {
    key: "reports",
    label: "گزارش‌ها",
    items: [
      { key: "reports", label: "گزارش‌ها", icon: BarChart3, route: "/reports", permission: "reports.view", implemented: true },
      { key: "id-cards", label: "کارت‌های شناسایی", icon: Printer, route: "/cards", permission: "students.view", implemented: true },
    ],
  },
  {
    key: "settings",
    label: "تنظیمات",
    items: [
      { key: "settings", label: "تنظیمات مکتب", icon: Settings, route: "/settings", permission: "settings.view", implemented: true },
      { key: "year-end", label: "سال‌گذرانی", icon: IdCard, route: "/settings/year-end", permission: "year_end.manage", implemented: true },
      { key: "audit", label: "ریکارود نظارتی", icon: BarChart3, route: "/settings/audit", permission: "audit.view", implemented: true },
    ],
  },
];

export const ROADMAP_INFO: Record<string, { title: string; module: string; detail: string }> = {
  reports: { title: "گزارش‌ها", module: "گزارش‌ها", detail: "گزارش‌های تفصیلی، چاپ و صدور — گزارش‌های اصلی در بخش «گزارش‌ها» فعال هستند." },
};
