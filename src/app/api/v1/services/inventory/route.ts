import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonList, jsonOk } from "@/server/shared/http";
import { parseBody } from "@/server/shared/validation";
import { listInventoryItems, createInventoryItem, inventoryItemDto } from "@/server/services";
import type { AuthContext } from "@/server/auth/context";

export const GET = withApi(
  { permission: "services.view" },
  async (_req: NextRequest, { auth }: { auth: AuthContext }) => {
    return jsonList(await listInventoryItems(auth));
  },
);

export const POST = withApi(
  { permission: "services.manage" },
  async (req: NextRequest, { auth }: { auth: AuthContext }) => {
    const dto = await parseBody(req, inventoryItemDto);
    return jsonOk(await createInventoryItem(auth, dto));
  },
);
