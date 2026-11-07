import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { setupDto, setupSchool } from "@/server/academic";

export const POST = withApi({ permission: "settings.manage" }, async (req: NextRequest, { auth }) => {
  const dto = await parseBody(req, setupDto);
  return jsonOk(await setupSchool(auth, dto));
});
