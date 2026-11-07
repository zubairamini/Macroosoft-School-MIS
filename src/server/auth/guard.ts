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

// ── CSRF / origin validation (proxy-aware) ─────────────────────────────────
// Defence layers for state-changing verbs:
//   1. Trusted client header: our SPA (and any future mobile/CLI client)
//      always sends `x-maktabyar-client: 1`. Cross-site HTML forms cannot set
//      custom headers, and a cross-site fetch() WITH a custom header requires
//      a CORS preflight that this API never approves — so for browsers this
//      header proves same-origin. Non-browser clients are not a CSRF vector.
//      This also survives reverse proxies that rewrite the Host header.
//   2. Same-origin check for "simple" requests without the header: Origin
//      must match the Host header, the X-Forwarded-Host chain set by proxies,
//      or the operator-configured MAKTABYAR_ALLOWED_ORIGINS allowlist.
//   3. Session cookie is SameSite=Lax on top of both layers.

/** Extra origins/hosts an operator may allow (comma-separated), for gateways
 *  that rewrite Host AND strip custom headers. */
function allowedExtraOrigins(): string[] {
  const raw = process.env.MAKTABYAR_ALLOWED_ORIGINS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Every host value this deployment considers "us": Host, X-Forwarded-Host
 *  chain (outermost first, as set by reverse proxies), env allowlist. */
function requestHostCandidates(req: NextRequest): string[] {
  const out: string[] = [];
  const push = (v: string | null) => {
    if (!v) return;
    for (const part of v.split(",")) {
      const h = part.trim().toLowerCase();
      if (h) out.push(h);
    }
  };
  push(req.headers.get("host"));
  push(req.headers.get("x-forwarded-host"));
  for (const o of allowedExtraOrigins()) {
    try {
      out.push(new URL(o.includes("://") ? o : `https://${o}`).host.toLowerCase());
    } catch {
      // Malformed allowlist entry — ignore it.
    }
  }
  return out;
}

function normalizeHost(host: string, defaultPort: string): string {
  const h = host.toLowerCase();
  return h.endsWith(`:${defaultPort}`)
    ? h.slice(0, -(defaultPort.length + 1))
    : h;
}

function originMatchesCandidates(originUrl: URL, candidates: string[]): boolean {
  // URL.host omits the default port; proxy-supplied hosts may include it.
  const originHttps = originUrl.protocol === "https:";
  const originHost = originUrl.host.toLowerCase();
  const originNoDefault = normalizeHost(originHost, originHttps ? "443" : "80");
  const originHostname = originUrl.hostname.toLowerCase();
  for (const c of candidates) {
    if (
      c === originHost ||
      normalizeHost(c, "443") === originNoDefault ||
      normalizeHost(c, "80") === originNoDefault
    ) {
      return true;
    }
    // Candidate without a port matches an origin without an explicit port
    // on the same hostname (proxies commonly drop the port).
    if (!c.includes(":") && c === originHostname && !originUrl.port) return true;
  }
  return false;
}

function passesOriginCheck(req: NextRequest): boolean {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;

  // Layer 1: trusted client header (see block comment above).
  if (req.headers.get(CLIENT_HEADER) === "1") return true;

  // Layer 2: header-less browser requests must carry a same-origin Origin.
  const origin = req.headers.get("origin");
  if (!origin || origin.toLowerCase() === "null") return false;
  try {
    const originUrl = new URL(origin);
    return originMatchesCandidates(originUrl, requestHostCandidates(req));
  } catch {
    return false;
  }
}

/** Shared rejection: uniform Dari message to the client, diagnostic details
 *  (origin/host/forwarded-host) only in the server log. */
function originCheckResponse(req: NextRequest): Response | null {
  if (passesOriginCheck(req)) return null;
  console.warn(
    `[api] origin check rejected: method=${req.method} ` +
      `origin=${req.headers.get("origin") ?? "-"} ` +
      `host=${req.headers.get("host") ?? "-"} ` +
      `x-forwarded-host=${req.headers.get("x-forwarded-host") ?? "-"}`,
  );
  return jsonError(
    errors.forbidden("درخواست از یک منبع نامعتبر ارسال شده است."),
  );
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
      const rejected = originCheckResponse(req);
      if (rejected) return rejected;
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
      const rejected = originCheckResponse(req);
      if (rejected) return rejected;
      const auth = await resolveAuth(req);
      return await handler(req, { ...(routeCtx ?? ({} as P)), auth: auth as AuthContext | null } as { auth: AuthContext | null } & P);
    } catch (err) {
      return jsonError(err);
    }
  };
}
