import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { decryptJson, encryptJson } from "../server/auth/crypto.ts";

describe("token encryption", () => {
  const key = randomBytes(32);

  test("round-trips a token set", () => {
    const tokens = { accessToken: "a".repeat(40), refreshToken: "r", expiresAt: 123, scope: "Mail.Read" };
    const blob = encryptJson(tokens, key);
    expect(blob.startsWith("v1.")).toBe(true);
    expect(blob).not.toContain("aaaa");
    expect(decryptJson<typeof tokens>(blob, key)).toEqual(tokens);
  });

  test("uses a fresh IV per call", () => {
    expect(encryptJson({ x: 1 }, key)).not.toBe(encryptJson({ x: 1 }, key));
  });

  test("rejects tampering and wrong keys", () => {
    const blob = encryptJson({ secret: true }, key);
    const [v, iv, tag, data] = blob.split(".");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 0xff;
    expect(() => decryptJson([v, iv, tag, flipped.toString("base64")].join("."), key)).toThrow();
    expect(() => decryptJson(blob, randomBytes(32))).toThrow();
  });
});
