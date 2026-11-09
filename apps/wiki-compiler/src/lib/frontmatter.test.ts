import { describe, expect, test } from "bun:test";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.ts";

const SAMPLE = `---
title: "Studio standup — async first"
created: 2026-10-21
type: note
rating: 5
categories:
  - "[[Work]]"
tags:
  - meeting
---

Team vote: written standups.
`;

describe("frontmatter", () => {
  test("parses YAML fields, lists, and rating", () => {
    const parsed = parseFrontmatter(SAMPLE);
    expect(parsed.frontmatter.title).toBe("Studio standup — async first");
    expect(parsed.frontmatter.created).toBe("2026-10-21");
    expect(parsed.frontmatter.type).toBe("note");
    expect(parsed.frontmatter.rating).toBe(5);
    expect(parsed.frontmatter.categories).toEqual(["[[Work]]"]);
    expect(parsed.frontmatter.tags).toEqual(["meeting"]);
    expect(parsed.body.trim()).toBe("Team vote: written standups.");
  });

  test("treats documents without fences as body-only", () => {
    const parsed = parseFrontmatter("# Hello\n\nworld");
    expect(parsed.frontmatter.title).toBe("Hello");
    expect(parsed.body).toContain("world");
  });

  test("round-trips serialize → parse", () => {
    const parsed = parseFrontmatter(SAMPLE);
    const raw = serializeFrontmatter(parsed.frontmatter, parsed.body);
    const again = parseFrontmatter(raw);
    expect(again.frontmatter).toEqual(parsed.frontmatter);
    expect(again.body.trim()).toBe(parsed.body.trim());
  });

  test("parses inline list syntax", () => {
    const parsed = parseFrontmatter(`---
title: X
tags: [a, b]
---
hi
`);
    expect(parsed.frontmatter.tags).toEqual(["a", "b"]);
  });
});
