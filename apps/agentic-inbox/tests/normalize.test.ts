import { describe, expect, test } from "bun:test";
import { categorize, htmlToText, isBlankText, parseVtt } from "../server/sync/normalize.ts";

describe("parseVtt", () => {
  test("extracts speakers, timings and merges consecutive lines", () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
<v Marcus Chen>Thanks everyone.</v>

00:00:04.500 --> 00:00:07.000
<v Marcus Chen>Quick recap of the incident.</v>

00:01:10.000 --> 00:01:15.000
<v Dana Kowalski>I'll add it to the roadmap doc.</v>
`;
    const lines = parseVtt(vtt);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({ speaker: "Marcus Chen", at: 1000, text: "Thanks everyone. Quick recap of the incident." });
    expect(lines[1].speaker).toBe("Dana Kowalski");
    expect(lines[1].at).toBe(70_000);
  });

  test("tolerates cues without speaker tags", () => {
    const lines = parseVtt("WEBVTT\n\n1\n00:00.000 --> 00:02.000\nHello there\n");
    expect(lines[0]).toEqual({ speaker: "Unknown", at: 0, text: "Hello there" });
  });
});

describe("htmlToText", () => {
  test("keeps line structure and decodes entities", () => {
    expect(htmlToText("<p>Hi &amp; hello</p><div>Line<br>two</div><style>p{}</style>")).toBe("Hi & hello\nLine\ntwo");
  });
});

describe("isBlankText", () => {
  test("treats unicode spaces as empty", () => {
    expect(isBlankText(null)).toBe(true);
    expect(isBlankText("")).toBe(true);
    expect(isBlankText("  \n\t")).toBe(true);
    expect(isBlankText("\u00a0\u200b")).toBe(true);
    expect(isBlankText("ok")).toBe(false);
  });
});

describe("categorize", () => {
  test("recognises the main categories", () => {
    expect(categorize("Invoice #2041 — payment failed", "billing@hostbird.dev", "")).toBe("billing");
    expect(categorize("Invitation: Q3 roadmap sync", "marcus@x.io", "")).toBe("invite");
    expect(categorize("New sign-in to your account", "no-reply@accounts.x", "")).toBe("security");
    expect(categorize("Protocol Weekly #147", "digest@protocolweekly.dev", "unsubscribe here")).toBe("newsletter");
    expect(categorize("Export fails on large boards", "priya@x.io", "")).toBe("support");
    expect(categorize("Senior systems role at Ferrite", "sofia@ferrite.dev", "")).toBe("recruiting");
    expect(categorize("Climbing Saturday?", "jonas@postbox.me", "")).toBe("personal");
    expect(categorize("Postmortem draft", "m@x.io", "")).toBe("project");
  });
});
