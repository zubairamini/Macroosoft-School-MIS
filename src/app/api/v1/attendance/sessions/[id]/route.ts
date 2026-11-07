import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { getSession, saveRecords, saveRecordsDto } from "@/server/attendance";
import type { AuthContext } from "@/server/auth/context";

type P = { params: Promise<{ id: string }> };

export const GET = withApi<P>(
  { permission: "attendance.view" },
  async (_req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    return jsonOk(await getSession(ctx.auth, id));
  },
);

/** Save roster marks on an OPEN session (idempotent upsert per student). */
export const PUT = withApi<P>(
  { permission: "attendance.record" },
  async (req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    const dto = await parseBody(req, saveRecordsDto);
    return jsonOk(await saveRecords(ctx.auth, id, dto));
  },
);
