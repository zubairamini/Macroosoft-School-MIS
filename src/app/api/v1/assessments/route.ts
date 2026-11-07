import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonList, jsonOk } from "@/server/shared/http";
import { parseQuery, parseBody } from "@/server/shared/validation";
import { z } from "zod";
import { listAssessments, createAssessment, assessmentCreateDto } from "@/server/assessments";
import type { AuthContext } from "@/server/auth/context";

const querySchema = z.object({
  academicYearId: z.string().optional(),
  classSectionId: z.string().optional(),
  subjectId: z.string().optional(),
  status: z.string().optional(),
});

export const GET = withApi(
  { permission: "assessments.view" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const q = parseQuery(req.url, querySchema);
    return jsonList(await listAssessments(auth, q));
  },
);

export const POST = withApi(
  { permission: "assessments.manage" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const dto = await parseBody(req, assessmentCreateDto);
    return jsonOk(await createAssessment(auth, dto));
  },
);
