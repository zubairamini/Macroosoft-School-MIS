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
    version: "1.1.0-phase2",
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
    "/branches": {
      get: { tags: ["academic"], summary: "شعبه‌های مکتب", responses: { 200: okJson("Me") } },
      post: { tags: ["academic"], summary: "ایجاد شعبهٔ مکتب (academic.manage)", responses: { 200: okJson("Me"), 409: errorResponse("کد تکراری") } },
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
    "/attendance/sessions/{id}": {
      get: { tags: ["attendance"], summary: "روستر حاضری با ریکارود فعلی", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Student"), 403: errorResponse("خارج از حیطهٔ اجازه") } },
      put: { tags: ["attendance"], summary: "ذخیرهٔ علائم روستر (فقط سیشن باز؛ کنترل نسخه)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okJson("Student"), 400: errorResponse("قطعی‌شده قابل ویرایش نیست"), 409: errorResponse("تعارض نسخه") } },
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
