import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseQuery, parseBody } from "@/server/shared/validation";
import { z } from "zod";
import { listClassSections, createSection, sectionDto } from "@/server/academic";

const querySchema = z.object({
  academicYearId: z.string().optional(),
  gradeLevelId: z.string().optional(),
  branchId: z.string().optional(),
});

export const GET = withApi({ permission: "academic.view" }, async (req: NextRequest) => {
  const q = parseQuery(req.url, querySchema);
  return jsonOk(await listClassSections(q));
});

export const POST = withApi({ permission: "academic.manage" }, async (req: NextRequest, { auth }) => {
  const dto = await parseBody(req, sectionDto);
  return jsonOk(await createSection(auth, dto));
});
