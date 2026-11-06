import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { getSettings, updateSettings, settingsDto } from "@/server/settings";
import type { AuthContext } from "@/server/auth/context";

export const GET = withApi({ permission: "settings.view" }, async () => {
  return jsonOk(await getSettings());
});

export const PATCH = withApi(
  { permission: "settings.manage" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const dto = await parseBody(req, settingsDto);
    return jsonOk(await updateSettings(auth, dto));
  },
);
