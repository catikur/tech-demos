import { sign } from "node:crypto";
import { devices } from "../db/repo.ts";

let cachedJwt: { token: string; exp: number } | null = null;

function apnsJwt(): string | null {
  const key = process.env.APNS_KEY?.replace(/\\n/g, "\n");
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  if (!key || !keyId || !teamId) return null;
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.exp - 60 > now) return cachedJwt.token;
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: teamId, iat: now })).toString("base64url");
  const sig = sign("SHA256", Buffer.from(`${header}.${payload}`), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  const token = `${header}.${payload}.${sig}`;
  cachedJwt = { token, exp: now + 50 * 60 };
  return token;
}

/** Deliver an alert to registered iPhones and iPads. No-op until APNS_KEY, APNS_KEY_ID and APNS_TEAM_ID are set. */
export async function pushApns(ownerEmail: string | undefined, title: string, body: string): Promise<void> {
  const jwt = apnsJwt();
  if (!jwt || !ownerEmail) return;
  const bundle = process.env.APNS_BUNDLE_ID || "com.conforcus.butler";
  const host = process.env.APNS_ENV === "production" ? "https://api.push.apple.com" : "https://api.sandbox.push.apple.com";
  for (const token of devices.forOwner(ownerEmail)) {
    const res = await fetch(`${host}/3/device/${token}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": bundle,
        "apns-push-type": "alert",
        "content-type": "application/json",
      },
      body: JSON.stringify({ aps: { alert: { title, body }, sound: "default" } }),
    });
    if (res.status === 410 || res.status === 400) devices.remove(token);
  }
}
