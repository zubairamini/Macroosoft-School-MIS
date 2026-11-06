import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { listGradeLevels } from "@/server/academic";

export const GET = withApi({ permission: "academic.view" }, async () => {
  return jsonOk(await listGradeLevels());
});
