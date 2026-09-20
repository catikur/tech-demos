import { describe, expect, test } from "bun:test";
import { htmlToText } from "../server/sync/normalize.ts";
import { looksLikeHtml, sanitizeHtml, textToSafeHtml } from "../shared/html.ts";

describe("sanitizeHtml", () => {
  test("keeps lists, bold and safe links", () => {
    const html = sanitizeHtml(
      `<p>Please <b>review</b></p><ul><li>PR #1</li></ul><a href="https://conforcus.com/x">open</a>`,
    );
    expect(html).toContain("<b>review</b>");
    expect(html).toContain("<li>PR #1</li>");
    expect(html).toContain('href="https://conforcus.com/x"');
    expect(html).toContain("rel=");
  });

  test("strips scripts, styles, images and javascript URLs", () => {
    const html = sanitizeHtml(
      `<script>alert(1)</script><style>p{color:red}</style><img src="https://evil/px.gif"><a href="javascript:alert(1)">x</a><p onclick="alert(1)">ok</p>`,
    );
    expect(html.toLowerCase()).not.toContain("script");
    expect(html.toLowerCase()).not.toContain("alert");
    expect(html.toLowerCase()).not.toContain("<img");
    expect(html.toLowerCase()).not.toContain("onclick");
    expect(html).toContain("<p>ok</p>");
  });

  test("turns Teams <at> mentions into strong", () => {
    expect(sanitizeHtml(`hi <at id="1">Ada</at>`)).toContain("<strong>Ada</strong>");
  });
});

describe("looksLikeHtml + textToSafeHtml", () => {
  test("detects tags and leaves plain text", () => {
    expect(looksLikeHtml("<p>Hi</p>")).toBe(true);
    expect(looksLikeHtml("Can you send the ETA?")).toBe(false);
  });

  test("turns blank lines into paragraphs and quotes Outlook replies", () => {
    const html = textToSafeHtml("Hello Dana,\n\nPlease send the notes.\n\n-----Original Message-----\nFrom: Dana\nOld body");
    expect(html).toContain("<p>");
    expect(html).toContain("<br");
    expect(html).toContain("<blockquote>");
    expect(html).not.toContain("<script");
  });

  test("escapes raw angle brackets in plain text", () => {
    expect(textToSafeHtml("use <script> tags")).toContain("&lt;script&gt;");
  });
});

describe("htmlToText", () => {
  test("keeps line structure and decodes entities", () => {
    expect(htmlToText("<p>Hi &amp; hello</p><div>Line<br>two</div><style>p{}</style>")).toBe("Hi & hello\nLine\ntwo");
  });

  test("turns lists and links into readable text", () => {
    const text = htmlToText(`<p>Do:</p><ul><li>Review PR</li><li>Send ETA</li></ul><a href="https://ex.test/a">the doc</a>`);
    expect(text).toContain("- Review PR");
    expect(text).toContain("- Send ETA");
    expect(text).toContain("the doc (https://ex.test/a)");
  });
});
