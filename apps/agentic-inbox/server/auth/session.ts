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

export function makeSessionCookie(account: Pick<Account, "id" | "email">, secure = sessionSecure()): string {
  const payload: Session = {
    accountId: account.id,
    email: account.email.toLowerCase(),
    exp: Date.now() + MAX_AGE_SEC * 1000,
  };
  const token = encodeURIComponent(encryptJson(payload));
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

export function readSession(req: Request): Session | null {
  const raw = req.headers.get("cookie") ?? "";
  const match = raw.split(";").map((p) => p.trim()).find((p) => p.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return null;
  const token = decodeURIComponent(match.slice(SESSION_COOKIE.length + 1));
  try {
    const session = decryptJson<Session>(token);
    if (!session?.accountId || !session.email || typeof session.exp !== "number") return null;
    if (session.exp < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}
