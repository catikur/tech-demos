import type { Account } from "../../shared/types.ts";
import { decryptJson, encryptJson } from "./crypto.ts";

export const SESSION_COOKIE = "inbox_session";
const MAX_AGE_SEC = 30 * 24 * 60 * 60;

export interface Session {
  accountId: string;
  email: string;
  exp: number;
}

function sessionSecure(): boolean {
  const base = (process.env.APP_BASE_URL ?? "").toLowerCase();
  return base.startsWith("https://");
}

/** Opaque encrypted session blob — cookie value for the web, bearer token for native clients. */
export function makeSessionToken(account: Pick<Account, "id" | "email">): string {
  const payload: Session = {
    accountId: account.id,
    email: account.email.toLowerCase(),
    exp: Date.now() + MAX_AGE_SEC * 1000,
  };
  return encryptJson(payload);
}

export function makeSessionCookie(account: Pick<Account, "id" | "email">, secure = sessionSecure()): string {
  const token = encodeURIComponent(makeSessionToken(account));
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${MAX_AGE_SEC}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(): string {
  const parts = [`${SESSION_COOKIE}=`, "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];
  if (sessionSecure()) parts.push("Secure");
  return parts.join("; ");
}

/** Turn a Set-Cookie header into a Cookie request header value. */
export function cookieHeader(setCookie: string): string {
  return setCookie.split(";")[0].trim();
}

function sessionTokenFrom(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (/^bearer\s+/i.test(auth)) {
    const bearer = auth.replace(/^bearer\s+/i, "").trim();
    if (bearer) return bearer;
  }
  const raw = req.headers.get("cookie") ?? "";
  const match = raw.split(";").map((p) => p.trim()).find((p) => p.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(SESSION_COOKIE.length + 1));
}

export function readSession(req: Request): Session | null {
  const token = sessionTokenFrom(req);
  if (!token) return null;
  try {
    const session = decryptJson<Session>(token);
    if (!session?.accountId || !session.email || typeof session.exp !== "number") return null;
    if (session.exp < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}
