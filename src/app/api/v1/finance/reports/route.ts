import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseQuery } from "@/server/shared/validation";
import { z } from "zod";
import { financeReports } from "@/server/finance";
import type { AuthContext } from "@/server/auth/context";

const querySchema = z.object({
  month: z.string().optional(),
});

export const GET = withApi(
  { permission: "invoices.view" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const q = parseQuery(req.url, querySchema);
    return jsonOk(await financeReports(auth, q.month));
  },
);
