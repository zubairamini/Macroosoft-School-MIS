// Request parsing + zod validation → ApiError with Dari field messages.

import { z } from "zod";
import { ApiError } from "./http";

export async function parseBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "درخواست معتبر نیست.");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join(".") || "(root)",
      message: issue.message,
    }));
    const first = details[0]?.message ?? "داده‌های ارسالی معتبر نیست.";
    throw new ApiError(400, "VALIDATION_ERROR", first, details);
  }
  return result.data;
}

export function parseQuery<T extends z.ZodTypeAny>(
  url: string,
  schema: T,
): z.infer<T> {
  const params = Object.fromEntries(new URL(url).searchParams.entries());
  const result = schema.safeParse(params);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join(".") || "(root)",
      message: issue.message,
    }));
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      details[0]?.message ?? "پارامترهای جستجو معتبر نیست.",
      details,
    );
  }
  return result.data;
}

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
