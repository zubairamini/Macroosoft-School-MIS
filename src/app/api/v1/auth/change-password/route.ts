import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { changePasswordDto, changePassword } from "@/server/auth/use-cases";

export const POST = withApi({}, async (req: NextRequest, { auth }) => {
  const dto = await parseBody(req, changePasswordDto);
  const result = await changePassword(auth, dto.currentPassword, dto.newPassword);
  return jsonOk(result);
});
