import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { getOrgContext, updateOrg, orgDto } from "@/server/academic";
import type { AuthContext } from "@/server/auth/context";

export const GET = withApi({}, async (_req: NextRequest, { auth }: { auth: AuthContext }) => {
  return jsonOk(await getOrgContext(auth));
});

export const PUT = withApi({ permission: "settings.manage" }, async (req: NextRequest, { auth }) => {
  const dto = await parseBody(req, orgDto);
  return jsonOk(await updateOrg(auth, dto));
});
