import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { analyticsOverview } from "@/server/analytics";
import type { AuthContext } from "@/server/auth/context";

/** Phase 8 — analytics overview: KPIs, 6-month trends, at-risk students. */
export const GET = withApi(
  { permission: "analytics.view" },
  async (_req: NextRequest, { auth }: { auth: AuthContext }) => {
    return jsonOk(await analyticsOverview(auth));
  },
);
