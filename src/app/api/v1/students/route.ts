import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonList } from "@/server/shared/http";
import { parseQuery, paginationSchema } from "@/server/shared/validation";
import { z } from "zod";
import { listStudents } from "@/server/students";
import type { AuthContext } from "@/server/auth/context";

const querySchema = paginationSchema.extend({
  q: z.string().optional(),
  status: z.string().optional(),
  gradeLevelId: z.string().optional(),
  classSectionId: z.string().optional(),
  academicYearId: z.string().optional(),
});

export const GET = withApi(
  { permission: "students.view" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const q = parseQuery(req.url, querySchema);
    const result = await listStudents(auth, q);
    return jsonList(result.items, result.meta);
  },
);
