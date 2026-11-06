import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { getOrgContext, updateOrg, orgDto } from "@/server/academic";

export const GET = withApi({}, async () => {
  return jsonOk(await getOrgContext());
});

export const PUT = withApi({ permission: "settings.manage" }, async (req: NextRequest, { auth }) => {
  const dto = await parseBody(req, orgDto);
  return jsonOk(await updateOrg(auth, dto));
});
