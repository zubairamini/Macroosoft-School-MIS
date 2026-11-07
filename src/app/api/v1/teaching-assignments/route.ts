import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonList, jsonOk } from "@/server/shared/http";
import { parseQuery, parseBody } from "@/server/shared/validation";
import { z } from "zod";
import { listAssignments, setAssignment, removeAssignment, assignmentDto } from "@/server/teaching";
import type { AuthContext } from "@/server/auth/context";

const querySchema = z.object({
  academicYearId: z.string().optional(),
  classSectionId: z.string().optional(),
});

export const GET = withApi(
  { permission: "academic.view" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const q = parseQuery(req.url, querySchema);
    return jsonList(await listAssignments(auth, q));
  },
);

export const POST = withApi(
  { permission: "academic.manage" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const dto = await parseBody(req, assignmentDto);
    return jsonOk(await setAssignment(auth, dto));
  },
);

export const DELETE = withApi(
  { permission: "academic.manage" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const q = parseQuery(req.url, z.object({ id: z.string().min(1) }));
    return jsonOk(await removeAssignment(auth, q.id));
  },
);
