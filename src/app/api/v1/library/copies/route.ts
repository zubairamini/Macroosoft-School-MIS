import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonList, jsonOk } from "@/server/shared/http";
import { parseQuery, parseBody } from "@/server/shared/validation";
import { z } from "zod";
import { listCopies, addCopies, bookCopiesDto } from "@/server/library";
import type { AuthContext } from "@/server/auth/context";

const querySchema = z.object({
  titleId: z.string().optional(),
  status: z.string().optional(),
  q: z.string().optional(),
});

export const GET = withApi(
  { permission: "library.view" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const q = parseQuery(req.url, querySchema);
    return jsonList(await listCopies(auth, q));
  },
);

export const POST = withApi(
  { permission: "library.manage" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const dto = await parseBody(req, bookCopiesDto);
    return jsonOk(await addCopies(auth, dto));
  },
);
