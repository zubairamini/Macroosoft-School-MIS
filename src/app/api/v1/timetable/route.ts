import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonList, jsonOk } from "@/server/shared/http";
import { parseQuery, parseBody } from "@/server/shared/validation";
import { z } from "zod";
import {
  getTimetable, upsertTimetableSlot, deleteTimetableSlot,
  getMyTimetable, timetableSlotDto, canViewTimetable,
} from "@/server/teaching";
import type { AuthContext } from "@/server/auth/context";

const querySchema = z.object({
  classSectionId: z.string().optional(),
  staffId: z.string().optional(),
  mine: z.string().optional(),
});

export const GET = withApi(
  { permission: "timetable.view" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const q = parseQuery(req.url, querySchema);
    if (q.mine === "1") return jsonOk(await getMyTimetable(auth));
    if (q.classSectionId) {
      const ok = await canViewTimetable(auth, q.classSectionId);
      if (!ok) {
        return jsonList([], { note: "no-access" });
      }
      return jsonList(await getTimetable(auth, { classSectionId: q.classSectionId }));
    }
    if (q.staffId) {
      // Teachers may view their own schedule; others need a section context.
      if (q.staffId !== "me") return jsonList([]);
      return jsonOk(await getMyTimetable(auth));
    }
    return jsonList([]);
  },
);

export const POST = withApi(
  { permission: "timetable.manage" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const dto = await parseBody(req, timetableSlotDto);
    return jsonOk(await upsertTimetableSlot(auth, dto));
  },
);

export const DELETE = withApi(
  { permission: "timetable.manage" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const q = parseQuery(req.url, z.object({ id: z.string().min(1) }));
    return jsonOk(await deleteTimetableSlot(auth, q.id));
  },
);
