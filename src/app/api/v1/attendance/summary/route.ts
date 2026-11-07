import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseQuery } from "@/server/shared/validation";
import { z } from "zod";
import { attendanceSummary } from "@/server/attendance";
import type { AuthContext } from "@/server/auth/context";

const querySchema = z.object({
  classSectionId: z.string().optional(),
  studentId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const GET = withApi(
  { permission: "attendance.view" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const q = parseQuery(req.url, querySchema);
    return jsonOk(await attendanceSummary(auth, q));
  },
);
