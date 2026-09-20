import { createHmac, timingSafeEqual as tse } from "node:crypto";
import { join, normalize } from "node:path";
import { pinOpenRouterBase } from "../src/shared/settings";
import { sanitizeTicker } from "../src/shared/ticker";

export { sanitizeTicker };

export const AUTH_COOKIE = "atlas_session";
export const allowedOpenRouterBase = pinOpenRouterBase;

const hits = new Map<string, number[]>();

export function safeStaticPath(dist: string, pathname: string): string | null {
  let rel = pathname === "/" || pathname === "" ? "index.html" : pathname;
  try {
    rel = decodeURIComponent(rel);
  } catch {
    return null;
  }
  if (rel.includes("\0")) return null;
  rel = rel.replace(/^\/+/, "");
  if (rel.split(/[/\\]/).some((p) => p === "..")) return null;
  const root = normalize(dist);
  const resolved = normalize(join(root, rel));
  const prefix = root.endsWith("/") ? root : `${root}/`;
  if (resolved !== root && !resolved.startsWith(prefix)) return null;
  return resolved;
}

export function publicErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/openrouter/i.test(message) || /sk-or/i.test(message) || /authorization/i.test(message) || /bearer/i.test(message)) {
    return "Upstream model request failed";
  }
  const client =
    /required|missing|not found|Already booked|STAND DOWN|Need at least|disabled|quantity is 0|Not enough cash|Could not identify|incomplete patch|Unauthorized|Too many|Invalid ticker|Invalid agent|No pending|Theme returned|CRO\/CIO/i.test(
      message,
    );
  if (client && message.length <= 180) return message;
  return "Request failed";
}

export function maskKeyPublic(key: string | null | undefined): string | null {
  if (!key) return null;
  return "configured";
}

export function timingSafeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return tse(ba, bb);
}

export function sessionCookieValue(token: string): string {
  return createHmac("sha256", token).update("atlas-gic-session-v1").digest("hex");
}

export function verifySession(cookie: string | null | undefined, token: string): boolean {
  if (!cookie || !token) return false;
  return timingSafeEqual(cookie, sessionCookieValue(token));
}

export function parseCookieHeader(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function isAuthed(req: Request, token: string | null): boolean {
  if (!token) return false;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (bearer && timingSafeEqual(bearer, token)) return true;
  const cookie = parseCookieHeader(req.headers.get("cookie"))[AUTH_COOKIE];
  return verifySession(cookie, token);
}

export function sessionSetCookie(token: string, secure: boolean): string {
  const parts = [
    `${AUTH_COOKIE}=${sessionCookieValue(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=604800",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function sessionClearCookie(secure: boolean): string {
  const parts = [`${AUTH_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(key, arr);
    return false;
  }
  arr.push(now);
  hits.set(key, arr);
  return true;
}

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim() ?? "";
    if (first && first.length <= 64) return first;
  }
  return "unknown";
}

export function readJsonLimit(text: string, maxBytes = 64_000): Record<string, unknown> {
  if (text.length > maxBytes) throw new Error("Request too large");
  if (!text) return {};
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid JSON");
  return parsed as Record<string, unknown>;
}

export function securityHeaders(json = false): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}
