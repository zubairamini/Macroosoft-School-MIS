import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { listGuardians, createGuardian, guardianCreateDto } from "@/server/students";
import type { AuthContext } from "@/server/auth/context";

export const GET = withApi(
  { permission: "guardians.view" },
  async (req: NextRequest) => {
    const q = new URL(req.url).searchParams.get("q") ?? undefined;
    return jsonOk(await listGuardians(q));
  },
);

export const POST = withApi(
  { permission: "guardians.manage" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const dto = await parseBody(req, guardianCreateDto);
    return jsonOk(await createGuardian(auth, dto));
  },
);
