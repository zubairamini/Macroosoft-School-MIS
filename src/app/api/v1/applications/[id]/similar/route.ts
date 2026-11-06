import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { findSimilarApplications } from "@/server/admissions";

type P = { params: Promise<{ id: string }> };

export const GET = withApi<P>(
  { permission: "applications.view" },
  async (_req: NextRequest, ctx: P) => {
    const { id } = await ctx.params;
    const app = await (await import("@/server/admissions")).getApplication(id);
    return jsonOk(await findSimilarApplications(app.personal, id));
  },
);
