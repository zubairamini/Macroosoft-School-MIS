import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { listIncidents, createIncident, incidentCreateDto } from "@/server/discipline";
import type { AuthContext } from "@/server/auth/context";

export const GET = withApi(
  { permission: "discipline.view" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const sp = req.nextUrl.searchParams;
    return jsonOk(
      await listIncidents(auth, {
        studentId: sp.get("studentId") ?? undefined,
        kind: sp.get("kind") ?? undefined,
        severity: sp.get("severity") ?? undefined,
        resolved: sp.get("resolved") ?? undefined,
        from: sp.get("from") ?? undefined,
        to: sp.get("to") ?? undefined,
      }),
    );
  },
);

export const POST = withApi(
  { permission: "discipline.manage" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const dto = await parseBody(req, incidentCreateDto);
    return jsonOk(await createIncident(auth, dto));
  },
);
