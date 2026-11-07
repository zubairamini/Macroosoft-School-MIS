import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { markLoanLost, loanLostDto } from "@/server/library";
import type { AuthContext } from "@/server/auth/context";

type P = { params: Promise<{ id: string }> };

export const POST = withApi<P>(
  { permission: "library.manage" },
  async (req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    const dto = await parseBody(req, loanLostDto);
    return jsonOk(await markLoanLost(ctx.auth, id, dto));
  },
);
