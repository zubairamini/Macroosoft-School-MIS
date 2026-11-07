import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonList, jsonOk } from "@/server/shared/http";
import { parseQuery, parseBody, paginationSchema } from "@/server/shared/validation";
import { z } from "zod";
import {
  listApplications, createApplication, applicationCreateDto,
} from "@/server/admissions";
import type { AuthContext } from "@/server/auth/context";

const querySchema = paginationSchema.extend({
  q: z.string().optional(),
  status: z.string().optional(),
  academicYearId: z.string().optional(),
});

export const GET = withApi(
  { permission: "applications.view" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const q = parseQuery(req.url, querySchema);
    const result = await listApplications(auth, q);
    return jsonList(result.items, result.meta);
  },
);

export const POST = withApi(
  { permission: "applications.create" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const dto = await parseBody(req, applicationCreateDto);
    return jsonOk(await createApplication(auth, dto));
  },
);
