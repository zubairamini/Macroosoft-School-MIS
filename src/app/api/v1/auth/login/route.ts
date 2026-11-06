import type { NextRequest } from "next/server";
import { withApiAnon, clientIp } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { loginDto, login } from "@/server/auth/use-cases";

export const POST = withApiAnon(async (req: NextRequest) => {
  const dto = await parseBody(req, loginDto);
  const ua = req.headers.get("user-agent");
  const result = await login(dto.username, dto.password, clientIp(req), ua);
  return jsonOk(result);
});
