import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonList, jsonOk } from "@/server/shared/http";
import { parseQuery, parseBody } from "@/server/shared/validation";
import { z } from "zod";
import { listEvents, createEvent, schoolEventDto } from "@/server/services";
import type { AuthContext } from "@/server/auth/context";

const querySchema = z.object({
  from: z.string().optional(),
  kind: z.string().optional(),
});

export const GET = withApi(
  { permission: "services.view" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const q = parseQuery(req.url, querySchema);
    return jsonList(await listEvents(auth, q));
  },
);

export const POST = withApi(
  { permission: "services.manage" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const dto = await parseBody(req, schoolEventDto);
    return jsonOk(await createEvent(auth, dto));
  },
);
