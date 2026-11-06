// Consistent API error envelope for every /api/v1 endpoint.
// Never leaks stack traces or database errors to clients.

import { NextResponse } from "next/server";

export interface FieldError {
  field: string;
  message: string; // Dari message
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: FieldError[];

  constructor(status: number, code: string, message: string, details?: FieldError[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const errors = {
  unauthorized: () =>
    new ApiError(401, "UNAUTHENTICATED", "برای ادامه باید وارد حساب خود شوید."),
  forbidden: (what = "شما اجازهٔ انجام این عمل را ندارید.") =>
    new ApiError(403, "FORBIDDEN", what),
  notFound: (entity = "مورد") =>
    new ApiError(404, "NOT_FOUND", `${entity} پیدا نشد.`),
  badRequest: (message: string, details?: FieldError[]) =>
    new ApiError(400, "VALIDATION_ERROR", message, details),
  conflict: (message: string) =>
    new ApiError(409, "CONFLICT", message),
  tooManyRequests: (message: string) =>
    new ApiError(429, "RATE_LIMITED", message),
};

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function jsonList<T>(items: T[], meta?: Record<string, unknown>) {
  return NextResponse.json({ data: items, meta });
}

export function jsonError(err: unknown) {
  if (err instanceof ApiError) {
    return NextResponse.json(
      {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details ? { details: err.details } : {}),
        },
      },
      { status: err.status },
    );
  }
  // Unexpected: log server-side, return a generic Dari message.
  console.error("[api] unexpected error:", err);
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "خطای غیرمنتظره در سیستم رخ داد. لطفاً دوباره تلاش کنید یا با مدیر سیستم تماس بگیرید.",
      },
    },
    { status: 500 },
  );
}
