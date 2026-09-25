import { describe, expect, test } from "bun:test";
import {
  allowedOpenRouterBase,
  clientIp,
  maskKeyPublic,
  publicErrorMessage,
  rateLimit,
  safeStaticPath,
  sanitizeTicker,
  sessionCookieValue,
  timingSafeEqual,
  verifySession,
} from "./security";

describe("sanitizeTicker", () => {
  test("accepts listed symbols", () => {
    expect(sanitizeTicker("nvda")).toBe("NVDA");
    expect(sanitizeTicker("BRK.B")).toBe("BRK.B");
    expect(sanitizeTicker("1000000BABYDOGEUSDT")).toBe("1000000BABYDOGEUSDT");
    expect(sanitizeTicker("TSLAUSDT")).toBe("TSLAUSDT");
  });

  test("rejects empty, path, url, and oversized input", () => {
    expect(sanitizeTicker("")).toBeNull();
    expect(sanitizeTicker("../etc/passwd")).toBeNull();
    expect(sanitizeTicker("http://evil.com")).toBeNull();
    expect(sanitizeTicker("NVDA/" + "A".repeat(40))).toBeNull();
    expect(sanitizeTicker("NVDA\0X")).toBeNull();
  });
});

describe("allowedOpenRouterBase", () => {
  test("pins openrouter.ai https origins", () => {
    expect(allowedOpenRouterBase("https://openrouter.ai/api/v1")).toBe("https://openrouter.ai/api/v1");
    expect(allowedOpenRouterBase("https://openrouter.ai/api/v1/")).toBe("https://openrouter.ai/api/v1");
  });

  test("rejects attacker hosts so the API key cannot be exfiltrated", () => {
    expect(allowedOpenRouterBase("https://evil.example/v1")).toBe("https://openrouter.ai/api/v1");
    expect(allowedOpenRouterBase("https://openrouter.ai.evil.example/api/v1")).toBe(
      "https://openrouter.ai/api/v1",
    );
    expect(allowedOpenRouterBase("http://openrouter.ai/api/v1")).toBe("https://openrouter.ai/api/v1");
  });
});

describe("safeStaticPath", () => {
  const dist = "/app/dist";

  test("serves index and assets under dist", () => {
    expect(safeStaticPath(dist, "/")).toBe("/app/dist/index.html");
    expect(safeStaticPath(dist, "/assets/app.js")).toBe("/app/dist/assets/app.js");
  });

  test("blocks path traversal and absolute escapes", () => {
    expect(safeStaticPath(dist, "/../../etc/passwd")).toBeNull();
    expect(safeStaticPath(dist, "/etc/passwd")).toBe("/app/dist/etc/passwd");
    expect(safeStaticPath(dist, "/%2e%2e/%2e%2e/etc/passwd")).toBeNull();
  });
});

describe("publicErrorMessage", () => {
  test("does not forward OpenRouter response bodies", () => {
    const msg = publicErrorMessage(new Error("OpenRouter 401: {\"error\":{\"message\":\"sk-or-v1-secret\"}}"));
    expect(msg.toLowerCase()).not.toContain("sk-or");
    expect(msg).toBe("Upstream model request failed");
  });

  test("keeps known client validation errors", () => {
    expect(publicErrorMessage(new Error("ticker required"))).toBe("ticker required");
  });
});

describe("maskKeyPublic", () => {
  test("does not echo prefix or suffix of the secret", () => {
    const masked = maskKeyPublic("sk-or-v1-abcdefghijklmnopqrstuvwxyz1234");
    expect(masked).toBe("configured");
    expect(masked).not.toContain("sk-or");
    expect(masked).not.toContain("1234");
  });
});

describe("session", () => {
  test("accepts a cookie signed with the gate token", () => {
    const token = "test-gate-token-aaaaaaaa";
    const cookie = sessionCookieValue(token);
    expect(verifySession(cookie, token)).toBe(true);
    expect(verifySession(cookie, "wrong-token-bbbbbbbbbb")).toBe(false);
    expect(verifySession("deadbeef", token)).toBe(false);
  });

  test("timingSafeEqual rejects mismatched lengths", () => {
    expect(timingSafeEqual("abc", "ab")).toBe(false);
    expect(timingSafeEqual("abc", "abc")).toBe(true);
  });
});

describe("rateLimit", () => {
  test("allows up to max then denies inside the window", () => {
    const now = 1_000_000;
    expect(rateLimit("k", 2, 60_000, now)).toBe(true);
    expect(rateLimit("k", 2, 60_000, now + 10)).toBe(true);
    expect(rateLimit("k", 2, 60_000, now + 20)).toBe(false);
  });
});

describe("clientIp", () => {
  test("uses first x-forwarded-for hop", () => {
    const req = new Request("http://x/api", {
      headers: { "x-forwarded-for": "203.0.113.9, 172.18.0.3" },
    });
    expect(clientIp(req)).toBe("203.0.113.9");
  });
});
