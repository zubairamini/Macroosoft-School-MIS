import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { updatePassenger, transportPassengerUpdateDto } from "@/server/services";
import type { AuthContext } from "@/server/auth/context";

type P = { params: Promise<{ id: string }> };

export const PATCH = withApi<P>(
  { permission: "services.manage" },
  async (req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    const dto = await parseBody(req, transportPassengerUpdateDto);
    return jsonOk(await updatePassenger(ctx.auth, id, dto));
  },
);
