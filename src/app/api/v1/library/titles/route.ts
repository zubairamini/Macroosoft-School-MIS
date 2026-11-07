import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonList, jsonOk } from "@/server/shared/http";
import { parseQuery, parseBody } from "@/server/shared/validation";
import { z } from "zod";
import { listTitles, createTitle, bookTitleDto } from "@/server/library";
import type { AuthContext } from "@/server/auth/context";

const querySchema = z.object({
  q: z.string().optional(),
  subjectId: z.string().optional(),
  isTextbook: z.string().optional(),
});

export const GET = withApi(
  { permission: "library.view" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const q = parseQuery(req.url, querySchema);
    return jsonList(await listTitles(auth, q));
  },
);

export const POST = withApi(
  { permission: "library.manage" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const dto = await parseBody(req, bookTitleDto);
    return jsonOk(await createTitle(auth, dto));
  },
);
