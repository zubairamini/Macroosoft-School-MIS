import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { updateBranch, branchDto } from "@/server/academic";
import type { AuthContext } from "@/server/auth/context";

type P = { params: Promise<{ id: string }> };

/** Edit / (de)activate a branch — org-level master data, admin / مدیر عام only. */
export const PATCH = withApi<P & object>(
  { permission: "branches.manage" },
  async (req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    const dto = await parseBody(req, branchDto.partial());
    return jsonOk(await updateBranch(ctx.auth, id, dto));
  },
);
