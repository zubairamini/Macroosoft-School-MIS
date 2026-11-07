import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonList, jsonOk } from "@/server/shared/http";
import { parseQuery, parseBody } from "@/server/shared/validation";
import { z } from "zod";
import { listSessions, upsertSession, sessionUpsertDto } from "@/server/attendance";
import type { AuthContext } from "@/server/auth/context";

const querySchema = z.object({
  classSectionId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  status: z.string().optional(),
});

export const GET = withApi(
  { permission: "attendance.view" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const q = parseQuery(req.url, querySchema);
    return jsonList(await listSessions(auth, q));
  },
);

export const POST = withApi(
  { permission: "attendance.record" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const dto = await parseBody(req, sessionUpsertDto);
    return jsonOk(await upsertSession(auth, dto));
  },
);
