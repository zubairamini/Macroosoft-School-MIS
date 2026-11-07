import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { updateIncident, deleteIncident, incidentUpdateDto } from "@/server/discipline";
import type { AuthContext } from "@/server/auth/context";

type P = { params: Promise<{ id: string }> };

export const PATCH = withApi<P & object>(
  { permission: "discipline.manage" },
  async (req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    const dto = await parseBody(req, incidentUpdateDto);
    return jsonOk(await updateIncident(ctx.auth, id, dto));
  },
);

export const DELETE = withApi<P & object>(
  { permission: "discipline.manage" },
  async (_req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    return jsonOk(await deleteIncident(ctx.auth, id));
  },
);
