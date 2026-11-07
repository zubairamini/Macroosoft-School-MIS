import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { getAssessment, updateAssessment, assessmentUpdateDto } from "@/server/assessments";
import type { AuthContext } from "@/server/auth/context";

type P = { params: Promise<{ id: string }> };

export const GET = withApi<P>(
  { permission: "assessments.view" },
  async (_req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    return jsonOk(await getAssessment(ctx.auth, id));
  },
);

export const PATCH = withApi<P>(
  { permission: "assessments.manage" },
  async (req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    const dto = await parseBody(req, assessmentUpdateDto);
    return jsonOk(await updateAssessment(ctx.auth, id, dto));
  },
);
