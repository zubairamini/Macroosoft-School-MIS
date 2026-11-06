import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { z } from "zod";
import { listMyNotifications, markNotificationsRead } from "@/server/notifications";
import type { AuthContext } from "@/server/auth/context";

export const GET = withApi(
  { permission: "notifications.view" },
  async (_req: NextRequest, { auth }: { auth: AuthContext }) => {
    return jsonOk(await listMyNotifications(auth));
  },
);

const markSchema = z.object({ ids: z.array(z.string()).optional() });

export const PATCH = withApi(
  { permission: "notifications.view" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const dto = await parseBodySafe(req);
    return jsonOk(await markNotificationsRead(auth, dto?.ids));
  },
);

async function parseBodySafe(req: NextRequest) {
  try {
    const raw = (await req.json()) as unknown;
    return markSchema.parse(raw);
  } catch {
    return undefined;
  }
}
