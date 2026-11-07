import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk, jsonError, errors } from "@/server/shared/http";
import { parseQuery } from "@/server/shared/validation";
import { z } from "zod";
import { buildReport, reportToCsv, REPORT_KINDS } from "@/server/reports";
import type { AuthContext } from "@/server/auth/context";

const querySchema = z.object({
  gradeLevelId: z.string().optional(),
  classSectionId: z.string().optional(),
  status: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  subjectId: z.string().optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

type P = { params: Promise<{ kind: string }> };

export const GET = withApi<P>(
  { permission: "reports.view" },
  async (req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { kind } = await ctx.params;
    if (!(REPORT_KINDS as readonly string[]).includes(kind)) {
      return jsonError(errors.notFound("گزارش"));
    }
    const q = parseQuery(req.url, querySchema);
    const table = await buildReport(ctx.auth, kind, q);
    if (q.format === "csv") {
      const csv = reportToCsv(table);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="maktabyar-${kind}.csv"`,
        },
      });
    }
    return jsonOk(table);
  },
);
