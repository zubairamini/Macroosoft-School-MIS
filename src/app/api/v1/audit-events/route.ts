import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonList } from "@/server/shared/http";
import { parseQuery } from "@/server/shared/validation";
import { listAuditEvents, auditQuerySchema } from "@/server/notifications";

export const GET = withApi(
  { permission: "audit.view" },
  async (req: NextRequest) => {
    const q = parseQuery(req.url, auditQuerySchema);
    const result = await listAuditEvents(q);
    return jsonList(result.items, result.meta);
  },
);
