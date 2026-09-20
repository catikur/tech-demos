import { describe, expect, test } from "bun:test";
import { base64Url, buildMime, extractBody, googleQuotaExceeded, splitAddresses } from "../server/connectors/gmail.ts";

const b64 = (s: string) => Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");

describe("gmail helpers", () => {
  test("extractBody prefers text/plain and walks nested parts", () => {
    const payload = {
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "multipart/alternative",
          parts: [
            { mimeType: "text/html", body: { data: b64("<p>Hello <b>there</b></p>") } },
            { mimeType: "text/plain", body: { data: b64("Hello there") } },
          ],
        },
        { mimeType: "application/pdf", body: { attachmentId: "x" } },
      ],
    };
    expect(extractBody(payload)).toBe("Hello there");
    expect(extractBody({ mimeType: "text/html", body: { data: b64("<div>Only<br>html</div>") } })).toBe("Only\nhtml");
  });

  test("splitAddresses handles quoted names and bare addresses", () => {
    expect(splitAddresses('"Weber, Jonas" <Jonas.W@postbox.me>, mom@Example.com , Dana <dana@lumenlabs.io>')).toEqual([
      "Weber, Jonas <jonas.w@postbox.me>",
      "mom@example.com",
      "Dana <dana@lumenlabs.io>",
    ]);
  });

  test("buildMime threads the reply and encodes UTF-8", () => {
    const mime = buildMime({
      from: "you@gmail.com",
      to: ["Jonas <jonas@x.io>"],
      cc: [],
      subject: "Re: Tırmanış?",
      body: "Varım!",
      inReplyTo: "<abc@x>",
      references: "<root@x> <abc@x>",
    });
    expect(mime).toContain("In-Reply-To: <abc@x>");
    expect(mime).toContain("References: <root@x> <abc@x>");
    expect(mime).toContain("Subject: =?UTF-8?B?");
    const body = mime.split("\r\n\r\n")[1];
    expect(Buffer.from(body, "base64").toString("utf8")).toBe("Varım!");
    expect(base64Url("a+b/c")).not.toMatch(/[+/=]/);
  });

  test("googleQuotaExceeded matches Gmail query-cost 403s", () => {
    expect(googleQuotaExceeded(`{"error":{"code":403,"message":"Quota exceeded for quota metric 'Total Query Cost'"}}`)).toBe(true);
    expect(googleQuotaExceeded(`{"error":{"status":"PERMISSION_DENIED"}}`)).toBe(false);
  });
});
