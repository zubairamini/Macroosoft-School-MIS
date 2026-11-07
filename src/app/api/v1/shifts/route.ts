import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { listShifts, createShift, shiftDto } from "@/server/academic";

export const GET = withApi({}, async () => {
  return jsonOk(await listShifts());
});

export const POST = withApi({ permission: "academic.manage" }, async (req: NextRequest, { auth }) => {
  const dto = await parseBody(req, shiftDto);
  return jsonOk(await createShift(auth, dto));
});
