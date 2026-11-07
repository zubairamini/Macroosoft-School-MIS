import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonList, jsonOk } from "@/server/shared/http";
import { parseQuery, parseBody } from "@/server/shared/validation";
import { z } from "zod";
import { listExpenses, createExpense, expenseDto } from "@/server/finance";
import type { AuthContext } from "@/server/auth/context";

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  category: z.string().optional(),
});

export const GET = withApi(
  { permission: "expenses.view" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const q = parseQuery(req.url, querySchema);
    return jsonList(await listExpenses(auth, q));
  },
);

export const POST = withApi(
  { permission: "expenses.manage" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const dto = await parseBody(req, expenseDto);
    return jsonOk(await createExpense(auth, dto));
  },
);
