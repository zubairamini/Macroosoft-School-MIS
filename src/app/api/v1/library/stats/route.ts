import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { libraryStats } from "@/server/library";
import type { AuthContext } from "@/server/auth/context";

export const GET = withApi(
  { permission: "library.view" },
  async (_req: NextRequest, { auth }: { auth: AuthContext }) => {
    return jsonOk(await libraryStats(auth));
  },
);
