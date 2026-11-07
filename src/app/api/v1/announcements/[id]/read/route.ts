import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { markAnnouncementRead } from "@/server/communications";
import type { AuthContext } from "@/server/auth/context";

type P = { params: Promise<{ id: string }> };

export const POST = withApi<P>(
  { permission: "announcements.view" },
  async (_req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    return jsonOk(await markAnnouncementRead(ctx.auth, id));
  },
);
