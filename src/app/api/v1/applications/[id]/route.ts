import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { getApplication, updateApplication, applicationUpdateDto } from "@/server/admissions";
import type { AuthContext } from "@/server/auth/context";

type P = { params: Promise<{ id: string }> };

export const GET = withApi<P>(
  { permission: "applications.view" },
  async (_req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    return jsonOk(await getApplication(ctx.auth, id));
  },
);

export const PUT = withApi<P>(
  { permission: "applications.update" },
  async (req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    const dto = await parseBody(req, applicationUpdateDto);
    return jsonOk(await updateApplication(ctx.auth, id, dto));
  },
);
