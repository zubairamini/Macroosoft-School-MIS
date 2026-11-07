import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { getStaff, updateStaff, staffUpdateDto } from "@/server/staff";
import type { AuthContext } from "@/server/auth/context";

type P = { params: Promise<{ id: string }> };

export const GET = withApi<P>(
  { permission: "staff.view" },
  async (_req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    return jsonOk(await getStaff(ctx.auth, id));
  },
);

export const PATCH = withApi<P>(
  { permission: "staff.manage" },
  async (req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    const dto = await parseBody(req, staffUpdateDto);
    return jsonOk(await updateStaff(ctx.auth, id, dto));
  },
);
