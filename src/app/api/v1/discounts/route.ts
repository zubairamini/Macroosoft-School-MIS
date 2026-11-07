import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonList, jsonOk } from "@/server/shared/http";
import { parseQuery, parseBody } from "@/server/shared/validation";
import { z } from "zod";
import { listDiscounts, createDiscount, discountDto } from "@/server/finance";
import type { AuthContext } from "@/server/auth/context";

const querySchema = z.object({
  academicYearId: z.string().optional(),
  studentId: z.string().optional(),
});

export const GET = withApi(
  { permission: "fees.view" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const q = parseQuery(req.url, querySchema);
    return jsonList(await listDiscounts(auth, q));
  },
);

export const POST = withApi(
  { permission: "fees.manage" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const dto = await parseBody(req, discountDto);
    return jsonOk(await createDiscount(auth, dto));
  },
);
