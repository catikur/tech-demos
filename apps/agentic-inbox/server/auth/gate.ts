import { readSession } from "./session.ts";

export function loginRequired(): boolean {
  const v = process.env.LOGIN_REQUIRED?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return true;
}

export function isPublicPath(pathname: string, method = "GET"): boolean {
  const m = method.toUpperCase();
  if (pathname === "/api/health") return true;
  if (pathname === "/api/session" && (m === "GET" || m === "DELETE")) return true;
  if (pathname === "/api/setup/microsoft" && m === "POST") return true;
  if (pathname === "/api/webhooks/graph") return true;
  if (pathname === "/api/auth/microsoft/start" || pathname === "/api/auth/microsoft/callback") return true;
  return false;
}

type AnyHandler = any;

function gateOne(fn: (req: Request) => Response | Promise<Response>): (req: Request) => Promise<Response> {
  return async (req) => {
    if (loginRequired() && !isPublicPath(new URL(req.url).pathname, req.method) && !readSession(req)) {
      return Response.json({ error: "Sign in with Microsoft 365" }, { status: 401 });
    }
    return fn(req);
  };
}

/** Wrap the route table so every non-public API requires a session cookie. */
export function withLoginGate<T extends Record<string, AnyHandler>>(table: T): T {
  const out: Record<string, AnyHandler> = {};
  for (const [path, handler] of Object.entries(table)) {
    if (typeof handler === "function") out[path] = gateOne(handler);
    else {
      const methods: Record<string, (req: Request) => Promise<Response>> = {};
      for (const [method, fn] of Object.entries(handler)) methods[method] = gateOne(fn as (req: Request) => Response | Promise<Response>);
      out[path] = methods;
    }
  }
  return out as T;
}
