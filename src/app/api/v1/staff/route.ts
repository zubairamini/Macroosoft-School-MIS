import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonList, jsonOk } from "@/server/shared/http";
import { parseQuery, parseBody } from "@/server/shared/validation";
import { z } from "zod";
import { listStaff, createStaff, staffCreateDto, listTeachersMinimal } from "@/server/staff";
import type { AuthContext } from "@/server/auth/context";

const querySchema = z.object({
  q: z.string().optional(),
  position: z.string().optional(),
  status: z.string().optional(),
  minimal: z.string().optional(),
});

export const GET = withApi(
  { permission: "staff.view" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const q = parseQuery(req.url, querySchema);
    if (q.minimal === "teachers") return jsonList(await listTeachersMinimal());
    return jsonList(await listStaff(auth, q));
  },
);

export const POST = withApi(
  { permission: "staff.manage" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const dto = await parseBody(req, staffCreateDto);
    return jsonOk(await createStaff(auth, dto));
  },
);
