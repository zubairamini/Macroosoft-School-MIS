import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonList, jsonOk } from "@/server/shared/http";
import { parseQuery, parseBody } from "@/server/shared/validation";
import { z } from "zod";
import { listTransportRoutes, createTransportRoute, transportRouteDto } from "@/server/services";
import type { AuthContext } from "@/server/auth/context";

const querySchema = z.object({
  isActive: z.string().optional(),
});

export const GET = withApi(
  { permission: "services.view" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const q = parseQuery(req.url, querySchema);
    return jsonList(await listTransportRoutes(auth, q));
  },
);

export const POST = withApi(
  { permission: "services.manage" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const dto = await parseBody(req, transportRouteDto);
    return jsonOk(await createTransportRoute(auth, dto));
  },
);
