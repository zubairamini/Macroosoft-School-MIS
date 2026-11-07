// OpenAPI 3.0 specification for the /api/v1 contract.
// The same contract powers the web SPA and the future mobile client.

import { NextResponse } from "next/server";
import { PERMISSIONS, ROLE_KEYS, ROLE_LABELS_DARI, ROLE_MATRIX } from "@/server/rbac/permissions";

const errorResponse = (description: string) => ({
  description,
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
    },
  },
});

const okJson = (schemaName: string) => ({
  description: "موفق",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: { data: { $ref: `#/components/schemas/${schemaName}` } },
      },
    },
  },
});

const okList = (schemaName: string) => ({
  description: "موفق (با صفحه‌بندی)",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          data: { type: "array", items: { $ref: `#/components/schemas/${schemaName}` } },
          meta: { $ref: "#/components/schemas/ListMeta" },
        },
      },
    },
  },
});

const spec = {
  openapi: "3.0.3",
  info: {
    title: "مکتب‌یار (MaktabYar) API",
    description:
      "REST API for the Afghan school management information system. " +
      "All endpoints are versioned under /api/v1, authenticated with an " +
      "HttpOnly session cookie (web) and enforce role+scope permissions " +
      "server-side. Errors use a consistent envelope with Dari messages. " +
      "State-changing requests require the x-maktabyar-client header or a " +
      "same-origin Origin header (CSRF defense).",
    version: "1.4.0-phase5",
  },
  servers: [{ url: "/api/v1", description: "Same-origin API" }],
  tags: [
    { name: "auth", description: "ورود، خروج و نشست" },
    { name: "org", description: "پروفایل مکتب و تنظیم اولیه" },
    { name: "academic", description: "سال تعلیمی، صنف‌ها، شعبه‌ها، مضامین" },
    { name: "staff", description: "کادر مکتب و تخصیص‌های تدریس (مرحلهٔ دوم)" },
    { name: "timetable", description: "برنامهٔ هفتگیٔ صنف‌ها با تشخیص تضاد (مرحلهٔ دوم)" },
    { name: "attendance", description: "حاضری روزانه/پریودی با قطعیت و تصحیح (مرحلهٔ دوم)" },
    { name: "assessments", description: "امتحانات، ثبت نمرات و انتشار نتایج (مرحلهٔ دوم)" },
    { name: "finance", description: "فیس‌ها، فاکتورها، رسیدهای پرداخت، مصارف و گزارش‌های مالی (مرحلهٔ سوم)" },
    { name: "payroll", description: "سیشن‌های معاشات ماهانه (مرحلهٔ سوم)" },
    { name: "library", description: "کتابخانه: کاتلاگ، نسخه‌ها، امانت و جریمه‌ها (مرحلهٔ چهارم)" },
    { name: "communications", description: "اعلانات، رسیدهای خواندن و صف پیام‌ها (مرحلهٔ چهارم)" },
    { name: "portal", description: "پورتال یکپارچهٔ اولیا/شاگرد (مرحلهٔ چهارم)" },
    { name: "services", description: "ترانسپورت، انبار، مهمان‌ها و رویدادها (مرحلهٔ پنجم)" },
    { name: "reports", description: "ثبت‌نامه‌ها و گزارش‌های چاپی/CSV (مرحلهٔ پنجم)" },
    { name: "rollover", description: "سال‌گذرانی تکرار-امن (مرحلهٔ پنجم)" },
    { name: "discipline", description: "ریکارد انضباط و رفتار شاگردان (مرحلهٔ هفتم)" },
    { name: "analytics", description: "تحلیل‌ها و شاگردان در معرض خطر (مرحلهٔ هشتم)" },
    { name: "applications", description: "درخواست‌های شمولیت و چرخهٔ تصمیم" },
    { name: "students", description: "شاگردان، پروفایل و چرخهٔ حیات" },
    { name: "guardians", description: "اولیا" },
    { name: "dashboard", description: "KPIهای نقش‌محور" },
    { name: "search", description: "جستجوی سراسری با اجازه" },
    { name: "notifications", description: "اعلانات درون‌برنامه‌ای" },
    { name: "users", description: "کاربران و نقش‌ها" },
    { name: "settings", description: "تنظیمات و بخش‌ها" },
    { name: "audit", description: "ریکارود نظارتی" },
  ],
  components: {
    securitySchemes: {
      sessionCookie: { type: "apiKey", in: "cookie", name: "maktabyar_session" },
    },
    schemas: {
      ErrorEnvelope: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: {
                type: "string",
                enum: ["UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND", "VALIDATION_ERROR", "CONFLICT", "RATE_LIMITED", "INVALID_CREDENTIALS", "INTERNAL_ERROR"],
              },
              message: { type: "string", description: "پیام دری" },
              details: {
                type: "array",
                items: {
                  type: "object",
                  properties: { field: { type: "string" }, message: { type: "string" } },
                },
              },
            },
          },
        },
      },
      ListMeta: {
        type: "object",
        properties: {
          total: { type: "integer" },
          page: { type: "integer" },
          pageSize: { type: "integer" },
        },
      },
      Me: {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              id: { type: "string" },
              username: { type: "string" },
              fullName: { type: "string" },
              mustChangePassword: { type: "boolean" },
            },
          },
          roles: { type: "array", items: { type: "string", enum: [...ROLE_KEYS] } },
          grants: {
            type: "array",
            items: {
              type: "object",
              properties: {
                permission: { type: "string", enum: [...PERMISSIONS] },
                scope: { type: "string", enum: ["all", "branch", "year", "section", "own", "guardian"] },
                branchId: { type: "string", nullable: true },
                academicYearId: { type: "string", nullable: true },
                sectionIds: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
      Application: {
        type: "object",
        properties: {
          id: { type: "string" },
          applicantNumber: { type: "string", example: "A-1405-0006" },
          status: {
            type: "string",
            enum: ["draft", "submitted", "under_review", "approved", "rejected", "enrolled", "cancelled"],
          },
          statusLabel: { type: "string", description: "برچسب دری" },
          personal: { type: "object", additionalProperties: true },
          guardians: { type: "array", items: { type: "object", additionalProperties: true } },
          documents: { type: "array", items: { type: "object", additionalProperties: true } },
          version: { type: "integer", description: "کنترل هم‌زمانی خوش‌بینانه" },
        },
      },
      Student: {
        type: "object",
        properties: {
          id: { type: "string" },
          studentNumber: { type: "string", example: "S-1405-0011" },
          status: { type: "string", enum: ["active", "inactive", "transferred", "withdrawn", "graduated"] },
          statusLabel: { type: "string" },
          personal: {
            type: "object",
            description: "فیلدهای محدود (healthNotes) فقط با اجازهٔ students.view_sensitive",
            additionalProperties: true,
          },
          enrollments: { type: "array", items: { type: "object", additionalProperties: true } },
          guardians: { type: "array", items: { type: "object", additionalProperties: true } },
          canSeeSensitive: { type: "boolean" },
          version: { type: "integer" },
        },
      },
      AuditEvent: {
        type: "object",
        properties: {
          id: { type: "string" },
          actorName: { type: "string" },
          action: { type: "string", example: "application.enroll" },
          entity: { type: "string" },
          entityId: { type: "string" },
          reason: { type: "string", nullable: true },
          at: { type: "string", format: "date-time" },
        },
      },
    },
    "x-role-matrix": ROLE_MATRIX,
    "x-role-labels-dari": ROLE_LABELS_DARI,
  },
  security: [{ sessionCookie: [] }],
  paths: {
    "/auth/login": {
      post: {
        tags: ["auth"],
        summary: "ورود با نام کاربری و رمز",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["username", "password"],
                properties: {
                  username: { type: "string", description: "ارقام فارسی پذیرفته می‌شود" },
                  password: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: okJson("Me"),
          401: errorResponse("نام کاربری یا رمز درست نیست"),
          429: errorResponse("قفل موقت به دلیل تلاش‌های ناموفق"),
        },
      },
    },
    "/auth/logout": {
      post: { tags: ["auth"], summary: "خروج و ابطال نشست", responses: { 200: okJson("Me") } },
    },
    "/auth/me": {
      get: { tags: ["auth"], summary: "کاربر جاری با نقش‌ها و اجازه‌ها", responses: { 200: okJson("Me"), 401: errorResponse("نشست موجود نیست") } },
    },
    "/auth/change-password": {
      post: {
        tags: ["auth"],
        summary: "تغییر رمز (نشست‌های دیگر ابطال می‌شوند)",
        responses: { 200: okJson("Me"), 400: errorResponse("رمز فعلی نادرست یا سیاست رمز") },
      },
    },
    "/org": {
      get: { tags: ["org"], summary: "زمینهٔ مکتب (شعبه‌ها، سال جاری، وخت‌ها)", responses: { 200: okJson("Me") } },
      put: { tags: ["org"], summary: "به‌روزرسانی پروفایل مکتب (settings.manage)", responses: { 200: okJson("Me"), 409: errorResponse("تعارض نسخه") } },
    },
    "/org/setup": {
      post: { tags: ["org"], summary: "تنظیم اولیهٔ مکتب (فقط بار اول)", responses: { 200: okJson("Me"), 400: errorResponse("از قبل تنظیم شده") } },
    },
    "/academic-years": {
      get: { tags: ["academic"], summary: "سال‌های تعلیمی", responses: { 200: okJson("Me") } },
      post: { tags: ["academic"], summary: "ایجاد سال تعلیمی (تاریخ شمسی پذیرفته می‌شود)", responses: { 200: okJson("Me"), 409: errorResponse("نام تکراری") } },
    },
    "/academic-years/{id}": {
      patch: { tags: ["academic"], summary: "تعیین سال جاری", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Me") } },
    },
    "/grades": {
      get: { tags: ["academic"], summary: "صنف‌های ۱ تا ۱۲", responses: { 200: okJson("Me") } },
    },
    "/sections": {
      get: {
        tags: ["academic"],
        summary: "شعبه‌های صنف با تعداد شمول",
        parameters: [
          { name: "academicYearId", in: "query", schema: { type: "string" } },
          { name: "gradeLevelId", in: "query", schema: { type: "string" } },
        ],
        responses: { 200: okJson("Me") },
      },
      post: { tags: ["academic"], summary: "ایجاد شعبهٔ صنف", responses: { 200: okJson("Me"), 409: errorResponse("شعبهٔ تکراری برای صنف/سال") } },
    },
    "/shifts": {
      get: { tags: ["academic"], summary: "وخت‌ها (شیفت‌ها)", responses: { 200: okJson("Me") } },
      post: { tags: ["academic"], summary: "ایجاد وخت", responses: { 200: okJson("Me") } },
    },
    "/subjects": {
      get: { tags: ["academic"], summary: "مضامین", responses: { 200: okJson("Me") } },
      post: { tags: ["academic"], summary: "ایجاد مضمون", responses: { 200: okJson("Me"), 409: errorResponse("کد تکراری") } },
    },
    "/applications": {
      get: {
        tags: ["applications"],
        summary: "لست درخواست‌ها (صفحه‌بندی سرور)",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "جستجو با نرمال‌سازی ی/ک" },
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", default: 20, maximum: 100 } },
        ],
        responses: { 200: okList("Application"), 403: errorResponse("بدون اجازهٔ applications.view") },
      },
      post: { tags: ["applications"], summary: "ایجاد درخواست (پیش‌نویس)", responses: { 200: okJson("Application"), 400: errorResponse("اعتبارسنجی") } },
    },
    "/applications/{id}": {
      get: { tags: ["applications"], summary: "جزئیات درخواست", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Application"), 404: errorResponse("پیدا نشد") } },
      put: { tags: ["applications"], summary: "ویرایش پیش‌نویس (کنترل نسخه)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Application"), 409: errorResponse("تعارض نسخه"), 400: errorResponse("فقط پیش‌نویس") } },
    },
    "/applications/{id}/submit": {
      post: { tags: ["applications"], summary: "ارائه: draft → submitted", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Application"), 400: errorResponse("انتقال وضعیت نامعتبر") } },
    },
    "/applications/{id}/review": {
      post: {
        tags: ["applications"],
        summary: "بررسی/تصمیم: start | approve | reject (دلیل برای رد الزامی)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: okJson("Application"), 400: errorResponse("دلیل رد الزامی است"), 403: errorResponse("بدون اجازهٔ applications.review") },
      },
    },
    "/applications/{id}/enroll": {
      post: {
        tags: ["applications"],
        summary: "شمول اتمی: شاگرد + اولیا + شمولیت + اسناد + نظارت در یک تراکنش",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: okJson("Application"), 400: errorResponse("فقط درخواست تاییدشده / ظرفیت تکمیل"), 409: errorResponse("شمول هم‌زمان") },
      },
    },
    "/applications/{id}/similar": {
      get: {
        tags: ["applications"],
        summary: "تشخیص احتمال ثبت مضاعف (فقط هشدار — ادغام خودکار وجود ندارد)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: okJson("Application") },
      },
    },
    "/students": {
      get: {
        tags: ["students"],
        summary: "لست شاگردان با حیطهٔ اجازهٔ بیننده",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "gradeLevelId", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: { 200: okList("Student") },
      },
    },
    "/students/{id}": {
      get: {
        tags: ["students"],
        summary: "پروفایل شاگرد (ولی: فقط فرزند پیوند‌شده؛ استاد: فقط شعبهٔ تخصیصی)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: okJson("Student"), 403: errorResponse("خارج از حیطهٔ اجازه") },
      },
      patch: {
        tags: ["students"],
        summary: "ویرایش (کنترل نسخه؛ فیلدهای محدود فقط با students.view_sensitive)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: okJson("Student"), 409: errorResponse("تعارض نسخه") },
      },
    },
    "/students/{id}/status": {
      post: {
        tags: ["students"],
        summary: "تغییر وضعیت حیات (انصراف/انتقال نیاز به دلیل دارد)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: okJson("Student"), 400: errorResponse("دلیل الزامی") },
      },
    },
    "/staff": {
      get: {
        tags: ["staff"],
        summary: "ثبت‌نامهٔ کادر مکتب (staff.view)",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "position", in: "query", schema: { type: "string", enum: ["teacher", "admin_staff", "support"] } },
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "minimal", in: "query", schema: { type: "string", enum: ["teachers"] } },
        ],
        responses: { 200: okList("Student"), 403: errorResponse("بدون اجازهٔ staff.view") },
      },
      post: { tags: ["staff"], summary: "ثبت کارمند جدید (staff.manage)", responses: { 200: okJson("Student"), 400: errorResponse("اعتبارسنجی") } },
    },
    "/staff/{id}": {
      get: { tags: ["staff"], summary: "جزئیات کارمند با تخصیص‌های تدریس", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Student"), 404: errorResponse("پیدا نشد") } },
      patch: { tags: ["staff"], summary: "ویرایش کارمند (کنترل نسخه)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Student"), 409: errorResponse("تعارض نسخه") } },
    },
    "/teaching-assignments": {
      get: {
        tags: ["staff"],
        summary: "تخصیص‌های تدریس (academic.view)",
        parameters: [
          { name: "academicYearId", in: "query", schema: { type: "string" } },
          { name: "classSectionId", in: "query", schema: { type: "string" } },
        ],
        responses: { 200: okList("Student") },
      },
      post: { tags: ["staff"], summary: "تخصیص استاد به مضمون/شعبهٔ صنف (academic.manage) — یک استاد در هر مضمون", responses: { 200: okJson("Student"), 409: errorResponse("مضمون به استاد دیگر سپرده شده") } },
      delete: { tags: ["staff"], summary: "حذف تخصیص (academic.manage)", responses: { 200: okJson("Student") } },
    },
    "/timetable": {
      get: {
        tags: ["timetable"],
        summary: "برنامهٔ هفتگی (بخش یا برنامهٔ خود استاد با mine=1)",
        parameters: [
          { name: "classSectionId", in: "query", schema: { type: "string" } },
          { name: "mine", in: "query", schema: { type: "string", enum: ["1"] }, description: "برنامهٔ هفتگیٔ خود استاد" },
        ],
        responses: { 200: okList("Student") },
      },
      post: {
        tags: ["timetable"],
        summary: "ذخیرهٔ خانهٔ برنامه (timetable.manage) — تضاد استاد/شعبه خودکار رد می‌شود",
        responses: { 200: okJson("Student"), 409: errorResponse("تضاد زمانی استاد یا شعبهٔ صنف") },
      },
      delete: { tags: ["timetable"], summary: "حذف خانهٔ برنامه (timetable.manage)", responses: { 200: okJson("Student") } },
    },
    "/attendance/sessions": {
      get: {
        tags: ["attendance"],
        summary: "سیشن‌های حاضری (attendance.view)",
        parameters: [
          { name: "classSectionId", in: "query", schema: { type: "string" } },
          { name: "from", in: "query", schema: { type: "string", format: "date" } },
          { name: "to", in: "query", schema: { type: "string", format: "date" } },
          { name: "status", in: "query", schema: { type: "string", enum: ["open", "submitted"] } },
        ],
        responses: { 200: okList("Student") },
      },
      post: {
        tags: ["attendance"],
        summary: "باز کردن سیشن (attendance.record) — idempotent؛ قطعی‌شده رد می‌شود",
        responses: { 200: okJson("Student"), 409: errorResponse("حاضری این روز قطعی شده — مسیر تصحیح") },
      },
    },
    "/attendance/sessions/{id}/submit": {
      post: { tags: ["attendance"], summary: "قطعی کردن حاضری — از این پس در آمار محاسبه می‌شود", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Student"), 409: errorResponse("تعارض نسخه") } },
    },
    "/attendance/sessions/{id}/reopen": {
      post: {
        tags: ["attendance"],
        summary: "بازگرداندن حاضری قطعی‌شده (attendance.correct؛ دلیل الزامی)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: okJson("Student"), 403: errorResponse("فقط مدیر تعلیمی/مدیر مکتب") },
      },
    },
    "/attendance/summary": {
      get: {
        tags: ["attendance"],
        summary: "آمار حاضری — فقط سیشن‌های قطعی‌شده؛ «نا-ثبت» هرگز حاضر/غیرحاضر شمرده نمی‌شود",
        parameters: [
          { name: "classSectionId", in: "query", schema: { type: "string" } },
          { name: "studentId", in: "query", schema: { type: "string" } },
        ],
        responses: { 200: okJson("Student") },
      },
    },
    "/assessments": {
      get: {
        tags: ["assessments"],
        summary: "لست امتحانات (assessments.view)",
        parameters: [
          { name: "classSectionId", in: "query", schema: { type: "string" } },
          { name: "status", in: "query", schema: { type: "string", enum: ["grading", "published"] } },
        ],
        responses: { 200: okList("Student") },
      },
      post: { tags: ["assessments"], summary: "ایجاد امتحان (assessments.manage)", responses: { 200: okJson("Student"), 403: errorResponse("فقط مدیر تعلیمی/مدیر مکتب") } },
    },
    "/assessments/{id}": {
      get: { tags: ["assessments"], summary: "جزئیات + روستر نمرات (ولی/شاگرد: فقط منتشرشده)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Student"), 403: errorResponse("خارج از حیطهٔ اجازه") } },
      patch: { tags: ["assessments"], summary: "ویرایش (فقط قبل از انتشار)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Student"), 400: errorResponse("منتشرشده قابل ویرایش نیست") } },
    },
    "/assessments/{id}/grades": {
      get: { tags: ["assessments"], summary: "روستر نمرات", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Student") } },
      put: {
        tags: ["assessments"],
        summary: "ثبت نمرات (grades.enter — استاد مضمون یا مدیر تعلیمی)؛ خالی = نا-ثبت نه صفر",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: okJson("Student"), 400: errorResponse("نمره > نمرهٔ کل / منتشرشده"), 409: errorResponse("تعارض نسخه") },
      },
    },
    "/assessments/{id}/publish": {
      post: {
        tags: ["assessments"],
        summary: "انتشار نتایج (assessments.manage) — قطعی + نسخهٔ سیاست نمره‌دهی ذخیره می‌شود",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: okJson("Student"), 400: errorResponse("حداقل یک نمره لازم است") },
      },
    },
    "/students/{id}/report-card": {
      get: {
        tags: ["assessments"],
        summary: "کارت نتیجه — فقط نمرات منتشرشده؛ میانگین وزنی بدون احتساب نا-ثبت",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "academicYearId", in: "query", schema: { type: "string" } },
        ],
        responses: { 200: okJson("Student"), 403: errorResponse("خارج از حیطهٔ اجازه (ولی: فقط فرزند خود)" ) },
      },
    },
    "/fees": {
      get: {
        tags: ["finance"],
        summary: "پلان‌های فیس (fees.view) — تفکیک شعبه‌ای؛ فیس سراسری برای همه",
        parameters: [
          { name: "academicYearId", in: "query", schema: { type: "string" } },
          { name: "isActive", in: "query", schema: { type: "string", enum: ["true", "false"] } },
        ],
        responses: { 200: okList("Student"), 403: errorResponse("بدون اجازهٔ fees.view") },
      },
      post: {
        tags: ["finance"],
        summary: "ایجاد پلان فیس (fees.manage) — مبلغ به دیرم (۱ افغانی = ۱۰۰ دیرم)",
        responses: { 200: okJson("Student"), 400: errorResponse("اعتبارسنجی") },
      },
    },
    "/fees/{id}": {
      patch: { tags: ["finance"], summary: "ویرایش پلان فیس", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Student"), 404: errorResponse("پیدا نشد") } },
    },
    "/discounts": {
      get: { tags: ["finance"], summary: "تخفیف‌های شاگردان (fees.view)", parameters: [{ name: "studentId", in: "query", schema: { type: "string" } }], responses: { 200: okList("Student") } },
      post: { tags: ["finance"], summary: "ثبت تخفیف درصدی/مبلغی (fees.manage)", responses: { 200: okJson("Student"), 400: errorResponse("درصد > ۱۰۰") } },
    },
    "/discounts/{id}": {
      patch: { tags: ["finance"], summary: "لغو تخفیف (fees.manage)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Student") } },
    },
    "/invoices": {
      get: {
        tags: ["finance"],
        summary: "فاکتورها (invoices.view) — تفکیک شعبه‌ای؛ ولی: فقط فرزندان خود",
        parameters: [
          { name: "status", in: "query", schema: { type: "string", enum: ["issued", "partially_paid", "paid", "void"] } },
          { name: "periodKey", in: "query", schema: { type: "string" }, description: "مثلاً 1405-08 (ماه شمسی)" },
          { name: "outstanding", in: "query", schema: { type: "string", enum: ["true"] } },
          { name: "q", in: "query", schema: { type: "string" } },
        ],
        responses: { 200: okList("Student"), 403: errorResponse("بدون اجازهٔ invoices.view") },
      },
      post: {
        tags: ["finance"],
        summary: "صدور گروهی فاکتور (invoices.manage) — idempotent برای هر شاگرد/دوره",
        responses: { 200: okJson("Student"), 400: errorResponse("بدون شعبهٔ صنفی مطابق صنف‌های فیس"), 409: errorResponse("—") },
      },
    },
    "/invoices/{id}": {
      get: { tags: ["finance"], summary: "جزئیات فاکتور با رسیدهای پرداخت", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Student"), 403: errorResponse("شعبهٔ دیگر / فرزند دیگر") } },
      patch: { tags: ["finance"], summary: "باطل‌کردن فاکتور بدون پرداخت (دلیل الزامی)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Student"), 400: errorResponse("فاکتور با پرداخت ثبت‌شده") } },
    },
    "/payments": {
      get: {
        tags: ["finance"],
        summary: "رسیدهای پرداخت (payments.view) — تفکیک شعبه‌ای",
        parameters: [
          { name: "from", in: "query", schema: { type: "string", format: "date" } },
          { name: "to", in: "query", schema: { type: "string", format: "date" } },
          { name: "method", in: "query", schema: { type: "string", enum: ["cash", "bank", "hawala", "cheque"] } },
          { name: "q", in: "query", schema: { type: "string" } },
        ],
        responses: { 200: okList("Student") },
      },
      post: {
        tags: ["finance"],
        summary: "ثبت پرداخت با رسید ترتیبی (payments.collect) — پرداخت بیش از بقیه رد می‌شود",
        responses: { 200: okJson("Student"), 400: errorResponse("مبلغ بیش از بقیهٔ فاکتور"), 409: errorResponse("وضعیت هم‌زمان تغییر کرده") },
      },
    },
    "/payments/{id}": {
      patch: { tags: ["finance"], summary: "باطل‌کردن رسید با دلیل (payments.void) — بدهی برمی‌گردد", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Student") } },
    },
    "/expenses": {
      get: {
        tags: ["finance"],
        summary: "مصارف مکتب (expenses.view) — تفکیک شعبه‌ای",
        parameters: [
          { name: "from", in: "query", schema: { type: "string", format: "date" } },
          { name: "to", in: "query", schema: { type: "string", format: "date" } },
          { name: "category", in: "query", schema: { type: "string", enum: ["utilities", "maintenance", "supplies", "transport", "salaries", "other"] } },
        ],
        responses: { 200: okList("Student") },
      },
      post: { tags: ["finance"], summary: "ثبت مصرف (expenses.manage)", responses: { 200: okJson("Student"), 400: errorResponse("اعتبارسنجی") } },
    },
    "/expenses/{id}": {
      patch: { tags: ["finance"], summary: "باطل‌کردن مصرف با دلیل", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Student") } },
    },
    "/payroll": {
      get: {
        tags: ["payroll"],
        summary: "سیشن‌های معاشات (payroll.view) — تفکیک شعبه‌ای",
        parameters: [
          { name: "periodKey", in: "query", schema: { type: "string" }, description: "مثلاً 1405-08" },
          { name: "status", in: "query", schema: { type: "string", enum: ["draft", "approved", "paid"] } },
        ],
        responses: { 200: okList("Student") },
      },
      post: {
        tags: ["payroll"],
        summary: "ایجاد سیشن از معاش پایهٔ کارمندان شعبه (payroll.manage)",
        responses: { 200: okJson("Student"), 409: errorResponse("برای این ماه قبلاً ساخته شده"), 400: errorResponse("کارمند با معاش ثبت‌شده نیست") },
      },
    },
    "/payroll/{id}": {
      get: { tags: ["payroll"], summary: "جزئیات سیشن با قلم‌های معاش", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Student") } },
      patch: {
        tags: ["payroll"],
        summary: "تعدیل قلم‌ها (پیش‌نویس) یا action=approve|pay — پرداخت، مصرف «معاشات» ثبت می‌کند",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: okJson("Student"), 400: errorResponse("فقط پیش‌نویس قابل ویرایش / ابتدا تایید کنید") },
      },
    },
    "/finance/reports": {
      get: {
        tags: ["finance"],
        summary: "گزارش مالی ماهانه — KPIها، سری ۶ ماهه، بدهکاران عمده",
        parameters: [{ name: "month", in: "query", schema: { type: "string" }, description: "کلید ماه شمسی مثلاً 1405-08" }],
        responses: { 200: okJson("Student") },
      },
    },
    "/library/stats": {
      get: { tags: ["library"], summary: "آمار کتابخانه (library.view) — تفکیک شعبه‌ای", responses: { 200: okJson("Student") } },
    },
    "/library/titles": {
      get: {
        tags: ["library"],
        summary: "کاتلاگ کتاب‌ها (library.view)",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "subjectId", in: "query", schema: { type: "string" } },
          { name: "isTextbook", in: "query", schema: { type: "string", enum: ["true", "false"] } },
        ],
        responses: { 200: okList("Student") },
      },
      post: { tags: ["library"], summary: "ثبت کتاب (library.manage) — 409 عنوان تکراری شعبه", responses: { 200: okJson("Student"), 409: errorResponse("عنوان تکراری در شعبه") } },
    },
    "/library/titles/{id}": {
      patch: { tags: ["library"], summary: "ویرایش/غیرفعال‌سازی کتاب (library.manage)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Student") } },
    },
    "/library/copies": {
      get: {
        tags: ["library"],
        summary: "نسخه‌های فیزیکی (library.view)",
        parameters: [
          { name: "titleId", in: "query", schema: { type: "string" } },
          { name: "status", in: "query", schema: { type: "string", enum: ["available", "loaned", "lost", "withdrawn"] } },
          { name: "q", in: "query", schema: { type: "string" }, description: "کوډ نسخه" },
        ],
        responses: { 200: okList("Student") },
      },
      post: { tags: ["library"], summary: "افزودن نسخه‌ها به‌صورت گروهی با کوډ یکتا (library.manage)", responses: { 200: okJson("Student") } },
    },
    "/library/copies/{id}": {
      patch: { tags: ["library"], summary: "کنارگذاشتن نسخهٔ موجود (library.manage)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Student"), 400: errorResponse("نسخهٔ امانت‌شده قابل تغییر نیست") } },
    },
    "/library/loans": {
      get: {
        tags: ["library"],
        summary: "امانت‌ها (library.view) — شامل تأخیر",
        parameters: [
          { name: "status", in: "query", schema: { type: "string", enum: ["active", "returned", "lost"] } },
          { name: "studentId", in: "query", schema: { type: "string" } },
        ],
        responses: { 200: okList("Student") },
      },
      post: {
        tags: ["library"],
        summary: "ثبت امانت (library.manage) — فلیپ شرطی موجود→امانت‌شده",
        responses: { 200: okJson("Student"), 409: errorResponse("نسخه در حال حاضر امانت است"), 400: errorResponse("شاگرد در شعبهٔ کتاب شمولیت ندارد") },
      },
    },
    "/library/loans/{id}/return": {
      post: {
        tags: ["library"],
        summary: "بازگشت کتاب — جریمهٔ تأخیر به‌صورت فاکتور مالی",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: okJson("Student"), 400: errorResponse("امانت به‌وقت است؛ جریمه مجاز نیست") },
      },
    },
    "/library/loans/{id}/lost": {
      post: {
        tags: ["library"],
        summary: "ثبت نسخهٔ گم‌شده با جریمه (فاکتور مرتبط)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: okJson("Student") },
      },
    },
    "/announcements": {
      get: {
        tags: ["communications"],
        summary: "اعلانات دیدنی (announcements.view) — منتشرشده برای غیر مدیران",
        parameters: [
          { name: "status", in: "query", schema: { type: "string", enum: ["draft", "published"] } },
          { name: "audience", in: "query", schema: { type: "string", enum: ["all", "staff", "guardians"] } },
        ],
        responses: { 200: okList("Student") },
      },
      post: { tags: ["communications"], summary: "ایجاد اعلان به‌صورت پیش‌نویس (announcements.manage)", responses: { 200: okJson("Student") } },
    },
    "/announcements/{id}": {
      patch: {
        tags: ["communications"],
        summary: "ویرایش پیش‌نویس یا action=publish|unpublish",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: okJson("Student"), 400: errorResponse("اعلان منتشرشده قابل ویرایش نیست") },
      },
    },
    "/announcements/{id}/read": {
      post: {
        tags: ["communications"],
        summary: "رسید خواندن (idempotent — یک ردیف به ازای هر کاربر)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: okJson("Student") },
      },
    },
    "/messages": {
      get: { tags: ["communications"], summary: "صف پیام‌های SMS/ایمیل (announcements.manage)", responses: { 200: okList("Student") } },
      post: {
        tags: ["communications"],
        summary: "ثبت پیام گروهی در صف (target=guardians|staff) — ارسال واقعی با درگاه تولیدی",
        responses: { 200: okJson("Student"), 400: errorResponse("مخاطبی با شماره/ایمیل ثبت نیست") },
      },
    },
    "/portal/overview": {
      get: {
        tags: ["portal"],
        summary: "پورتال یکپارچهٔ اولیا/شاگرد — فرزندان، حاضری، نتایج، بدهی، اعلانات",
        responses: { 200: okJson("Student") },
      },
    },
    "/services/transport": {
      get: { tags: ["services"], summary: "مسیرهای ترانسپورت (services.view) — تفکیک شعبه‌ای", responses: { 200: okList("Student") } },
      post: { tags: ["services"], summary: "ایجاد مسیر (services.manage)", responses: { 200: okJson("Student"), 409: errorResponse("نام تکراری در شعبه") } },
    },
    "/services/transport/{id}": {
      patch: { tags: ["services"], summary: "ویرایش/توقف مسیر (services.manage)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Student") } },
    },
    "/services/transport/{id}/passengers": {
      get: { tags: ["services"], summary: "مسافران (services.view)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okList("Student") } },
      post: {
        tags: ["services"],
        summary: "افزودن مسافر — بررسی ظرفیت تراکنشی (services.manage)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: okJson("Student"), 409: errorResponse("ظرفیت تکمیل / تکراری"), 400: errorResponse("شاگرد در شعبهٔ مسیر ثبت نیست") },
      },
    },
    "/services/transport/passengers/{id}": {
      patch: { tags: ["services"], summary: "توقف/فعال‌سازی مسافر", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Student") } },
    },
    "/services/inventory": {
      get: { tags: ["services"], summary: "اقلام انبار با وضعیت کم‌موجودی (services.view)", responses: { 200: okList("Student") } },
      post: { tags: ["services"], summary: "ایجاد قلم با موجودی صفر (services.manage)", responses: { 200: okJson("Student"), 409: errorResponse("قلم تکراری در شعبه") } },
    },
    "/services/inventory/{id}/movements": {
      get: { tags: ["services"], summary: "دفتر حرکات فقط-الحاقی (services.view)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okList("Student") } },
      post: {
        tags: ["services"],
        summary: "ورود/صرف (delta مثبت/منفی) — موجودی منفی رد می‌شود (services.manage)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: okJson("Student"), 409: errorResponse("موجودی کافی نیست") },
      },
    },
    "/services/guests": {
      get: {
        tags: ["services"],
        summary: "ثبت مهمان‌ها (services.view)",
        parameters: [{ name: "inside", in: "query", schema: { type: "string", enum: ["true", "false"] } }],
        responses: { 200: okList("Student") },
      },
      post: { tags: ["services"], summary: "ثبت ورود مهمان (services.manage)", responses: { 200: okJson("Student") } },
    },
    "/services/guests/{id}": {
      patch: { tags: ["services"], summary: "ثبت خروج مهمان — دوباره 400", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Student"), 400: errorResponse("خروج قبلاً ثبت شده") } },
    },
    "/services/events": {
      get: {
        tags: ["services"],
        summary: "تقویم رویدادها — رویدادهای سازمان‌سراسری برای همه شعبه‌ها",
        parameters: [
          { name: "from", in: "query", schema: { type: "string", format: "date" } },
          { name: "kind", in: "query", schema: { type: "string", enum: ["meeting", "exam", "holiday", "ceremony", "other"] } },
        ],
        responses: { 200: okList("Student") },
      },
      post: { tags: ["services"], summary: "ایجاد رویداد شعبه/سازمان‌سراسری (services.manage)", responses: { 200: okJson("Student"), 400: errorResponse("خاتمه قبل از شروع") } },
    },
    "/services/events/{id}": {
      patch: { tags: ["services"], summary: "ویرایش رویداد", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Student") } },
    },
    "/branches": {
      get: { tags: ["academic"], summary: "داده‌های پایهٔ شعبه‌های مکتب با آمار (academic.view) — مرحلهٔ ۶", responses: { 200: okList("Student") } },
      post: { tags: ["academic"], summary: "ایجاد شعبهٔ مکتب (branches.manage — فقط مدیر سیستم/مدیر عام) — مرحلهٔ ۶", responses: { 200: okJson("Student"), 409: errorResponse("کد شعبه تکراری") } },
    },
    "/branches/{id}": {
      patch: { tags: ["academic"], summary: "ویرایش / فعال‌سازی / غیرفعال‌سازی شعبهٔ مکتب (branches.manage) — مرحلهٔ ۶", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Student"), 404: errorResponse("پیدا نشد") } },
    },
    "/attendance/sessions/{id}": {
      get: { tags: ["attendance"], summary: "روستر حاضری با ریکارود فعلی", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Student"), 403: errorResponse("خارج از حیطهٔ اجازه") } },
      put: { tags: ["attendance"], summary: "ذخیرهٔ علائم روستر (فقط سیشن باز؛ کنترل نسخه)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Student"), 400: errorResponse("قطعی‌شده قابل ویرایش نیست"), 409: errorResponse("تعارض نسخه") } },
      delete: { tags: ["attendance"], summary: "حذف پیش‌نویس سیشن باز با علائمش — قطعی‌شده حذف نمی‌شود (attendance.record) — مرحلهٔ ۶", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Student"), 400: errorResponse("قطعی‌شده حذف نمی‌شود") } },
    },
    "/discipline": {
      get: {
        tags: ["discipline"],
        summary: "ریکارد انضباط و اقدامات مثبت (discipline.view) — مرحلهٔ ۷",
        parameters: [
          { name: "studentId", in: "query", schema: { type: "string" } },
          { name: "kind", in: "query", schema: { type: "string", enum: ["late", "absent", "misconduct", "damage", "fight", "dress", "other", "merit"] } },
          { name: "severity", in: "query", schema: { type: "string", enum: ["low", "medium", "high"] } },
          { name: "resolved", in: "query", schema: { type: "string", enum: ["true", "false"] } },
          { name: "from", in: "query", schema: { type: "string", format: "date" } },
          { name: "to", in: "query", schema: { type: "string", format: "date" } },
        ],
        responses: { 200: okList("Student") },
      },
      post: { tags: ["discipline"], summary: "ثبت ریکارد انضباط/اقدام مثبت (discipline.manage) — استاد فقط برای شاگردان شعبه‌های تخصیص‌یافته", responses: { 200: okJson("Student"), 403: errorResponse("خارج از حیطهٔ اجازه") } },
    },
    "/discipline/{id}": {
      patch: { tags: ["discipline"], summary: "ویرایش / پیگیری / حل‌کردن ریکارد (discipline.manage)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Student"), 404: errorResponse("پیدا نشد") } },
      delete: { tags: ["discipline"], summary: "حذف ریکارد با ثبت کامل در ریکارود نظارتی (discipline.manage)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Student"), 403: errorResponse("خارج از حیطهٔ اجازه") } },
    },
    "/analytics/overview": {
      get: { tags: ["analytics"], summary: "KPIها، روند شش‌ماههٔ شمسی و شاگردان در معرض خطر (analytics.view) — مرحلهٔ ۸", responses: { 200: okJson("Student"), 403: errorResponse("اجازه ندارید") } },
    },
    "/reports/{kind}": {
      get: {
        tags: ["reports"],
        summary: "گزارش‌های ثبت‌نامه/حاضری/نتایج (reports.view) — جدول عمومی + CSV",
        parameters: [
          { name: "kind", in: "path", required: true, schema: { type: "string", enum: ["students", "attendance", "results"] } },
          { name: "gradeLevelId", in: "query", schema: { type: "string" } },
          { name: "classSectionId", in: "query", schema: { type: "string" } },
          { name: "subjectId", in: "query", schema: { type: "string" } },
          { name: "from", in: "query", schema: { type: "string", format: "date" } },
          { name: "to", in: "query", schema: { type: "string", format: "date" } },
          { name: "format", in: "query", schema: { type: "string", enum: ["json", "csv"], default: "json" }, description: "CSV با BOM برای اکسل" },
        ],
        responses: { 200: okJson("Student"), 404: errorResponse("گزارش ناشناخته") },
      },
    },
    "/academic-years/{id}/rollover": {
      get: {
        tags: ["rollover"],
        summary: "پیش‌نمایش سال‌گذرانی — تصمیم‌های پیش‌فرض/ذخیره‌شده (year_end.manage)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: okJson("Student"), 403: errorResponse("فقط مدیر سیستم و مدیر عام") },
      },
      post: {
        tags: ["rollover"],
        summary: "اعمال دستهٔ ارتقا تکرار-امن + بستن سال — بدهی‌ها دست‌نخورده",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: okJson("Student"), 400: errorResponse("سال مقصد باید متفاوت/غیر بسته باشد") },
      },
    },
    "/academic-years/{id}/rollover/decide": {
      post: {
        tags: ["rollover"],
        summary: "ثبت/تغییر تصمیم‌های فردی قبل از اعمال (year_end.manage)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: okJson("Student"), 400: errorResponse("ارتقا از صنف دوازدهم / تصمیم اعمال‌شده") },
      },
    },
    "/guardians": {
      get: { tags: ["guardians"], summary: "لست اولیا با فرزندان", responses: { 200: okJson("Me") } },
      post: { tags: ["guardians"], summary: "ایجاد ولی", responses: { 200: okJson("Me"), 409: errorResponse("شمارهٔ تکراری") } },
    },
    "/dashboard/summary": {
      get: { tags: ["dashboard"], summary: "KPIهای نقش‌محور (محاسبه از دادهٔ زنده)", responses: { 200: okJson("Me") } },
    },
    "/search": {
      get: {
        tags: ["search"],
        summary: "جستجوی سراسری محدود به اجازه‌ها",
        parameters: [{ name: "q", in: "query", required: true, schema: { type: "string" } }],
        responses: { 200: okJson("Me") },
      },
    },
    "/notifications": {
      get: { tags: ["notifications"], summary: "اعلانات من", responses: { 200: okJson("Me") } },
      patch: { tags: ["notifications"], summary: "علامت‌گذاری خوانده‌شده", responses: { 200: okJson("Me") } },
    },
    "/users": {
      get: { tags: ["users"], summary: "لست کاربران (users.view)", responses: { 200: okJson("Me") } },
      post: { tags: ["users"], summary: "ایجاد کاربر با نقش و حیطه (users.manage)", responses: { 200: okJson("Me"), 409: errorResponse("نام کاربری تکراری") } },
    },
    "/users/{id}": {
      patch: {
        tags: ["users"],
        summary: "بازنشانی رمز / فعال‌سازی / تخصیص نقش",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: okJson("Me"), 400: errorResponse("آخرین مدیر سیستم محافظت می‌شود") },
      },
    },
    "/settings": {
      get: { tags: ["settings"], summary: "تنظیمات بخش‌ها (settings.view)", responses: { 200: okJson("Me") } },
      patch: { tags: ["settings"], summary: "فعال/غیرفعال کردن بخش‌ها (settings.manage)", responses: { 200: okJson("Me") } },
    },
    "/audit-events": {
      get: {
        tags: ["audit"],
        summary: "ریکارود نظارتی (audit.view)",
        parameters: [
          { name: "entity", in: "query", schema: { type: "string" } },
          { name: "entityId", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
        ],
        responses: { 200: okList("AuditEvent"), 403: errorResponse("بدون اجازهٔ audit.view") },
      },
    },
  },
} as const;

export function GET() {
  return NextResponse.json(spec, {
    headers: { "Cache-Control": "no-store" },
  });
}
