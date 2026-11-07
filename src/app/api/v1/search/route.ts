import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { globalSearch } from "@/server/search";
import type { AuthContext } from "@/server/auth/context";

export const GET = withApi(
  { permission: "search.use" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const q = new URL(req.url).searchParams.get("q") ?? "";
    return jsonOk(await globalSearch(auth, q));
  },
);
