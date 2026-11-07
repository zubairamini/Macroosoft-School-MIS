import type { NextRequest } from "next/server";
import { withApiAnon, clientIp } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { logout } from "@/server/auth/use-cases";

export const POST = withApiAnon(async (req: NextRequest) => {
  const result = await logout(clientIp(req));
  return jsonOk(result);
});
