import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonList, jsonOk } from "@/server/shared/http";
import { parseQuery, parseBody } from "@/server/shared/validation";
import { z } from "zod";
import { listMovements, recordMovement, inventoryMovementDto } from "@/server/services";
import type { AuthContext } from "@/server/auth/context";

const querySchema = z.object({});

type P = { params: Promise<{ id: string }> };

export const GET = withApi<P>(
  { permission: "services.view" },
  async (req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    parseQuery(req.url, querySchema);
    return jsonList(await listMovements(ctx.auth, id));
  },
);

export const POST = withApi<P>(
  { permission: "services.manage" },
  async (req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    const dto = await parseBody(req, inventoryMovementDto);
    return jsonOk(await recordMovement(ctx.auth, id, dto));
  },
);
