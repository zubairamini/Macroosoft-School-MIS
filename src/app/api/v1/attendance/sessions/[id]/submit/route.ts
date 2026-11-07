import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { submitSession, submitDto } from "@/server/attendance";
import type { AuthContext } from "@/server/auth/context";

type P = { params: Promise<{ id: string }> };

export const POST = withApi<P>(
  { permission: "attendance.record" },
  async (req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    const dto = await parseBody(req, submitDto);
    return jsonOk(await submitSession(ctx.auth, id, dto));
  },
);
