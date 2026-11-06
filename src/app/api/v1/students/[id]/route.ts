import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { getStudentProfile, updateStudent, studentUpdateDto } from "@/server/students";
import type { AuthContext } from "@/server/auth/context";

type P = { params: Promise<{ id: string }> };

export const GET = withApi<P>(
  { permission: "students.view" },
  async (_req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    return jsonOk(await getStudentProfile(ctx.auth, id));
  },
);

export const PATCH = withApi<P>(
  { permission: "students.update" },
  async (req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    const dto = await parseBody(req, studentUpdateDto);
    return jsonOk(await updateStudent(ctx.auth, id, dto));
  },
);
