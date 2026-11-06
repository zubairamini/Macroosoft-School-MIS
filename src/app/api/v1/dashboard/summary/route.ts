import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { dashboardSummary } from "@/server/dashboard";
import type { AuthContext } from "@/server/auth/context";

export const GET = withApi(
  { permission: "dashboard.view" },
  async (_req: NextRequest, { auth }: { auth: AuthContext }) => {
    return jsonOk(await dashboardSummary(auth));
  },
);
