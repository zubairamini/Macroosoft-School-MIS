import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonList, jsonOk } from "@/server/shared/http";
import { parseQuery, parseBody } from "@/server/shared/validation";
import { z } from "zod";
import { listGuests, createGuestVisit, guestVisitDto } from "@/server/services";
import type { AuthContext } from "@/server/auth/context";

const querySchema = z.object({
  inside: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const GET = withApi(
  { permission: "services.view" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const q = parseQuery(req.url, querySchema);
    return jsonList(await listGuests(auth, q));
  },
);

export const POST = withApi(
  { permission: "services.manage" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const dto = await parseBody(req, guestVisitDto);
    return jsonOk(await createGuestVisit(auth, dto));
  },
);
