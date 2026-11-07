import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseQuery } from "@/server/shared/validation";
import { z } from "zod";
import { reportCard } from "@/server/assessments";
import type { AuthContext } from "@/server/auth/context";

type P = { params: Promise<{ id: string }> };

const querySchema = z.object({
  academicYearId: z.string().optional(),
});

export const GET = withApi<P>(
  { permission: "grades.view" },
  async (req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    const q = parseQuery(req.url, querySchema);
    return jsonOk(await reportCard(ctx.auth, id, q));
  },
);
