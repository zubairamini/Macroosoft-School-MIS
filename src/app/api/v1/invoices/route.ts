import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonList, jsonOk } from "@/server/shared/http";
import { parseQuery, parseBody } from "@/server/shared/validation";
import { z } from "zod";
import { listInvoices, issueInvoices, invoiceIssueDto } from "@/server/finance";
import type { AuthContext } from "@/server/auth/context";

const querySchema = z.object({
  status: z.string().optional(),
  periodKey: z.string().optional(),
  studentId: z.string().optional(),
  q: z.string().optional(),
  outstanding: z.string().optional(),
});

export const GET = withApi(
  { permission: "invoices.view" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const q = parseQuery(req.url, querySchema);
    return jsonList(await listInvoices(auth, q));
  },
);

export const POST = withApi(
  { permission: "invoices.manage" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const dto = await parseBody(req, invoiceIssueDto);
    return jsonOk(await issueInvoices(auth, dto));
  },
);
