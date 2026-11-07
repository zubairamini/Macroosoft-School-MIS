import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonList, jsonOk } from "@/server/shared/http";
import { parseQuery, parseBody } from "@/server/shared/validation";
import { z } from "zod";
import { listPassengers, addPassenger, transportPassengerDto } from "@/server/services";
import type { AuthContext } from "@/server/auth/context";

const querySchema = z.object({
  routeId: z.string().optional(),
  status: z.string().optional(),
});

type P = { params: Promise<{ id: string }> };

export const GET = withApi<P>(
  { permission: "services.view" },
  async (req: NextRequest, ctx: P & { auth: AuthContext }) => {
    await ctx.params; // route id unused — filters come from the query string
    const q = parseQuery(req.url, querySchema);
    return jsonList(await listPassengers(ctx.auth, q));
  },
);

export const POST = withApi<P>(
  { permission: "services.manage" },
  async (req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    const dto = await parseBody(req, transportPassengerDto);
    return jsonOk(await addPassenger(ctx.auth, { ...dto, routeId: dto.routeId || id }));
  },
);
