import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { listUsers, createUser, userCreateDto } from "@/server/users";
import type { AuthContext } from "@/server/auth/context";

export const GET = withApi({ permission: "users.view" }, async () => {
  return jsonOk(await listUsers());
});

export const POST = withApi(
  { permission: "users.manage" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const dto = await parseBody(req, userCreateDto);
    return jsonOk(await createUser(auth, dto));
  },
);
