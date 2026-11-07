import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { getInvoice, voidInvoice, invoiceVoidDto } from "@/server/finance";
import type { AuthContext } from "@/server/auth/context";

type P = { params: Promise<{ id: string }> };

export const GET = withApi<P>(
  { permission: "invoices.view" },
  async (_req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    return jsonOk(await getInvoice(ctx.auth, id));
  },
);

export const PATCH = withApi<P>(
  { permission: "invoices.manage" },
  async (req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    const dto = await parseBody(req, invoiceVoidDto);
    return jsonOk(await voidInvoice(ctx.auth, id, dto.reason));
  },
);
