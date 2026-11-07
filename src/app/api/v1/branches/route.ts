import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { listBranchesMaster, createBranch, branchDto } from "@/server/academic";
import type { AuthContext } from "@/server/auth/context";

/** Phase 6 — branch master data. Listing follows branch isolation
 *  (admin / مدیر عام see every branch including deactivated ones). */
export const GET = withApi(
  { permission: "academic.view" },
  async (_req: NextRequest, { auth }: { auth: AuthContext }) => {
    return jsonOk(await listBranchesMaster(auth));
  },
);

/** Create a branch — org-level master data, admin / مدیر عام only. */
export const POST = withApi({ permission: "branches.manage" }, async (req: NextRequest, { auth }) => {
  const dto = await parseBody(req, branchDto);
  return jsonOk(await createBranch(auth, dto));
});
