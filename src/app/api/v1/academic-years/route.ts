import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { listAcademicYears, createAcademicYear, academicYearDto } from "@/server/academic";

export const GET = withApi({ permission: "academic.view" }, async () => {
  return jsonOk(await listAcademicYears());
});

export const POST = withApi({ permission: "academic.manage" }, async (req: NextRequest, { auth }) => {
  const dto = await parseBody(req, academicYearDto);
  return jsonOk(await createAcademicYear(auth, dto));
});
