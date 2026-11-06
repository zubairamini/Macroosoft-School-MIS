import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { authContextPublic } from "@/server/auth/use-cases";

export const GET = withApi({}, async (_req: NextRequest, { auth }) => {
  return jsonOk(authContextPublic(auth));
});
