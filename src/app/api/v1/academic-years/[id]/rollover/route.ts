import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { previewRollover, applyRollover, rolloverStatus, rolloverApplyDto } from "@/server/academic/rollover";
import type { AuthContext } from "@/server/auth/context";

type P = { params: Promise<{ id: string }> };

// GET — preview: per-student decisions, counts and candidate next years.
export const GET = withApi<P>(
  { permission: "year_end.manage" },
  async (_req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    const preview = await previewRollover(ctx.auth, id);
    return jsonOk({ ...preview, statusInfo: await rolloverStatus(ctx.auth, id) });
  },
);

// POST — apply the batch (repeat-safe). See rollover.ts for invariants.
export const POST = withApi<P>(
  { permission: "year_end.manage" },
  async (req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    const dto = await parseBody(req, rolloverApplyDto);
    return jsonOk(await applyRollover(ctx.auth, id, dto));
  },
);
