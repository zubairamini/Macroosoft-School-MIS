import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { voidPayment, paymentVoidDto } from "@/server/finance";
import type { AuthContext } from "@/server/auth/context";

type P = { params: Promise<{ id: string }> };

export const PATCH = withApi<P>(
  { permission: "payments.void" },
  async (req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    const dto = await parseBody(req, paymentVoidDto);
    return jsonOk(await voidPayment(ctx.auth, id, dto.reason));
  },
);
