import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk, errors } from "@/server/shared/http";
import { updateAnnouncement, setAnnouncementStatus, announcementUpdateDto, announcementPublishDto } from "@/server/communications";
import type { AuthContext } from "@/server/auth/context";
import { z } from "zod";

type P = { params: Promise<{ id: string }> };

/** Parse the body ONCE against one of two PATCH shapes. */
async function parsePatch(req: NextRequest): Promise<
  { kind: "publish"; dto: z.infer<typeof announcementPublishDto> } |
  { kind: "edit"; dto: z.infer<typeof announcementUpdateDto> }
> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw errors.badRequest("درخواست معتبر نیست.");
  }
  const asAction = announcementPublishDto.safeParse(raw);
  if (asAction.success) return { kind: "publish", dto: asAction.data };
  const asEdit = announcementUpdateDto.safeParse(raw);
  if (asEdit.success) return { kind: "edit", dto: asEdit.data };
  throw errors.badRequest("داده‌های ارسالی معتبر نیست.");
}

export const PATCH = withApi<P>(
  { permission: "announcements.manage" },
  async (req: NextRequest, ctx: P & { auth: AuthContext }) => {
    const { id } = await ctx.params;
    const parsed = await parsePatch(req);
    if (parsed.kind === "publish") {
      return jsonOk(await setAnnouncementStatus(ctx.auth, id, parsed.dto));
    }
    return jsonOk(await updateAnnouncement(ctx.auth, id, parsed.dto));
  },
);
