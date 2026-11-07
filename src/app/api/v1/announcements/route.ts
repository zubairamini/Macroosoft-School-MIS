import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonList, jsonOk } from "@/server/shared/http";
import { parseQuery, parseBody } from "@/server/shared/validation";
import { z } from "zod";
import { listAnnouncements, createAnnouncement, announcementDto } from "@/server/communications";
import type { AuthContext } from "@/server/auth/context";

const querySchema = z.object({
  status: z.string().optional(),
  audience: z.string().optional(),
});

export const GET = withApi(
  { permission: "announcements.view" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const q = parseQuery(req.url, querySchema);
    return jsonList(await listAnnouncements(auth, q));
  },
);

export const POST = withApi(
  { permission: "announcements.manage" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const dto = await parseBody(req, announcementDto);
    return jsonOk(await createAnnouncement(auth, dto));
  },
);
