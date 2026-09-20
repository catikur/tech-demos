/** HTML helpers shared by sync (flatten) and the React body pane (safe render). */

const ALLOWED = new Set([
  "p",
  "br",
  "div",
  "span",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "ul",
  "ol",
  "li",
  "a",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "pre",
  "code",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
  "hr",
]);

const VOID = new Set(["br", "hr"]);

export function looksLikeHtml(value: string | null | undefined): boolean {
  if (!value) return false;
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

export function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function pickAttr(attrs: string, name: string): string | null {
  const re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = attrs.match(re);
  return m ? (m[1] ?? m[2] ?? m[3] ?? "").trim() : null;
}

function sanitizeHref(href: string): string | null {
  const t = href.trim();
  if (/^(https?:|mailto:)/i.test(t) && !/[\s<>]/.test(t) && !/^javascript:/i.test(t)) return t;
  return null;
}

/** Allowlist sanitizer — no DOM. Unknown tags are unwrapped; scripts/images drop. */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return "";
  let s = dirty
    .replace(/\u0000/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<\/?(?:html|head|body|meta|link|xml)[^>]*>/gi, "");

  s = s.replace(/<\/?([a-zA-Z0-9:-]+)([^>]*)\/?>/g, (full, rawName: string, rawAttrs: string) => {
    const name = rawName.toLowerCase();
    const closing = full.startsWith("</");
    if (name.startsWith("o:") || name.startsWith("v:")) return "";
    if (name === "at") return closing ? "</strong>" : "<strong>";
    if (!ALLOWED.has(name)) return "";
    if (closing) return VOID.has(name) ? "" : `</${name}>`;
    if (name === "br") return "<br/>";
    if (name === "hr") return "<hr/>";
    if (name === "a") {
      const href = pickAttr(rawAttrs, "href");
      const safe = href ? sanitizeHref(href) : null;
      return safe ? `<a href="${escapeText(safe)}" rel="noreferrer noopener" target="_blank">` : "<a>";
    }
    return `<${name}>`;
  });
  return s;
}

/**
 * Plain text → safe HTML: paragraphs, lists, Outlook quoted replies.
 * Used when Graph already flattened the body (historical rows).
 */
export function textToSafeHtml(text: string): string {
  const raw = text.replace(/\r/g, "").trim();
  if (!raw) return "";
  const parts = raw.split(/\n(?=-----Original Message-----)|(?=^________________________________)/m);
  return parts
    .map((part, i) => {
      const body = i === 0 ? part : part.replace(/^-----Original Message-----/, "").trim();
      const inner = blockToHtml(body);
      return i === 0 ? inner : `<blockquote>${inner}</blockquote>`;
    })
    .join("");
}

function blockToHtml(text: string): string {
  const chunks = text.split(/\n{2,}/);
  return chunks
    .map((chunk) => {
      const lines = chunk.split("\n");
      const bullet = lines.filter((l) => l.trim()).every((l) => /^\s*[-*•]\s+/.test(l));
      const numbered = lines.filter((l) => l.trim()).every((l) => /^\s*\d+[.)]\s+/.test(l));
      if (bullet) {
        const items = lines
          .filter((l) => l.trim())
          .map((l) => `<li>${escapeText(l.replace(/^\s*[-*•]\s+/, ""))}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      if (numbered) {
        const items = lines
          .filter((l) => l.trim())
          .map((l) => `<li>${escapeText(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>`)
          .join("");
        return `<ol>${items}</ol>`;
      }
      if (/^From:\s/m.test(chunk) && /Sent:\s|Date:\s/m.test(chunk)) {
        return `<blockquote><p>${escapeText(chunk).replace(/\n/g, "<br/>")}</p></blockquote>`;
      }
      return `<p>${escapeText(chunk).replace(/\n/g, "<br/>")}</p>`;
    })
    .join("");
}

/** Pick HTML for the pane: stored html if present, else the text body. */
export function displayHtml(html: string | null | undefined, text: string): string {
  const source = html && html.trim() ? html : text;
  if (looksLikeHtml(source)) return sanitizeHtml(source);
  return textToSafeHtml(source);
}
