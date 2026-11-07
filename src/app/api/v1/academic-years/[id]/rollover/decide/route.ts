import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { upsertDecisions, rolloverDecideDto } from "@/server/academic/rollover";
import type { AuthContext } from "@/server/auth/context";

type P = { params: Promise<{ id: string }> };

export const POST = withApi<P>(
  { permission: "year_end.manage" },
  async (req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    const dto = await parseBody(req, rolloverDecideDto);
    return jsonOk(await upsertDecisions(ctx.auth, id, dto));
  },
);
