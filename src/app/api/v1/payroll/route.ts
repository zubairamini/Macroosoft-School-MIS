import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonList, jsonOk } from "@/server/shared/http";
import { parseQuery, parseBody } from "@/server/shared/validation";
import { z } from "zod";
import { listPayrollRuns, createPayrollRun, payrollCreateDto } from "@/server/finance";
import type { AuthContext } from "@/server/auth/context";

const querySchema = z.object({
  periodKey: z.string().optional(),
  status: z.string().optional(),
});

export const GET = withApi(
  { permission: "payroll.view" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const q = parseQuery(req.url, querySchema);
    return jsonList(await listPayrollRuns(auth, q));
  },
);

export const POST = withApi(
  { permission: "payroll.manage" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const dto = await parseBody(req, payrollCreateDto);
    return jsonOk(await createPayrollRun(auth, dto));
  },
);
