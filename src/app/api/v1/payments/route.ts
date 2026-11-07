import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonList, jsonOk } from "@/server/shared/http";
import { parseQuery, parseBody } from "@/server/shared/validation";
import { z } from "zod";
import { listPayments, collectPayment, paymentCollectDto } from "@/server/finance";
import type { AuthContext } from "@/server/auth/context";

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  method: z.string().optional(),
  q: z.string().optional(),
  invoiceId: z.string().optional(),
  studentId: z.string().optional(),
});

export const GET = withApi(
  { permission: "payments.view" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const q = parseQuery(req.url, querySchema);
    return jsonList(await listPayments(auth, q));
  },
);

export const POST = withApi(
  { permission: "payments.collect" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const dto = await parseBody(req, paymentCollectDto);
    return jsonOk(await collectPayment(auth, dto));
  },
);
