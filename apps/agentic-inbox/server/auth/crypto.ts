import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "../env.ts";

/**
 * OAuth tokens are stored encrypted at rest (AES-256-GCM). The key comes from
 * TOKEN_ENCRYPTION_KEY (base64, 32 bytes) or is generated once into
 * data/.token-key with owner-only permissions.
 */

let cachedKey: Buffer | null = null;

export function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  if (env.tokenEncryptionKey) {
    const key = Buffer.from(env.tokenEncryptionKey, "base64");
    if (key.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
    cachedKey = key;
    return key;
  }
  const path = join(env.dataDir, ".token-key");
  if (existsSync(path)) {
    cachedKey = Buffer.from(readFileSync(path, "utf8").trim(), "base64");
    return cachedKey;
  }
  const key = randomBytes(32);
  writeFileSync(path, key.toString("base64"), { mode: 0o600 });
  chmodSync(path, 0o600);
  cachedKey = key;
  return key;
}

export function encryptJson(value: unknown, key: Buffer = encryptionKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(".");
}

export function decryptJson<T>(blob: string, key: Buffer = encryptionKey()): T {
  const [version, ivB64, tagB64, dataB64] = blob.split(".");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) throw new Error("Unrecognized token blob");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
