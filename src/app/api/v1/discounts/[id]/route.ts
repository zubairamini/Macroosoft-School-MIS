import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { revokeDiscount } from "@/server/finance";
import type { AuthContext } from "@/server/auth/context";

type P = { params: Promise<{ id: string }> };

export const PATCH = withApi<P>(
  { permission: "fees.manage" },
  async (_req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    return jsonOk(await revokeDiscount(ctx.auth, id));
  },
);
