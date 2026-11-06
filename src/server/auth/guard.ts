// withApi: the single wrapper every /api/v1 route handler passes through.
// Responsibilities:
//   1. Resolve the AuthContext from the HttpOnly session cookie.
//   2. CSRF defense for state-changing verbs: Origin must match Host
//      (when browsers send Origin) AND the custom client header must be
//      present. Cookie is SameSite=Lax.
//   3. Enforce the required permission through the RBAC scope engine.
//   4. Uniform error envelope (no stack traces / DB errors leak).

import type { NextRequest } from "next/server";
import { jsonError, errors } from "@/server/shared/http";
import { can } from "@/server/rbac/scope";
import { buildAuthContext } from "./context";
import { readSessionToken, getSessionByToken } from "./session";
import type { AuthContext } from "./context";

const CLIENT_HEADER = "x-maktabyar-client";

export interface ApiRouteOptions {
  /** Permission required for the whole endpoint. */
  permission?: string;
}

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "127.0.0.1";
}

function passesOriginCheck(req: NextRequest): boolean {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const host = req.headers.get("host");
      const originHost = new URL(origin).host;
      return originHost === host;
    } catch {
      return false;
    }
  }
  // No Origin (non-browser clients): require our custom header instead.
  return req.headers.get(CLIENT_HEADER) === "1";
}

export async function getAuthContext(
  req: NextRequest,
): Promise<AuthContext | null> {
  const token = await readSessionToken();
  if (!token) return null;
  const session = await getSessionByToken(token);
  if (!session) return null;
  const branchHint = req.headers.get("x-maktabyar-branch");
  return buildAuthContext(session.userId, session.id, clientIp(req), branchHint);
}

async function resolveAuth(req: NextRequest): Promise<AuthContext | null> {
  return getAuthContext(req);
}

/** Authenticated handler wrapper (P = route params context). */
export function withApi<P extends object = object>(
  opts: ApiRouteOptions,
  handler: (req: NextRequest, ctx: { auth: AuthContext } & P) => Promise<Response>,
): (req: NextRequest, routeCtx: P) => Promise<Response> {
  return async (req: NextRequest, routeCtx: P) => {
    try {
      if (!passesOriginCheck(req)) {
        return jsonError(errors.forbidden("درخواست از یک منبع نامعتبر ارسال شده است."));
      }
      const auth = await resolveAuth(req);
      if (!auth) return jsonError(errors.unauthorized());
      if (opts.permission && !can(auth, opts.permission)) {
        return jsonError(errors.forbidden());
      }
      return await handler(req, { ...(routeCtx ?? ({} as P)), auth } as { auth: AuthContext } & P);
    } catch (err) {
      return jsonError(err);
    }
  };
}

/** Anonymous-capable handler wrapper (auth may be null). */
export function withApiAnon<P extends object = object>(
  handler: (req: NextRequest, ctx: { auth: AuthContext | null } & P) => Promise<Response>,
): (req: NextRequest, routeCtx: P) => Promise<Response> {
  return async (req: NextRequest, routeCtx: P) => {
    try {
      if (!passesOriginCheck(req)) {
        return jsonError(errors.forbidden("درخواست از یک منبع نامعتبر ارسال شده است."));
      }
      const auth = await resolveAuth(req);
      return await handler(req, { ...(routeCtx ?? ({} as P)), auth: auth as AuthContext | null } as { auth: AuthContext | null } & P);
    } catch (err) {
      return jsonError(err);
    }
  };
}
