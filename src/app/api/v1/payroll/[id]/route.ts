import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { z } from "zod";
import {
  getPayrollRun, updatePayrollItems, payrollAction,
  payrollUpdateDto, payrollActionDto,
} from "@/server/finance";
import type { AuthContext } from "@/server/auth/context";

type P = { params: Promise<{ id: string }> };

export const GET = withApi<P>(
  { permission: "payroll.view" },
  async (_req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    return jsonOk(await getPayrollRun(ctx.auth, id));
  },
);

// Two PATCH shapes: { items: [...] } adjusts draft items; { action } approves/pays.
const patchDto = z.union([payrollUpdateDto, payrollActionDto]);

export const PATCH = withApi<P>(
  { permission: "payroll.manage" },
  async (req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    const dto = await parseBody(req, patchDto);
    if ("action" in dto) {
      return jsonOk(await payrollAction(ctx.auth, id, dto));
    }
    return jsonOk(await updatePayrollItems(ctx.auth, id, dto));
  },
);
