import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { transitionApplication, reviewDto } from "@/server/admissions";
import type { AuthContext } from "@/server/auth/context";

type P = { params: Promise<{ id: string }> };

export const POST = withApi<P>(
  { permission: "applications.review" },
  async (req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    const dto = await parseBody(req, reviewDto);
    const t = dto.action === "start" ? "start" : dto.action;
    return jsonOk(await transitionApplication(ctx.auth, id, t as "start" | "approve" | "reject", dto.note));
  },
);
