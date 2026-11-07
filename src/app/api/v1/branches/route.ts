import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { listBranches, createBranch, branchDto } from "@/server/academic";
import type { AuthContext } from "@/server/auth/context";

export const GET = withApi(
  { permission: "academic.view" },
  async (_req: NextRequest, { auth }: { auth: AuthContext }) => {
    return jsonOk(await listBranches(auth));
  },
);

export const POST = withApi({ permission: "academic.manage" }, async (req: NextRequest, { auth }) => {
  const dto = await parseBody(req, branchDto);
  return jsonOk(await createBranch(auth, dto));
});
